use notify::{recommended_watcher, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SELF_WRITE_SUPPRESSION_MS: u64 = 1000;
const DEBOUNCE_MS: u64 = 300;

pub struct WindowState {
    pub file_path: Option<PathBuf>,
    pub watcher: Option<RecommendedWatcher>,
    pub watched_path: Option<PathBuf>,
    pub last_self_write: Arc<Mutex<Option<Instant>>>,
    pub debounce_tx: Option<std::sync::mpsc::Sender<()>>,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            file_path: None,
            watcher: None,
            watched_path: None,
            last_self_write: Arc::new(Mutex::new(None)),
            debounce_tx: None,
        }
    }
}

impl WindowState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_self_write(&self) {
        *self.last_self_write.lock().unwrap() = Some(Instant::now());
    }

    pub fn watch(
        &mut self,
        path: &str,
        label: String,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        self.unwatch()?;

        let path = PathBuf::from(path);
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {}", e))?;

        let emit_path = canonical.to_string_lossy().into_owned();
        let last_self_write_ref = self.last_self_write.clone();

        let (tx, rx) = std::sync::mpsc::channel();

        std::thread::spawn(move || {
            crate::watcher::run_debounce_loop(rx, Duration::from_millis(DEBOUNCE_MS), move || {
                let suppress = {
                    let last = last_self_write_ref.lock().unwrap();
                    last.is_some_and(|t| {
                        t.elapsed() < Duration::from_millis(SELF_WRITE_SUPPRESSION_MS)
                    })
                };
                if !suppress {
                    let _ = app_handle.emit_to(&label, "file-changed", &emit_path);
                }
            });
        });

        let tx_clone = tx.clone();
        let mut watcher = recommended_watcher(move |res: Result<notify::Event, _>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_)) {
                    let _ = tx_clone.send(());
                }
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(canonical.as_ref(), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch '{}': {}", canonical.display(), e))?;

        self.watcher = Some(watcher);
        self.watched_path = Some(canonical);
        self.debounce_tx = Some(tx);

        Ok(())
    }

    pub fn unwatch(&mut self) -> Result<(), String> {
        if let (Some(w), Some(p)) = (self.watcher.as_mut(), self.watched_path.as_ref()) {
            let _ = w.unwatch(p.as_ref());
        }
        self.watcher = None;
        self.watched_path = None;
        self.debounce_tx = None;
        Ok(())
    }
}

pub struct WindowManager {
    windows: Mutex<HashMap<String, WindowState>>,
    next_id: AtomicU64,
}

impl Default for WindowManager {
    fn default() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(0),
        }
    }
}

impl WindowManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Generate the next unique window label.
    pub fn next_label(&self) -> String {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        format!("window-{}", id)
    }

    /// Register a new window with empty state.
    pub fn register(&self, label: &str) {
        let mut windows = self.windows.lock().unwrap();
        windows.insert(label.to_string(), WindowState::new());
    }

    /// Remove a window's state. Returns true if it existed.
    pub fn remove(&self, label: &str) -> bool {
        let mut windows = self.windows.lock().unwrap();
        windows.remove(label).is_some()
    }

    /// Access a window's state within a closure. Returns None if not found.
    pub fn get_state<R>(&self, label: &str, f: impl FnOnce(&WindowState) -> R) -> Option<R> {
        let windows = self.windows.lock().unwrap();
        windows.get(label).map(f)
    }

    /// Mutably access a window's state within a closure. Returns None if not found.
    pub fn with_state_mut<R>(
        &self,
        label: &str,
        f: impl FnOnce(&mut WindowState) -> R,
    ) -> Option<R> {
        let mut windows = self.windows.lock().unwrap();
        windows.get_mut(label).map(f)
    }

    /// Set the file path for a window.
    pub fn set_file_path(&self, label: &str, path: Option<PathBuf>) {
        self.with_state_mut(label, |state| {
            state.file_path = path;
        });
    }

    /// Find a window with no file open (blank window).
    pub fn find_blank(&self) -> Option<String> {
        let windows = self.windows.lock().unwrap();
        for (label, state) in windows.iter() {
            if state.file_path.is_none() {
                return Some(label.clone());
            }
        }
        None
    }

    /// Find the window label that has a given file path open.
    pub fn find_by_path(&self, path: &Path) -> Option<String> {
        let windows = self.windows.lock().unwrap();
        for (label, state) in windows.iter() {
            if state.file_path.as_deref() == Some(path) {
                return Some(label.clone());
            }
        }
        None
    }

    /// Return the number of registered windows.
    pub fn window_count(&self) -> usize {
        self.windows.lock().unwrap().len()
    }

    /// Get all window labels.
    pub fn labels(&self) -> Vec<String> {
        self.windows.lock().unwrap().keys().cloned().collect()
    }

    /// Build a new webview window with standard configuration and focus it.
    pub fn build_window(
        app: &tauri::AppHandle,
        label: &str,
    ) -> Result<tauri::WebviewWindow, String> {
        let url = tauri::WebviewUrl::App("index.html".into());
        let window = tauri::webview::WebviewWindowBuilder::new(app, label, url)
            .title("Untitled")
            .inner_size(900.0, 700.0)
            .build()
            .map_err(|e| format!("Failed to create window: {}", e))?;
        let _ = window.set_focus();
        Ok(window)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_and_remove_window() {
        let mgr = WindowManager::new();
        mgr.register("win-0");
        assert!(mgr.get_state("win-0", |_| ()).is_some());

        mgr.remove("win-0");
        assert!(mgr.get_state("win-0", |_| ()).is_none());
    }

    #[test]
    fn next_label_increments() {
        let mgr = WindowManager::new();
        assert_eq!(mgr.next_label(), "window-0");
        assert_eq!(mgr.next_label(), "window-1");
    }

    #[test]
    fn find_by_path_returns_matching_label() {
        let mgr = WindowManager::new();
        mgr.register("win-0");
        let target = PathBuf::from("/docs/test.md");
        mgr.set_file_path("win-0", Some(target.clone()));

        assert_eq!(mgr.find_by_path(&target), Some("win-0".to_string()));
        assert_eq!(mgr.find_by_path(&PathBuf::from("/other.md")), None);
    }

    #[test]
    fn remove_nonexistent_is_noop() {
        let mgr = WindowManager::new();
        mgr.remove("no-such-window"); // should not panic
    }

    #[test]
    fn window_count() {
        let mgr = WindowManager::new();
        assert_eq!(mgr.window_count(), 0);
        mgr.register("a");
        mgr.register("b");
        assert_eq!(mgr.window_count(), 2);
        mgr.remove("a");
        assert_eq!(mgr.window_count(), 1);
    }
}
