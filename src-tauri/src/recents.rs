use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

const MAX_RECENTS: usize = 15;

/// Persistent most-recent-first list of opened files, stored as a JSON array
/// of path strings. Owns its own mutex; never hold it while touching other
/// managed state (WindowManager) to avoid lock-ordering issues.
pub struct RecentsStore {
    file: PathBuf,
    entries: Mutex<Vec<PathBuf>>,
}

impl RecentsStore {
    /// Load the store from `file`. Any read or parse error yields an empty list.
    pub fn load(file: PathBuf) -> Self {
        let entries = std::fs::read_to_string(&file)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<PathBuf>>(&s).ok())
            .unwrap_or_default();
        Self {
            file,
            entries: Mutex::new(entries),
        }
    }

    /// Move `path` to the front of the list (paths are pre-canonicalized by
    /// ValidatedPath). Returns true if the list changed.
    pub fn add(&self, path: &Path) -> bool {
        let mut entries = self.entries.lock().unwrap();
        if entries.first().map(|p| p.as_path()) == Some(path) {
            return false;
        }
        entries.retain(|p| p != path);
        entries.insert(0, path.to_path_buf());
        entries.truncate(MAX_RECENTS);
        self.save(&entries);
        true
    }

    /// Most-recent-first list, pruned of files that no longer exist.
    pub fn list(&self) -> Vec<String> {
        let mut entries = self.entries.lock().unwrap();
        let before = entries.len();
        entries.retain(|p| p.exists());
        if entries.len() != before {
            self.save(&entries);
        }
        entries
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect()
    }

    /// Best-effort persistence; errors are ignored.
    fn save(&self, entries: &[PathBuf]) {
        if let Ok(json) = serde_json::to_string(entries) {
            let _ = std::fs::write(&self.file, json);
        }
    }
}

/// Record a successful open (or Save As) and notify every window when the
/// list changed. Runs on a blocking-task thread so the recording I/O and the
/// prune sweep never sit on the file-open response path; the event carries
/// the pruned list so windows don't each round-trip get_recent_files.
pub fn record_open(app: &tauri::AppHandle, path: &Path) {
    let app = app.clone();
    let path = path.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<RecentsStore>();
        if store.add(&path) {
            let _ = app.emit("recents-changed", store.list());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn store_in(dir: &tempfile::TempDir) -> RecentsStore {
        RecentsStore::load(dir.path().join("recents.json"))
    }

    #[test]
    fn add_moves_existing_entry_to_front() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_in(&dir);
        assert!(store.add(Path::new("/a.md")));
        assert!(store.add(Path::new("/b.md")));
        assert!(store.add(Path::new("/a.md")));

        let entries = store.entries.lock().unwrap();
        assert_eq!(
            *entries,
            vec![PathBuf::from("/a.md"), PathBuf::from("/b.md")]
        );
    }

    #[test]
    fn add_returns_false_when_already_front() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_in(&dir);
        assert!(store.add(Path::new("/a.md")));
        assert!(!store.add(Path::new("/a.md")));
    }

    #[test]
    fn add_caps_at_max_recents() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_in(&dir);
        for i in 0..(MAX_RECENTS + 5) {
            store.add(Path::new(&format!("/file-{}.md", i)));
        }
        assert_eq!(store.entries.lock().unwrap().len(), MAX_RECENTS);
    }

    #[test]
    fn list_prunes_deleted_files() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_in(&dir);

        let existing = dir.path().join("exists.md");
        fs::write(&existing, "").unwrap();
        store.add(Path::new("/deleted/gone.md"));
        store.add(&existing);

        let listed = store.list();
        assert_eq!(listed, vec![existing.to_string_lossy().into_owned()]);
        // Prune also persisted
        assert_eq!(store.entries.lock().unwrap().len(), 1);
    }

    #[test]
    fn save_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("recents.json");
        let store = RecentsStore::load(file.clone());
        store.add(Path::new("/a.md"));
        store.add(Path::new("/b.md"));

        let reloaded = RecentsStore::load(file);
        let entries = reloaded.entries.lock().unwrap();
        assert_eq!(
            *entries,
            vec![PathBuf::from("/b.md"), PathBuf::from("/a.md")]
        );
    }

    #[test]
    fn load_corrupt_json_yields_empty() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("recents.json");
        fs::write(&file, "{not json").unwrap();
        let store = RecentsStore::load(file);
        assert!(store.entries.lock().unwrap().is_empty());
    }

    #[test]
    fn load_missing_file_yields_empty() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_in(&dir);
        assert!(store.entries.lock().unwrap().is_empty());
    }
}
