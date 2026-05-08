include!(concat!(env!("OUT_DIR"), "/dep_licenses.rs"));

mod watcher;

#[cfg(target_os = "macos")]
fn run_mdfind(dir: &str) -> Result<String, String> {
    let output = std::process::Command::new("mdfind")
        .args(["-onlyin", dir, "kMDItemUserTags == \"*\""])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(target_os = "macos")]
const TAGGED_FILES_NAME: &str = "tagged-files.txt";

#[cfg(target_os = "macos")]
fn group_tagged_by_dir(stdout: &str) -> std::collections::HashMap<String, Vec<String>> {
    use std::collections::HashMap;
    let mut by_dir: HashMap<String, Vec<String>> = HashMap::new();
    for line in stdout.lines() {
        let path = std::path::Path::new(line);
        if path
            .file_name()
            .map(|n| n == TAGGED_FILES_NAME)
            .unwrap_or(false)
        {
            continue;
        }
        if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
            by_dir
                .entry(parent.to_string_lossy().into_owned())
                .or_default()
                .push(name.to_string_lossy().into_owned());
        }
    }
    by_dir
}

#[tauri::command]
async fn write_tagged_files(dir: String, recursive: bool) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let stdout = run_mdfind(&dir)?;
        let mut by_dir = group_tagged_by_dir(&stdout);
        if !recursive {
            let root = dir.trim_end_matches('/');
            by_dir.retain(|k, _| k == root);
        }

        let mut written = 0usize;
        let mut unchanged = 0usize;
        let mut deleted = 0usize;

        for (dir_path, names) in &mut by_dir {
            names.sort();
            let new_content = names.join("\n") + "\n";
            let txt_path = std::path::Path::new(&dir_path).join(TAGGED_FILES_NAME);
            let existing = std::fs::read_to_string(&txt_path).unwrap_or_default();
            if existing == new_content {
                unchanged += 1;
            } else {
                std::fs::write(&txt_path, new_content).map_err(|e| e.to_string())?;
                written += 1;
            }
        }

        // Delete tagged-files.txt in directories that no longer have any tagged files
        let root = std::path::Path::new(dir.trim_end_matches('/'));
        let candidates: Vec<std::path::PathBuf> = if recursive {
            let mut paths = vec![];
            fn find_txt(dir: &std::path::Path, name: &str, out: &mut Vec<std::path::PathBuf>) {
                let Ok(entries) = std::fs::read_dir(dir) else {
                    return;
                };
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        find_txt(&path, name, out);
                    } else if path.file_name().map(|n| n == name).unwrap_or(false) {
                        out.push(path);
                    }
                }
            }
            find_txt(root, TAGGED_FILES_NAME, &mut paths);
            paths
        } else {
            let p = root.join(TAGGED_FILES_NAME);
            if p.exists() {
                vec![p]
            } else {
                vec![]
            }
        };

        for txt_path in candidates {
            let parent = txt_path.parent().unwrap().to_string_lossy().into_owned();
            if !by_dir.contains_key(&parent) {
                std::fs::remove_file(&txt_path).map_err(|e| e.to_string())?;
                deleted += 1;
            }
        }

        Ok(serde_json::json!({ "written": written, "unchanged": unchanged, "deleted": deleted }))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (dir, recursive);
        Ok(serde_json::json!({ "written": 0, "unchanged": 0 }))
    }
}

