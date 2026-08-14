use std::path::Path;
use tauri::Manager;

/// Asset-protocol scope policy: canonicalize, and refuse the filesystem root.
/// Scope entries must be canonical for the protocol's path matching, and
/// allowing `/` — even non-recursively — would expose every root-level file
/// to the webview, so a markdown file directly at the root cannot be opened.
fn authorize_scope_dir(dir: &Path) -> Result<std::path::PathBuf, String> {
    let canonical_dir = dir
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize directory: {}", e))?;

    if canonical_dir.parent().is_none() {
        return Err("Cannot access root directory".into());
    }

    Ok(canonical_dir)
}

/// Expand the asset protocol scope to include the parent directory of the opened file.
/// This is called internally from Rust — never exposed as a Tauri command.
pub fn expand_scope_for_file(app: &tauri::AppHandle, file_path: &Path) -> Result<(), String> {
    let dir = file_path.parent().ok_or("File has no parent directory")?;
    let canonical_dir = authorize_scope_dir(dir)?;

    let scope = app.asset_protocol_scope();

    // Add the directory (non-recursive — only files directly in this directory)
    scope
        .allow_directory(&canonical_dir, false)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    // Regression for #96: dot-directories (.config, .ssh, tool scratchpads)
    // must be authorized like any other directory.
    #[test]
    fn authorizes_directories_regardless_of_name() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["docs", ".config", ".ssh", ".claude"] {
            let sub_dir = dir.path().join(name).join("notes");
            fs::create_dir_all(&sub_dir).unwrap();
            let result = authorize_scope_dir(&sub_dir);
            assert!(result.is_ok(), "expected {} to be authorized", name);
        }
    }

    #[test]
    fn rejects_root_directory() {
        let result = authorize_scope_dir(&PathBuf::from("/"));
        assert!(result.unwrap_err().contains("root"));
    }

    #[test]
    fn rejects_nonexistent_directory() {
        let result = authorize_scope_dir(&PathBuf::from("/nonexistent/dir"));
        assert!(result.unwrap_err().contains("canonicalize"));
    }
}
