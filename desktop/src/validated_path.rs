use std::path::{Path, PathBuf};

const ALLOWED_EXTENSIONS: &[&str] = &["md", "markdown"];

/// A validated, canonicalized file path restricted to markdown files.
/// All file I/O commands must use this type instead of raw String paths.
#[derive(Debug, Clone)]
pub struct ValidatedPath {
    inner: PathBuf,
}

fn validate_extension(path: &Path) -> Result<(), String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if !ALLOWED_EXTENSIONS.contains(&ext) {
        return Err(format!(
            "File '{}' is not a markdown file (expected .md or .markdown)",
            path.display()
        ));
    }
    Ok(())
}

impl ValidatedPath {
    /// Validate and canonicalize a path string.
    /// Returns an error if:
    /// - The path cannot be canonicalized (doesn't exist or permission denied)
    /// - The file extension is not a markdown extension
    pub fn new(path: &str) -> Result<Self, String> {
        let path = PathBuf::from(path);
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Invalid path '{}': {}", path.display(), e))?;
        validate_extension(&canonical)?;
        Ok(Self { inner: canonical })
    }

    /// Create a ValidatedPath for a file that may not exist yet (for Save As).
    /// Validates the parent directory exists and the extension is correct.
    pub fn new_for_write(path: &str) -> Result<Self, String> {
        let path = PathBuf::from(path);
        validate_extension(&path)?;
        let parent = path
            .parent()
            .ok_or_else(|| format!("Invalid path: no parent directory for '{}'", path.display()))?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Invalid directory '{}': {}", parent.display(), e))?;
        Ok(Self {
            inner: canonical_parent.join(path.file_name().unwrap()),
        })
    }

    pub fn as_path(&self) -> &Path {
        &self.inner
    }

    pub fn to_string_lossy(&self) -> String {
        self.inner.to_string_lossy().to_string()
    }

    /// Return the parent directory path (for asset protocol scoping).
    pub fn parent_dir(&self) -> Option<PathBuf> {
        self.inner.parent().map(|p| p.to_path_buf())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_valid_markdown_path() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();
        let result = ValidatedPath::new(&file_path.to_string_lossy());
        assert!(result.is_ok());
    }

    #[test]
    fn test_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();
        let result = ValidatedPath::new(&file_path.to_string_lossy());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a markdown file"));
    }

    #[test]
    fn test_rejects_nonexistent() {
        let result = ValidatedPath::new("/nonexistent/file.md");
        assert!(result.is_err());
    }

    #[test]
    fn test_canonicalizes_path() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();
        let validated = ValidatedPath::new(&file_path.to_string_lossy()).unwrap();
        assert!(!validated.to_string_lossy().contains(".."));
    }

    #[test]
    fn test_new_for_write_valid() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("new_file.md");
        let result = ValidatedPath::new_for_write(&file_path.to_string_lossy());
        assert!(result.is_ok());
    }

    #[test]
    fn test_new_for_write_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("new_file.txt");
        let result = ValidatedPath::new_for_write(&file_path.to_string_lossy());
        assert!(result.is_err());
    }
}