#[cfg(target_os = "macos")]
use tauri::menu::MenuItemKind;
use tauri::menu::{AboutMetadataBuilder, Menu, PredefinedMenuItem};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(watcher::ActivePids::default())
        .setup(setup)
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            watcher::check_ffmpeg,
            watcher::process_video,
            watcher::cancel_video,
            write_tagged_files
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                watcher::kill_all(&app.state::<watcher::ActivePids>());
            }
        });
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let product_name = tauri_product_name();
    let authors = env!("CARGO_PKG_AUTHORS")
        .split(':')
        .map(str::to_string)
        .collect::<Vec<_>>()
        .join(", ");

    let version_info = format!(
        "Version {}\n\nRust Dependencies:\n{}\n\nJavaScript Dependencies:\n{}",
        env!("CARGO_PKG_VERSION"),
        cargo_deps().join("\n"),
        npm_deps().join("\n"),
    );

    let icon = app
        .default_window_icon()
        .map(|img| tauri::image::Image::new_owned(img.rgba().to_vec(), img.width(), img.height()));

    let about_label = product_name.as_ref().map(|n| format!("About {n}"));
    let about = PredefinedMenuItem::about(
        app,
        about_label.as_deref(),
        Some(
            AboutMetadataBuilder::new()
                .name(product_name)
                .short_version(Some(env!("CARGO_PKG_VERSION").to_string()))
                .version(Some(version_info))
                .copyright(Some(format!("By {authors}")))
                .icon(icon)
                .build(),
        ),
    )?;

    // On Windows/Linux: build custom menu without duplicates
    // On macOS: use default menu and update it
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::menu::Submenu;

        let menu = Menu::new(app.handle())?;

        let file_menu = Submenu::new(app.handle(), "File", true)?;
        file_menu.append(&PredefinedMenuItem::quit(app, None)?)?;
        menu.append(&file_menu)?;

        let edit_menu = Submenu::new(app.handle(), "Edit", true)?;
        edit_menu.append(&PredefinedMenuItem::undo(app, None)?)?;
        edit_menu.append(&PredefinedMenuItem::redo(app, None)?)?;
        edit_menu.append(&PredefinedMenuItem::separator(app)?)?;
        edit_menu.append(&PredefinedMenuItem::cut(app, None)?)?;
        edit_menu.append(&PredefinedMenuItem::copy(app, None)?)?;
        edit_menu.append(&PredefinedMenuItem::paste(app, None)?)?;
        menu.append(&edit_menu)?;

        let help_menu = Submenu::new(app.handle(), "Help", true)?;
        help_menu.append(&about)?;
        menu.append(&help_menu)?;

        app.set_menu(menu)?;
    }

    #[cfg(target_os = "macos")]
    {
        let menu = Menu::default(app.handle())?;

        if let Some(MenuItemKind::Submenu(app_submenu)) = menu.items()?.into_iter().next() {
            let items = app_submenu.items()?;
            let about_idx = items.iter().position(|item| {
                matches!(
                    item,
                    MenuItemKind::Predefined(p) if p.text().is_ok_and(|t| t.contains("About"))
                )
            });
            if let Some(idx) = about_idx {
                app_submenu.remove_at(idx)?;
            }
            app_submenu.insert(&about, 0)?;
        }

        for item in menu.items()? {
            if let MenuItemKind::Submenu(sub) = item {
                if sub.text()? == "Help" {
                    menu.remove(&sub)?;
                    break;
                }
            }
        }

        app.set_menu(menu)?;
    }

    Ok(())
}

