use std::collections::HashSet;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::State;
use tokio::process::Command;

pub type ActivePids = Arc<Mutex<HashSet<u32>>>;

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

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(&input);

    match operation.as_str() {
        "rotate_left" => {
            cmd.args(["-vf", "transpose=2"]);
        }
        "rotate_right" => {
            cmd.args(["-vf", "transpose=1"]);
        }
        "fix" => {
            cmd.args([
                "-c:v",
                "libx264",
                "-crf",
                "18",
                "-g",
                "30",
                "-keyint_min",
                "30",
                "-sc_threshold",
                "0",
                "-c:a",
                "copy",
            ]);
        }
        _ => return Err(format!("Unknown operation: {}", operation)),
    }

    cmd.arg(&tmp_output);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    let pid = child
        .id()
        .ok_or_else(|| "Failed to get ffmpeg PID".to_string())?;
    pids.lock().unwrap().insert(pid);

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("ffmpeg error: {}", e));

    pids.lock().unwrap().remove(&pid);

    let output = output?;

    if !output.status.success() {
        let _ = tokio::fs::remove_file(&tmp_output).await;
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

    tokio::fs::rename(&tmp_output, &output_path)
        .await
        .map_err(|e| format!("Failed to move output: {}", e))?;

    if let Err(e) = tokio::fs::remove_file(&input).await {
        return Ok(Some(format!("Input could not be deleted: {}", e)));
    }

    Ok(None)
}
