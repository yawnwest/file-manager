include!(concat!(env!("OUT_DIR"), "/dep_licenses.rs"));

#[cfg(target_os = "macos")]
use tauri::menu::MenuItemKind;
use tauri::menu::{AboutMetadataBuilder, Menu, PredefinedMenuItem};

pub fn run() {
    tauri::Builder::default()
        .setup(setup)
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
}
