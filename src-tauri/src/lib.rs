use serde::Serialize;
use std::path::Path;
use tauri::menu::{AboutMetadataBuilder, Menu, MenuItem, MenuItemKind, PredefinedMenuItem};

#[derive(Serialize)]
struct DirEntry {
    name: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
    #[serde(rename = "isFile")]
    is_file: bool,
}

#[tauri::command]
fn remove_dir(path: String) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let canonical = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&home) {
        return Err("Path is outside home directory".to_string());
    }
    std::fs::remove_dir_all(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let canonical = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&home) {
        return Err("Path is outside home directory".to_string());
    }
    std::fs::read_dir(&canonical)
        .map_err(|e| e.to_string())?
        .map(|entry| {
            let entry = entry.map_err(|e| e.to_string())?;
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            Ok(DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_directory: metadata.is_dir(),
                is_file: metadata.is_file(),
            })
        })
        .collect()
}

fn cargo_deps() -> Vec<String> {
    let content = include_str!("../Cargo.toml");
    let mut in_deps = false;
    let mut deps = Vec::new();
    for line in content.lines() {
        if line.starts_with("[dependencies]") {
            in_deps = true;
            continue;
        }
        if in_deps {
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
                let after =
                    rest[pos + 7..].trim_start_matches(|c: char| c.is_whitespace() || c == '=');
                if after.starts_with('"') {
                    after[1..].split('"').next().unwrap_or("?").to_string()
                } else {
                    "?".to_string()
                }
            } else {
                "?".to_string()
            };
            deps.push(format!("{name} {version}"));
        }
    }
    deps
}

fn npm_deps() -> Vec<String> {
    let content = include_str!("../../package.json");
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let authors = env!("CARGO_PKG_AUTHORS")
                .split(':')
                .map(str::to_string)
                .collect::<Vec<_>>()
                .join(", ");
            let credits = format!(
                "Rust: {}\n\nJS: {}",
                cargo_deps().join(", "),
                npm_deps().join(", "),
            );
            let icon = app.default_window_icon().map(|img| {
                tauri::image::Image::new_owned(img.rgba().to_vec(), img.width(), img.height())
            });
            let about = PredefinedMenuItem::about(
                app,
                None,
                Some(
                    AboutMetadataBuilder::new()
                        .name(Some(env!("CARGO_PKG_NAME")))
                        .short_version(Some(env!("CARGO_PKG_VERSION")))
                        .version(Some(String::new()))
                        .copyright(Some(format!("By {authors}")))
                        .credits(Some(credits))
                        .icon(icon)
                        .build(),
                ),
            )?;
            let menu = Menu::default(app.handle())?;
            // Replace the default About item in the app menu (first submenu, first item)
            if let Some(MenuItemKind::Submenu(app_submenu)) = menu.items()?.into_iter().next() {
                app_submenu.remove_at(0)?;
                app_submenu.insert(&about, 0)?;
            }
            // Add a non-functional item to the Help menu
            for item in menu.items()? {
                if let MenuItemKind::Submenu(sub) = item {
                    if sub.text()? == "Help" {
                        sub.append(&MenuItem::new(
                            app,
                            "There is no help :(",
                            false,
                            None::<&str>,
                        )?)?;
                        break;
                    }
                }
            }
            app.set_menu(menu)?;
            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_dir, remove_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
