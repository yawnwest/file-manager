fn main() {
    tauri_build::build();
    generate_dep_licenses();
}

fn generate_dep_licenses() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());

    println!("cargo:rerun-if-changed=Cargo.lock");
    println!("cargo:rerun-if-changed=../package.json");

    // Collect Rust dep licenses via cargo metadata
    let output = std::process::Command::new(&cargo)
        .args(["metadata", "--format-version", "1"])
        .output()
        .expect("cargo metadata failed");

    let metadata: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap_or_default();

    let mut cargo_licenses: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    if let Some(packages) = metadata.get("packages").and_then(|p| p.as_array()) {
        for pkg in packages {
            if let (Some(name), Some(license)) = (
                pkg.get("name").and_then(|n| n.as_str()),
                pkg.get("license").and_then(|l| l.as_str()),
            ) {
                cargo_licenses.insert(name.to_string(), license.to_string());
            }
        }
    }

    // Collect npm dep licenses from node_modules
    let node_modules = std::path::Path::new(&manifest_dir).join("../node_modules");
    let pkg_json_path = std::path::Path::new(&manifest_dir).join("../package.json");
    let mut npm_licenses: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    if let Ok(content) = std::fs::read_to_string(&pkg_json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(deps) = json.get("dependencies").and_then(|d| d.as_object()) {
                for name in deps.keys() {
                    let pkg_json = node_modules.join(name).join("package.json");
                    if let Ok(pkg_content) = std::fs::read_to_string(&pkg_json) {
                        if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&pkg_content) {
                            if let Some(license) = pkg.get("license").and_then(|l| l.as_str()) {
                                npm_licenses.insert(name.clone(), license.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Generate dep_licenses.rs
    let escape = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");

    let mut code = String::from("static CARGO_LICENSES: &[(&str, &str)] = &[\n");
    let mut cargo_entries: Vec<_> = cargo_licenses.iter().collect();
    cargo_entries.sort_by_key(|(k, _)| k.as_str());
    for (name, license) in cargo_entries {
        code.push_str(&format!(
            "    (\"{}\", \"{}\"),\n",
            escape(name),
            escape(license)
        ));
    }
    code.push_str("];\n\nstatic NPM_LICENSES: &[(&str, &str)] = &[\n");
    let mut npm_entries: Vec<_> = npm_licenses.iter().collect();
    npm_entries.sort_by_key(|(k, _)| k.as_str());
    for (name, license) in npm_entries {
        code.push_str(&format!(
            "    (\"{}\", \"{}\"),\n",
            escape(name),
            escape(license)
        ));
    }
    code.push_str("];\n");

    std::fs::write(format!("{out_dir}/dep_licenses.rs"), code).unwrap();
}
