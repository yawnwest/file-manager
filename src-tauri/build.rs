use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::process::Command;

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

    let cargo_licenses = collect_cargo_licenses(&cargo);
    let npm_licenses = collect_npm_licenses(&manifest_dir);

    let mut code = String::from("static CARGO_LICENSES: &[(&str, &str)] = &[\n");
    write_license_entries(&mut code, &cargo_licenses);
    code.push_str("];\n\nstatic NPM_LICENSES: &[(&str, &str)] = &[\n");
    write_license_entries(&mut code, &npm_licenses);
    code.push_str("];\n");

    fs::write(format!("{out_dir}/dep_licenses.rs"), code).unwrap();
}

fn collect_cargo_licenses(cargo: &str) -> BTreeMap<String, String> {
    let output = Command::new(cargo)
        .args(["metadata", "--format-version", "1"])
        .output()
        .expect("cargo metadata failed");

    let metadata: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap_or_default();

    let mut licenses = BTreeMap::new();
    if let Some(packages) = metadata.get("packages").and_then(|p| p.as_array()) {
        for pkg in packages {
            if let (Some(name), Some(license)) = (
                pkg.get("name").and_then(|n| n.as_str()),
                pkg.get("license").and_then(|l| l.as_str()),
            ) {
                licenses.insert(name.to_string(), license.to_string());
            }
        }
    }
    licenses
}

fn collect_npm_licenses(manifest_dir: &str) -> BTreeMap<String, String> {
    let base = Path::new(manifest_dir).join("..");
    let pkg_json_path = base.join("package.json");
    let node_modules = base.join("node_modules");

    let Ok(content) = fs::read_to_string(&pkg_json_path) else {
        return BTreeMap::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return BTreeMap::new();
    };
    let Some(deps) = json.get("dependencies").and_then(|d| d.as_object()) else {
        return BTreeMap::new();
    };

    let mut licenses = BTreeMap::new();
    for name in deps.keys() {
        let pkg_json = node_modules.join(name).join("package.json");
        if let Ok(pkg_content) = fs::read_to_string(&pkg_json) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&pkg_content) {
                if let Some(license) = pkg.get("license").and_then(|l| l.as_str()) {
                    licenses.insert(name.clone(), license.to_string());
                }
            }
        }
    }
    licenses
}

fn write_license_entries(code: &mut String, entries: &BTreeMap<String, String>) {
    for (name, license) in entries {
        code.push_str(&format!(
            "    (\"{}\", \"{}\"),\n",
            escape(name),
            escape(license)
        ));
    }
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- escape ---

    #[test]
    fn escape_plain_string() {
        assert_eq!(escape("MIT"), "MIT");
    }

    #[test]
    fn escape_backslash() {
        assert_eq!(escape("foo\\bar"), "foo\\\\bar");
    }

    #[test]
    fn escape_double_quote() {
        assert_eq!(escape("Apache \"2.0\""), "Apache \\\"2.0\\\"");
    }

    #[test]
    fn escape_both() {
        assert_eq!(escape("a\\\"b"), "a\\\\\\\"b");
    }

    // --- write_license_entries ---

    #[test]
    fn write_license_entries_empty() {
        let mut code = String::new();
        write_license_entries(&mut code, &BTreeMap::new());
        assert_eq!(code, "");
    }

    #[test]
    fn write_license_entries_single() {
        let mut entries = BTreeMap::new();
        entries.insert("serde".to_string(), "MIT OR Apache-2.0".to_string());
        let mut code = String::new();
        write_license_entries(&mut code, &entries);
        assert_eq!(code, "    (\"serde\", \"MIT OR Apache-2.0\"),\n");
    }

    #[test]
    fn write_license_entries_sorted() {
        let mut entries = BTreeMap::new();
        entries.insert("zlib".to_string(), "Zlib".to_string());
        entries.insert("aaa".to_string(), "MIT".to_string());
        let mut code = String::new();
        write_license_entries(&mut code, &entries);
        assert_eq!(code, "    (\"aaa\", \"MIT\"),\n    (\"zlib\", \"Zlib\"),\n");
    }

    #[test]
    fn write_license_entries_escapes_quotes() {
        let mut entries = BTreeMap::new();
        entries.insert("pkg".to_string(), "Apache \"2.0\"".to_string());
        let mut code = String::new();
        write_license_entries(&mut code, &entries);
        assert_eq!(code, "    (\"pkg\", \"Apache \\\"2.0\\\"\"),\n");
    }
}
