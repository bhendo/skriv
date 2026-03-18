use crate::validated_path::ValidatedPath;

/// Core read logic shared by the command and tests.
#[cfg(test)]
fn read_file_inner(path: &str) -> Result<String, String> {
    let validated = ValidatedPath::new(path)?;
    std::fs::read_to_string(validated.as_path())
        .map_err(|e| format!("Failed to read '{}': {}", validated.to_string_lossy(), e))
}

#[tauri::command]
pub fn read_file(path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let validated = ValidatedPath::new(&path)?;
    // Expand asset protocol scope to the file's directory for image loading
    crate::scope::expand_scope_for_file(&app_handle, validated.as_path())?;
    std::fs::read_to_string(validated.as_path())
        .map_err(|e| format!("Failed to read '{}': {}", validated.to_string_lossy(), e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let validated = ValidatedPath::new(&path)?;
    std::fs::write(validated.as_path(), &content)
        .map_err(|e| format!("Failed to write '{}': {}", validated.to_string_lossy(), e))
}

#[tauri::command]
pub fn write_new_file(path: String, content: String) -> Result<(), String> {
    let validated = ValidatedPath::new_for_write(&path)?;
    std::fs::write(validated.as_path(), &content)
        .map_err(|e| format!("Failed to write '{}': {}", validated.to_string_lossy(), e))
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let validated = ValidatedPath::new(&path)?;
    let metadata = std::fs::metadata(validated.as_path()).map_err(|e| {
        format!(
            "Failed to get info for '{}': {}",
            validated.to_string_lossy(),
            e
        )
    })?;
    let name = validated
        .as_path()
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let dir = validated
        .parent_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let modified = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    Ok(FileInfo {
        name,
        dir,
        modified,
    })
}

#[derive(serde::Serialize)]
pub struct FileInfo {
    pub name: String,
    pub dir: String,
    pub modified: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_read_file_success() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();
        let result = read_file_inner(&file_path.to_string_lossy());
        assert_eq!(result.unwrap(), "# Hello");
    }

    #[test]
    fn test_read_file_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();
        let result = read_file_inner(&file_path.to_string_lossy());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a markdown file"));
    }

    #[test]
    fn test_read_file_not_found() {
        let result = read_file_inner("/nonexistent/file.md");
        assert!(result.is_err());
    }

    #[test]
    fn test_write_file_success() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("output.md");
        fs::write(&file_path, "").unwrap(); // create first so ValidatedPath::new works
        let result = write_file(
            file_path.to_string_lossy().to_string(),
            "# Written".to_string(),
        );
        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "# Written");
    }

    #[test]
    fn test_write_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("new.md");
        let result = write_new_file(
            file_path.to_string_lossy().to_string(),
            "# New file".to_string(),
        );
        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "# New file");
    }

    #[test]
    fn test_get_file_info() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("info.md");
        fs::write(&file_path, "content").unwrap();
        let result = get_file_info(file_path.to_string_lossy().to_string());
        let info = result.unwrap();
        assert_eq!(info.name, "info.md");
        assert!(info.modified > 0);
    }
}
