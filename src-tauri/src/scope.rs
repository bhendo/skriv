use std::path::Path;
use tauri::Manager;

const SENSITIVE_DIRS: &[&str] = &[".ssh", ".gnupg", ".aws", ".config", ".kube"];

/// Check whether any component of `dir` (or `dir` itself) is a sensitive directory.
fn is_inside_sensitive_dir(dir: &Path) -> bool {
    for ancestor in dir.ancestors() {
        if let Some(name) = ancestor.file_name() {
            if let Some(name_str) = name.to_str() {
                if SENSITIVE_DIRS.contains(&name_str) {
                    return true;
                }
            }
        }
    }
    false
}

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

    // Reject if the directory itself is inside a sensitive path
    if is_inside_sensitive_dir(&canonical_dir) {
        return Err(format!(
            "Cannot open files in sensitive directory: {}",
            canonical_dir.display()
        ));
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn detects_direct_sensitive_dir() {
        assert!(is_inside_sensitive_dir(&PathBuf::from("/home/user/.ssh")));
        assert!(is_inside_sensitive_dir(&PathBuf::from("/home/user/.gnupg")));
        assert!(is_inside_sensitive_dir(&PathBuf::from("/home/user/.aws")));
        assert!(is_inside_sensitive_dir(&PathBuf::from(
            "/home/user/.config"
        )));
        assert!(is_inside_sensitive_dir(&PathBuf::from("/home/user/.kube")));
    }

    #[test]
    fn detects_nested_sensitive_dir() {
        assert!(is_inside_sensitive_dir(&PathBuf::from(
            "/home/user/.ssh/keys"
        )));
        assert!(is_inside_sensitive_dir(&PathBuf::from(
            "/home/user/.aws/sso/cache"
        )));
    }

    #[test]
    fn allows_normal_directories() {
        assert!(!is_inside_sensitive_dir(&PathBuf::from("/home/user/docs")));
        assert!(!is_inside_sensitive_dir(&PathBuf::from(
            "/home/user/projects/my-app"
        )));
        assert!(!is_inside_sensitive_dir(&PathBuf::from("/tmp")));
    }
}
