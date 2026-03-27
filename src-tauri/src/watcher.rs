use std::time::Duration;

/// Debounce loop: waits for signals on `rx`, then waits for `quiet_period` of
/// silence before calling `on_emit`. Exits when the sender is dropped.
pub fn run_debounce_loop(
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
    use std::sync::Arc;

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
