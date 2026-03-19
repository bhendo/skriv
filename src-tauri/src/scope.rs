use std::path::Path;
use tauri::Manager;

const SENSITIVE_DIRS: &[&str] = &[".ssh", ".gnupg", ".aws", ".config", ".kube"];

/// Expand the asset protocol scope to include the parent directory of the opened file.
/// This is called internally from Rust — never exposed as a Tauri command.
pub fn expand_scope_for_file(app: &tauri::AppHandle, file_path: &Path) -> Result<(), String> {
    let dir = file_path.parent().ok_or("File has no parent directory")?;

    let canonical_dir = dir
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize directory: {}", e))?;

    // Block root-level directories
    if canonical_dir.parent().is_none() {
        return Err("Cannot scope root directory".into());
    }

    let scope = app.asset_protocol_scope();

    // Add the directory (non-recursive — only files directly in this directory)
    scope
        .allow_directory(&canonical_dir, false)
        .map_err(|e| e.to_string())?;

    // Forbid sensitive subdirectories as defense-in-depth.
    // Always call forbid_directory regardless of existence to avoid TOCTOU races.
    for sensitive in SENSITIVE_DIRS {
        let _ = scope.forbid_directory(canonical_dir.join(sensitive), true);
    }

    Ok(())
}
