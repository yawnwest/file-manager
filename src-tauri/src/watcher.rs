use std::collections::HashSet;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::State;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

pub type ActivePids = Arc<Mutex<HashSet<u32>>>;

fn find_binary(name: &str, candidates: &[&str]) -> Command {
    for path in candidates {
        if cfg!(target_os = "macos") && Path::new(path).exists() {
            return Command::new(path);
        }
    }
    Command::new(name)
}

fn ffmpeg_command() -> Command {
    find_binary(
        "ffmpeg",
        &[
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ],
    )
}

fn ffprobe_command() -> Command {
    find_binary(
        "ffprobe",
        &[
            "/opt/homebrew/bin/ffprobe",
            "/usr/local/bin/ffprobe",
            "/usr/bin/ffprobe",
        ],
    )
}

async fn detect_video_codec(input: &str) -> Result<String, String> {
    let output = ffprobe_command()
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            input,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn rotate_codec_args(codec: &str) -> Vec<&'static str> {
    match codec {
        "h264" => vec!["-c:v", "libx264", "-crf", "18"],
        "hevc" => vec!["-c:v", "libx265", "-crf", "18"],
        "vp9" => vec!["-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0"],
        "prores" => vec!["-c:v", "prores_ks", "-profile:v", "3"],
        "mjpeg" => vec!["-c:v", "mjpeg", "-q:v", "2"],
        "theora" => vec!["-c:v", "libtheora", "-q:v", "7"],
        "mpeg2video" => vec!["-c:v", "mpeg2video", "-q:v", "2"],
        "wmv1" | "wmv2" | "wmv3" => vec!["-c:v", "wmv2", "-q:v", "2"],
        _ => vec!["-c:v", "libx264", "-crf", "18"],
    }
}

async fn run_ffmpeg(mut cmd: Command, tmp_output: &str, pids: &ActivePids) -> Result<(), String> {
    cmd.arg(tmp_output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    let pid = child
        .id()
        .ok_or_else(|| "Failed to get ffmpeg PID".to_string())?;
    pids.lock().unwrap().insert(pid);

    let output = match timeout(Duration::from_secs(30 * 60), child.wait_with_output()).await {
        Ok(result) => result.map_err(|e| format!("ffmpeg error: {}", e))?,
        Err(_) => {
            kill_all(pids);
            pids.lock().unwrap().remove(&pid);
            let _ = tokio::fs::remove_file(tmp_output).await;
            return Err("ffmpeg timed out after 30 minutes".to_string());
        }
    };

    pids.lock().unwrap().remove(&pid);

    if !output.status.success() {
        let _ = tokio::fs::remove_file(tmp_output).await;
        let stderr = String::from_utf8_lossy(&output.stderr);
        let last_line = stderr.lines().last().unwrap_or("").trim().to_string();
        return Err(if last_line.is_empty() {
            format!(
                "ffmpeg exited with code {}",
                output.status.code().unwrap_or(-1)
            )
        } else {
            last_line
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn check_ffmpeg() -> Result<(), String> {
    ffmpeg_command()
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map_err(|_| "ffmpeg is not installed or not found in PATH".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn cancel_video(pids: State<'_, ActivePids>) -> Result<(), String> {
    kill_all(&pids);
    Ok(())
}

pub fn kill_all(pids: &ActivePids) {
    let pids = pids.lock().unwrap().clone();
    for pid in pids {
        kill_pid(pid);
    }
}

#[cfg(unix)]
fn kill_pid(pid: u32) {
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(windows)]
fn kill_pid(pid: u32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .output();
}

async fn unique_output_path(output_dir: &str, filename: &str) -> String {
    let path = Path::new(filename);
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let candidate = format!("{}/{}", output_dir, filename);
    if !tokio::fs::try_exists(&candidate).await.unwrap_or(false) {
        return candidate;
    }

    let mut counter = 1u32;
    loop {
        let candidate = format!("{}/{} ({}){}", output_dir, stem, counter, ext);
        if !tokio::fs::try_exists(&candidate).await.unwrap_or(false) {
            return candidate;
        }
        counter += 1;
    }
}

#[tauri::command]
pub async fn process_video(
    input: String,
    operation: String,
    tmp_dir: String,
    output_dir: String,
    pids: State<'_, ActivePids>,
) -> Result<Option<String>, String> {
    let filename = Path::new(&input)
        .file_name()
        .ok_or_else(|| "Invalid input path".to_string())?
        .to_string_lossy()
        .to_string();

    let tmp_output = format!("{}/{}_{}", tmp_dir, operation, filename);
    let output_path = unique_output_path(&output_dir, &filename).await;

    let mut cmd = ffmpeg_command();
    cmd.arg("-y").arg("-i").arg(&input);

    match operation.as_str() {
        "rotate_left" | "rotate_right" => {
            let transpose = if operation == "rotate_left" {
                "transpose=2"
            } else {
                "transpose=1"
            };
            let codec = detect_video_codec(&input).await.unwrap_or_default();
            cmd.args(["-vf", transpose]);
            cmd.args(rotate_codec_args(&codec));
            cmd.args(["-c:a", "copy"]);
        }
        "fix" => {
            cmd.args([
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "-fflags",
                "+genpts",
            ]);
        }
        _ => return Err(format!("Unknown operation: {}", operation)),
    }

    run_ffmpeg(cmd, &tmp_output, &pids).await?;

    tokio::fs::rename(&tmp_output, &output_path)
        .await
        .map_err(|e| format!("Failed to move output: {}", e))?;

    let output_meta = tokio::fs::metadata(&output_path)
        .await
        .map_err(|e| format!("Output verification failed: {}", e))?;
    if output_meta.len() == 0 {
        return Err("Output file is empty after processing, input not deleted".to_string());
    }

    if let Err(e) = tokio::fs::remove_file(&input).await {
        return Ok(Some(format!("Input could not be deleted: {}", e)));
    }

    Ok(None)
}
