use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SELF_WRITE_SUPPRESSION_MS: u64 = 1000;
const DEBOUNCE_MS: u64 = 300;

pub struct FileWatcher {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_path: Mutex<Option<PathBuf>>,
    last_self_write: Arc<Mutex<Option<Instant>>>,
    debounce_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
            last_self_write: Arc::new(Mutex::new(None)),
            debounce_tx: Mutex::new(None),
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

        let (tx, rx) = std::sync::mpsc::channel();

        // Spawn debounce thread
        std::thread::spawn(move || {
            run_debounce_loop(rx, Duration::from_millis(DEBOUNCE_MS), move || {
                let suppress = {
                    let last = last_self_write_ref.lock().unwrap();
                    last.is_some_and(|t| {
                        t.elapsed() < Duration::from_millis(SELF_WRITE_SUPPRESSION_MS)
                    })
                };
                if !suppress {
                    let _ = app_handle.emit("file-changed", &emit_path);
                }
            });
        });

        let tx_clone = tx.clone();
        let mut watcher = recommended_watcher(move |res: Result<Event, _>| {
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

        *self.watcher.lock().unwrap() = Some(watcher);
        *self.watched_path.lock().unwrap() = Some(canonical);
        *self.debounce_tx.lock().unwrap() = Some(tx);

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
        *self.debounce_tx.lock().unwrap() = None; // drops sender, terminates debounce thread

        Ok(())
    }
}

/// Debounce loop: waits for signals on `rx`, then waits for `quiet_period` of
/// silence before calling `on_emit`. Exits when the sender is dropped.
fn run_debounce_loop(
    rx: std::sync::mpsc::Receiver<()>,
    quiet_period: Duration,
    mut on_emit: impl FnMut(),
) {
    loop {
        // Block until first event (or sender dropped)
        if rx.recv().is_err() {
            break;
        }
        // Consume rapid follow-up events until quiet
        loop {
            match rx.recv_timeout(quiet_period) {
                Ok(()) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
        on_emit();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::mpsc;

    #[test]
    fn debounce_coalesces_rapid_signals() {
        let (tx, rx) = mpsc::channel();
        let count = Arc::new(AtomicUsize::new(0));
        let count_clone = count.clone();

        let handle = std::thread::spawn(move || {
            run_debounce_loop(rx, Duration::from_millis(50), move || {
                count_clone.fetch_add(1, Ordering::SeqCst);
            });
        });

        // Send 5 rapid signals
        for _ in 0..5 {
            tx.send(()).unwrap();
        }
        // Wait for debounce to fire
        std::thread::sleep(Duration::from_millis(150));

        assert_eq!(count.load(Ordering::SeqCst), 1);

        drop(tx);
        handle.join().unwrap();
    }

    #[test]
    fn debounce_fires_separately_for_spaced_bursts() {
        let (tx, rx) = mpsc::channel();
        let count = Arc::new(AtomicUsize::new(0));
        let count_clone = count.clone();

        let handle = std::thread::spawn(move || {
            run_debounce_loop(rx, Duration::from_millis(50), move || {
                count_clone.fetch_add(1, Ordering::SeqCst);
            });
        });

        // First burst
        tx.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(150));
        assert_eq!(count.load(Ordering::SeqCst), 1);

        // Second burst
        tx.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(150));
        assert_eq!(count.load(Ordering::SeqCst), 2);

        drop(tx);
        handle.join().unwrap();
    }

    #[test]
    fn debounce_exits_when_sender_dropped() {
        let (tx, rx) = mpsc::channel();

        let handle = std::thread::spawn(move || {
            run_debounce_loop(rx, Duration::from_millis(50), || {});
        });

        drop(tx);
        // Thread should exit promptly
        handle.join().unwrap();
    }
}
