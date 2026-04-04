use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    #[serde(rename = "isFile")]
    pub is_file: bool,
}

const SYSTEM_FILES: &[&str] = &[".DS_Store", ".localized", "Thumbs.db", "desktop.ini"];

#[tauri::command]
pub fn remove_empty_dir(path: String) -> Result<(), String> {
    let canonical = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    if !is_effectively_empty(&canonical)? {
        return Err("Directory is not empty".to_string());
    }
    std::fs::remove_dir_all(&canonical).map_err(|e| e.to_string())
}

fn is_effectively_empty(path: &Path) -> Result<bool, String> {
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let name = entry.map_err(|e| e.to_string())?.file_name();
        if !SYSTEM_FILES.contains(&name.to_string_lossy().as_ref()) {
            return Ok(false);
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let canonical = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    // --- is_effectively_empty ---

    #[test]
    fn effectively_empty_when_dir_has_no_files() {
        let dir = tempfile::tempdir().unwrap();
        assert!(is_effectively_empty(dir.path()).unwrap());
    }

    #[test]
    fn effectively_empty_when_dir_has_only_system_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::File::create(dir.path().join(".DS_Store")).unwrap();
        std::fs::File::create(dir.path().join("Thumbs.db")).unwrap();
        assert!(is_effectively_empty(dir.path()).unwrap());
    }

    #[test]
    fn not_effectively_empty_when_dir_has_subdirectory() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("subdir")).unwrap();
        assert!(!is_effectively_empty(dir.path()).unwrap());
    }

    #[test]
    fn not_effectively_empty_when_dir_has_real_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::File::create(dir.path().join("file.txt")).unwrap();
        assert!(!is_effectively_empty(dir.path()).unwrap());
    }

    #[test]
    fn not_effectively_empty_when_dir_has_real_file_among_system_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::File::create(dir.path().join(".DS_Store")).unwrap();
        std::fs::File::create(dir.path().join("file.txt")).unwrap();
        assert!(!is_effectively_empty(dir.path()).unwrap());
    }
}
