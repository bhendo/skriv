use crate::validated_path::ValidatedPath;
use tauri::Manager;

/// Format a file operation error with the validated path context.
fn file_error(op: &str, path: &ValidatedPath, err: impl std::fmt::Display) -> String {
    format!("Failed to {} '{}': {}", op, path.to_string_lossy(), err)
}

fn read_validated(validated: &ValidatedPath) -> Result<String, String> {
    std::fs::read_to_string(validated.as_path()).map_err(|e| file_error("read", validated, e))
}

#[tauri::command]
pub fn read_file(path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let validated = ValidatedPath::new(&path)?;
    crate::scope::expand_scope_for_file(&app_handle, validated.as_path())?;
    read_validated(&validated)
}

fn write_validated(validated: &ValidatedPath, content: &str) -> Result<(), String> {
    std::fs::write(validated.as_path(), content).map_err(|e| file_error("write", validated, e))
}

#[tauri::command]
pub fn write_file(
    path: String,
    content: String,
    window: tauri::Window,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Result<(), String> {
    let validated = ValidatedPath::new(&path)?;
    manager.get_state(window.label(), |state| {
        state.record_self_write();
    });
    write_validated(&validated, &content)
}

#[tauri::command]
pub fn write_new_file(
    path: String,
    content: String,
    window: tauri::Window,
    app_handle: tauri::AppHandle,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Result<(), String> {
    let validated = ValidatedPath::new_for_write(&path)?;
    write_validated(&validated, &content)?;

    // After successful write, update backend state
    let canonical = validated.as_path().to_path_buf();
    let label = window.label().to_string();
    manager.set_file_path(&label, Some(canonical));
    crate::scope::expand_scope_for_file(&app_handle, validated.as_path())?;
    manager
        .with_state_mut(&label, |state| {
            state.watch(&path, label.clone(), app_handle.clone())
        })
        .unwrap_or(Ok(()))?;

    Ok(())
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let validated = ValidatedPath::new(&path)?;
    let metadata = std::fs::metadata(validated.as_path())
        .map_err(|e| file_error("get info for", &validated, e))?;
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

#[tauri::command]
pub fn get_opened_file(
    window: tauri::Window,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Option<String> {
    manager
        .get_state(window.label(), |state| {
            state
                .file_path
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned())
        })
        .flatten()
}

#[tauri::command]
pub fn watch_file(
    path: String,
    window: tauri::Window,
    app_handle: tauri::AppHandle,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Result<(), String> {
    crate::validated_path::ValidatedPath::new(&path)?;
    let label = window.label().to_string();
    manager
        .with_state_mut(&label, |state| {
            state.watch(&path, label.clone(), app_handle.clone())
        })
        .unwrap_or(Err("Window not found".to_string()))
}

#[tauri::command]
pub fn unwatch_file(
    window: tauri::Window,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Result<(), String> {
    manager
        .with_state_mut(window.label(), |state| state.unwatch())
        .unwrap_or(Ok(()))
}

#[tauri::command]
pub async fn create_window(
    path: Option<String>,
    app_handle: tauri::AppHandle,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Result<String, String> {
    // Check if the file is already open in another window
    let canonical = if let Some(ref p) = path {
        let validated = ValidatedPath::new(p)?;
        let c = validated.as_path().to_path_buf();
        if let Some(existing_label) = manager.find_by_path(&c) {
            if let Some(win) = app_handle.get_webview_window(&existing_label) {
                let _ = win.set_focus();
            }
            return Ok(existing_label);
        }
        Some(c)
    } else {
        None
    };

    let label = manager.next_label();
    crate::window_manager::WindowManager::build_window(&app_handle, &label)?;
    manager.register(&label);

    if let Some(c) = canonical {
        manager.set_file_path(&label, Some(c));
    }

    Ok(label)
}

#[tauri::command]
pub async fn close_window(
    window: tauri::Window,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Result<(), String> {
    let label = window.label().to_string();

    manager.with_state_mut(&label, |state| {
        let _ = state.unwatch();
    });
    manager.remove(&label);

    window
        .destroy()
        .map_err(|e| format!("Failed to close window: {}", e))?;

    if manager.window_count() == 0 {
        window.app_handle().exit(0);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn read_test_file(path: &str) -> Result<String, String> {
        let validated = ValidatedPath::new(path)?;
        read_validated(&validated)
    }

    fn write_test_file(path: &str, content: &str) -> Result<(), String> {
        let validated = ValidatedPath::new(path)?;
        write_validated(&validated, content)
    }

    #[test]
    fn test_read_file_success() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();
        let result = read_test_file(&file_path.to_string_lossy());
        assert_eq!(result.unwrap(), "# Hello");
    }

    #[test]
    fn test_read_file_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();
        let result = read_test_file(&file_path.to_string_lossy());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a markdown file"));
    }

    #[test]
    fn test_read_file_not_found() {
        let result = read_test_file("/nonexistent/file.md");
        assert!(result.is_err());
    }

    #[test]
    fn test_write_file_success() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("output.md");
        fs::write(&file_path, "").unwrap(); // create first so ValidatedPath::new works
        let result = write_test_file(&file_path.to_string_lossy(), "# Written");
        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "# Written");
    }

    #[test]
    fn test_write_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("new.md");
        let validated = ValidatedPath::new_for_write(&file_path.to_string_lossy()).unwrap();
        let result = write_validated(&validated, "# New file");
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
