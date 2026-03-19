use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SELF_WRITE_SUPPRESSION_MS: u64 = 1000;

pub struct FileWatcher {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_path: Mutex<Option<PathBuf>>,
    last_self_write: Arc<Mutex<Option<Instant>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
            last_self_write: Arc::new(Mutex::new(None)),
        }
    }

    pub fn record_self_write(&self) {
        *self.last_self_write.lock().unwrap() = Some(Instant::now());
    }

    pub fn watch(&self, path: &str, app_handle: AppHandle) -> Result<(), String> {
        self.unwatch()?;

        let path = PathBuf::from(path);
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {}", e))?;

        let emit_path = canonical.to_string_lossy().into_owned();
        let last_self_write_ref = self.last_self_write.clone();

        let mut watcher = recommended_watcher(move |res: Result<Event, _>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_)) {
                    let suppress = {
                        let last = last_self_write_ref.lock().unwrap();
                        last.is_some_and(|t| {
                            t.elapsed() < Duration::from_millis(SELF_WRITE_SUPPRESSION_MS)
                        })
                    };

                    if !suppress {
                        let _ = app_handle.emit("file-changed", &emit_path);
                    }
                }
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(canonical.as_ref(), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch '{}': {}", canonical.display(), e))?;

        *self.watcher.lock().unwrap() = Some(watcher);
        *self.watched_path.lock().unwrap() = Some(canonical);

        Ok(())
    }

    pub fn unwatch(&self) -> Result<(), String> {
        let mut watcher = self.watcher.lock().unwrap();
        let mut watched = self.watched_path.lock().unwrap();

        if let (Some(w), Some(p)) = (watcher.as_mut(), watched.as_ref()) {
            let _ = w.unwatch(p.as_ref());
        }

        *watcher = None;
        *watched = None;

        Ok(())
    }
}