fn tauri_product_name() -> Option<String> {
    let json: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap_or_default();
    json.get("productName")
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

fn attach_licenses(deps: Vec<String>, licenses: &[(&str, &str)]) -> Vec<String> {
    deps.into_iter()
        .map(|dep| {
            let name = dep.split_whitespace().next().unwrap_or("");
            let license = licenses
                .iter()
                .find(|(n, _)| *n == name)
                .map(|(_, l)| *l)
                .unwrap_or("Unknown");
            format!("{dep} ({license})")
        })
        .collect()
}

fn cargo_deps() -> Vec<String> {
    attach_licenses(
        parse_cargo_deps(include_str!("../Cargo.toml")),
        CARGO_LICENSES,
    )
}

fn npm_deps() -> Vec<String> {
    attach_licenses(
        parse_npm_deps(include_str!("../../package.json")),
        NPM_LICENSES,
    )
}

fn parse_cargo_deps(content: &str) -> Vec<String> {
    let mut in_deps = false;
    let mut deps = Vec::new();
    for line in content.lines() {
        if line.starts_with("[dependencies]") {
            in_deps = true;
            continue;
        }
        if !in_deps {
            continue;
        }
        if line.starts_with('[') {
            break;
        }
        let Some((name, rest)) = line.split_once('=') else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() || name.starts_with('#') {
            continue;
        }
        let rest = rest.trim();
        let version = if rest.starts_with('"') {
            rest.trim_matches('"').to_string()
        } else if let Some(pos) = rest.find("version") {
            let after = rest[pos + 7..].trim_start_matches(|c: char| c.is_whitespace() || c == '=');
            if let Some(stripped) = after.strip_prefix('"') {
                stripped.split('"').next().unwrap_or("?").to_string()
            } else {
                "?".to_string()
            }
        } else {
            "?".to_string()
        };
        deps.push(format!("{name} {version}"));
    }
    deps
}

fn parse_npm_deps(content: &str) -> Vec<String> {
    let json: serde_json::Value = serde_json::from_str(content).unwrap_or_default();
    json.get("dependencies")
        .and_then(|d| d.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| format!("{k} {}", v.as_str().unwrap_or("?")))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_cargo_deps ---

    #[test]
    fn cargo_simple_version_string() {
        let toml = "[dependencies]\nserde = \"1.0\"\n";
        assert_eq!(parse_cargo_deps(toml), vec!["serde 1.0"]);
    }

    #[test]
    fn cargo_inline_table_version() {
        let toml = "[dependencies]\nserde = { version = \"1.0\", features = [\"derive\"] }\n";
        assert_eq!(parse_cargo_deps(toml), vec!["serde 1.0"]);
    }

    #[test]
    fn cargo_inline_table_no_version() {
        let toml = "[dependencies]\nfoo = { path = \"../foo\" }\n";
        assert_eq!(parse_cargo_deps(toml), vec!["foo ?"]);
    }

    #[test]
    fn cargo_multiple_deps() {
        let toml = "[dependencies]\nfoo = \"1.0\"\nbar = \"2.3\"\n";
        assert_eq!(parse_cargo_deps(toml), vec!["foo 1.0", "bar 2.3"]);
    }

    #[test]
    fn cargo_ignores_comment_lines() {
        // comment without '=': skipped by split_once
        let toml = "[dependencies]\n# this is a comment\nfoo = \"1.0\"\n";
        assert_eq!(parse_cargo_deps(toml), vec!["foo 1.0"]);

        // comment with '=': caught by starts_with('#') guard
        let toml = "[dependencies]\n#disabled = \"0.1\"\nfoo = \"1.0\"\n";
        assert_eq!(parse_cargo_deps(toml), vec!["foo 1.0"]);
    }

    #[test]
    fn cargo_ignores_empty_lines() {
        let toml = "[dependencies]\n\nfoo = \"1.0\"\n\nbar = \"2.0\"\n";
        assert_eq!(parse_cargo_deps(toml), vec!["foo 1.0", "bar 2.0"]);
    }

    #[test]
    fn cargo_ignores_empty_name() {
        // line starting with '=' has an empty name after trim
        let toml = "[dependencies]\n= \"1.0\"\nfoo = \"2.0\"\n";
        assert_eq!(parse_cargo_deps(toml), vec!["foo 2.0"]);
    }

    #[test]
    fn cargo_stops_at_next_section() {
        let toml = "[dependencies]\nfoo = \"1.0\"\n[build-dependencies]\nbar = \"2.0\"\n";
        assert_eq!(parse_cargo_deps(toml), vec!["foo 1.0"]);
    }

    #[test]
    fn cargo_no_dependencies_section() {
        let toml = "[package]\nname = \"test\"\n";
        assert!(parse_cargo_deps(toml).is_empty());
    }

    // --- parse_npm_deps ---

    #[test]
    fn npm_basic_dependencies() {
        let json = r#"{"dependencies": {"react": "^18.0.0", "vite": "^5.0.0"}}"#;
        let mut result = parse_npm_deps(json);
        result.sort();
        assert_eq!(result, vec!["react ^18.0.0", "vite ^5.0.0"]);
    }

    #[test]
    fn npm_non_string_value() {
        // nested objects (workspaces etc.) fall back to "?"
        let json = r#"{"dependencies": {"foo": {"version": "1.0"}}}"#;
        assert_eq!(parse_npm_deps(json), vec!["foo ?"]);
    }

    #[test]
    fn npm_no_dependencies_key() {
        let json = r#"{"devDependencies": {"typescript": "^5.0.0"}}"#;
        assert!(parse_npm_deps(json).is_empty());
    }

    #[test]
    fn npm_invalid_json() {
        assert!(parse_npm_deps("not json at all").is_empty());
    }

    #[test]
    fn npm_empty_dependencies() {
        let json = r#"{"dependencies": {}}"#;
        assert!(parse_npm_deps(json).is_empty());
    }

    // --- group_tagged_by_dir ---

    #[cfg(target_os = "macos")]
    #[test]
    fn group_tagged_groups_by_parent() {
        let stdout = "/photos/img.raf\n/photos/img.jpg\n/videos/clip.mov\n";
        let result = group_tagged_by_dir(stdout);
        let mut photos = result["/photos"].clone();
        photos.sort();
        assert_eq!(photos, vec!["img.jpg", "img.raf"]);
        assert_eq!(result["/videos"], vec!["clip.mov"]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn group_tagged_excludes_tagged_files_txt() {
        let stdout = "/photos/img.raf\n/photos/tagged-files.txt\n/photos/img.jpg\n";
        let result = group_tagged_by_dir(stdout);
        let photos = &result["/photos"];
        assert!(!photos.contains(&"tagged-files.txt".to_string()));
        assert_eq!(photos.len(), 2);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn group_tagged_empty_input() {
        assert!(group_tagged_by_dir("").is_empty());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn group_tagged_single_file() {
        let stdout = "/photos/img.raf\n";
        let result = group_tagged_by_dir(stdout);
        assert_eq!(result["/photos"], vec!["img.raf"]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn group_tagged_multiple_dirs() {
        let stdout = "/a/x.raf\n/b/y.xmp\n/a/z.aae\n";
        let result = group_tagged_by_dir(stdout);
        assert_eq!(result.len(), 2);
        let mut a = result["/a"].clone();
        a.sort();
        assert_eq!(a, vec!["x.raf", "z.aae"]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn write_tagged_non_recursive_only_root() {
        let stdout = "/photos/img.raf\n/photos/2024/img.jpg\n";
        let mut by_dir = group_tagged_by_dir(stdout);
        let root = "/photos";
        by_dir.retain(|k, _| k == root);
        assert!(by_dir.contains_key("/photos"));
        assert!(!by_dir.contains_key("/photos/2024"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn group_tagged_ignores_blank_lines() {
        let stdout = "/photos/img.raf\n\n/photos/img.jpg\n";
        let result = group_tagged_by_dir(stdout);
        // blank line has no parent/name → skipped
        assert_eq!(result["/photos"].len(), 2);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn write_tagged_recursive_keeps_subdirs() {
        let stdout = "/photos/img.raf\n/photos/2024/img.jpg\n";
        let by_dir = group_tagged_by_dir(stdout);
        // recursive=true: no retain → subdirs kept
        assert!(by_dir.contains_key("/photos"));
        assert!(by_dir.contains_key("/photos/2024"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn write_tagged_content_is_sorted_with_trailing_newline() {
        let stdout = "/photos/c.raf\n/photos/a.jpg\n/photos/b.xmp\n";
        let result = group_tagged_by_dir(stdout);
        let mut names = result["/photos"].clone();
        names.sort();
        let content = names.join("\n") + "\n";
        assert_eq!(content, "a.jpg\nb.xmp\nc.raf\n");
    }
}
