//! Platform-specific window affordances. All cfg(target_os) window code
//! lives here so the command layer stays platform-neutral.

/// Point the macOS title-bar proxy icon at the document `path`. The proxy
/// icon gives cmd-click ancestor-folder navigation and Finder-style icon
/// dragging. Cosmetic, so failures are ignored rather than failing the
/// operation that opened the document.
#[cfg(target_os = "macos")]
pub fn set_represented_filename(window: &tauri::Window, path: &std::path::Path) {
    use objc2_app_kit::NSWindow;
    use objc2_foundation::NSString;

    let filename = path.to_string_lossy().into_owned();
    let win = window.clone();
    // AppKit calls are only sound on the main thread.
    let _ = window.run_on_main_thread(move || {
        if let Ok(ptr) = win.ns_window() {
            // ns_window() yields the window's NSWindow.
            let ns_window = unsafe { &*ptr.cast::<NSWindow>() };
            ns_window.setRepresentedFilename(&NSString::from_str(&filename));
        }
    });
}

/// Other platforms have no title-bar proxy icon.
#[cfg(not(target_os = "macos"))]
pub fn set_represented_filename(_window: &tauri::Window, _path: &std::path::Path) {}
