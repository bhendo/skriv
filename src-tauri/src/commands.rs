use crate::validated_path::ValidatedPath;
use tauri::Manager;

/// Format a file operation error with the validated path context.
fn file_error(op: &str, path: &ValidatedPath, err: impl std::fmt::Display) -> String {
    format!("Failed to {} '{}': {}", op, path.to_string_lossy(), err)
}

fn read_validated(validated: &ValidatedPath) -> Result<String, String> {
    std::fs::read_to_string(validated.as_path()).map_err(|e| file_error("read", validated, e))
}

/// Open a document in this window: read it, watch it, and update the
/// path→window mapping as one operation. The mapping changes only after
/// both the read and the watch have succeeded (watch_and_track), and a
/// failed open drops a pre-claimed mapping that was never fulfilled
/// (release_unfulfilled_claim), so a partial failure can never leave the
/// mapping claiming a file the window doesn't show.
///
/// `record_recent` is false for reload-after-external-change, which re-opens
/// the same path and would otherwise pollute the recents list.
#[tauri::command]
pub fn open_document(
    path: String,
    record_recent: bool,
    window: tauri::Window,
    app_handle: tauri::AppHandle,
    manager: tauri::State<'_, crate::window_manager::WindowManager>,
) -> Result<String, String> {
    let validated = ValidatedPath::new(&path)?;
    let label = window.label().to_string();

    let result: Result<String, String> = (|| {
        crate::scope::expand_scope_for_file(&app_handle, validated.as_path())?;
        let content = read_validated(&validated)?;
        manager.watch_and_track(&label, validated.as_path(), app_handle.clone())?;
        Ok(content)
    })();

    match result {
        Ok(content) => {
            if record_recent {
                crate::recents::record_open(&app_handle, validated.as_path());
            }
            crate::platform::set_represented_filename(&window, validated.as_path());
            Ok(content)
        }
        Err(e) => {
            manager.release_unfulfilled_claim(&label, validated.as_path());
            Err(e)
        }
    }
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
    let label = window.label().to_string();
    crate::scope::expand_scope_for_file(&app_handle, validated.as_path())?;
    manager.watch_and_track(&label, validated.as_path(), app_handle.clone())?;
    // Save As creates a file that was never read — record it as recent here.
    crate::recents::record_open(&app_handle, validated.as_path());
    crate::platform::set_represented_filename(&window, validated.as_path());

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

/// Focus the window that already has `path` open, if it is a different window.
/// Returns true when focus was transferred (the caller should not re-open the file).
#[tauri::command]
pub fn focus_existing_window(
    path: String,
    window: tauri::Window,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let validated = ValidatedPath::new(&path)?;
    Ok(
        crate::window_manager::focus_window_for_path(&app_handle, validated.as_path())
            .is_some_and(|label| label != window.label()),
    )
}

#[derive(Debug, serde::Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
}

/// List the markdown files in the directory containing `path` (the currently
/// open file). Non-recursive; sorted case-insensitively by name.
/// Async so the directory scan stays off the main thread.
#[tauri::command]
pub async fn list_markdown_files(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let validated = ValidatedPath::new(&path)?;
    let dir = validated
        .parent_dir()
        .ok_or("File has no parent directory")?;

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read directory '{}': {}", dir.display(), e))?;

    let mut files: Vec<DirEntryInfo> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let entry_path = entry.path();
            if !crate::validated_path::has_markdown_extension(&entry_path) {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() {
                return None;
            }
            Some(DirEntryInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry_path.to_string_lossy().to_string(),
            })
        })
        .collect();

    files.sort_by_cached_key(|f| f.name.to_lowercase());
    Ok(files)
}

/// Async so the exists() prune sweep stays off the main thread (a stale entry
/// on an unreachable network mount can block for seconds).
#[tauri::command]
pub async fn get_recent_files(
    store: tauri::State<'_, crate::recents::RecentsStore>,
) -> Result<Vec<String>, String> {
    Ok(store.list())
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
    fn test_read_validated_success() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();
        let result = read_test_file(&file_path.to_string_lossy());
        assert_eq!(result.unwrap(), "# Hello");
    }

    #[test]
    fn test_read_validated_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();
        let result = read_test_file(&file_path.to_string_lossy());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a markdown file"));
    }

    #[test]
    fn test_read_validated_not_found() {
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

    fn list_markdown_files_blocking(path: String) -> Result<Vec<DirEntryInfo>, String> {
        tauri::async_runtime::block_on(list_markdown_files(path))
    }

    #[test]
    fn test_list_markdown_files_filters_and_sorts() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Beta.md"), "").unwrap();
        fs::write(dir.path().join("alpha.markdown"), "").unwrap();
        fs::write(dir.path().join("notes.txt"), "").unwrap();
        fs::create_dir(dir.path().join("subdir.md")).unwrap();
        let open_file = dir.path().join("current.md");
        fs::write(&open_file, "# open").unwrap();

        let result = list_markdown_files_blocking(open_file.to_string_lossy().to_string()).unwrap();
        let names: Vec<&str> = result.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["alpha.markdown", "Beta.md", "current.md"]);
        assert!(result.iter().all(|e| e.path.ends_with(&e.name)));
    }

    // Regression for #96: dot-directories are ordinary directories — the
    // sensitive-dir blocklist that rejected them was removed.
    #[test]
    fn test_list_markdown_files_allows_dot_dir() {
        let dir = tempfile::tempdir().unwrap();
        let dot_dir = dir.path().join(".config");
        fs::create_dir(&dot_dir).unwrap();
        let file_path = dot_dir.join("notes.md");
        fs::write(&file_path, "").unwrap();

        let result = list_markdown_files_blocking(file_path.to_string_lossy().to_string()).unwrap();
        let names: Vec<&str> = result.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["notes.md"]);
    }

    #[test]
    fn test_list_markdown_files_nonexistent_input() {
        let result = list_markdown_files_blocking("/nonexistent/file.md".to_string());
        assert!(result.is_err());
    }
}
