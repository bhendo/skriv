mod commands;
mod scope;
mod validated_path;
mod watcher;

use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::Manager;

#[derive(Default)]
pub struct OpenedFile(pub Mutex<Option<String>>);

fn resolve_file_path(arg: &str) -> Option<std::path::PathBuf> {
    if arg.starts_with('-') {
        return None;
    }
    let path = if let Some(stripped) = arg.strip_prefix("file://") {
        std::path::PathBuf::from(stripped)
    } else {
        std::path::PathBuf::from(arg)
    };
    // Try canonicalizing directly (works for absolute paths and paths
    // relative to the current working directory)
    if let Ok(canonical) = path.canonicalize() {
        return Some(canonical);
    }
    // In Tauri dev mode, CWD may be the desktop/ directory rather than
    // the repo root. Try resolving relative to the parent directory.
    if path.is_relative() {
        if let Ok(cwd) = std::env::current_dir() {
            if let Some(parent) = cwd.parent() {
                let from_parent = parent.join(&path);
                if let Ok(canonical) = from_parent.canonicalize() {
                    return Some(canonical);
                }
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenedFile::default())
        .manage(watcher::FileWatcher::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::write_new_file,
            commands::get_file_info,
            commands::get_opened_file,
            commands::watch_file,
            commands::unwatch_file,
        ])
        .setup(|app| {
            for arg in std::env::args().skip(1) {
                if let Some(path) = resolve_file_path(&arg) {
                    let state = app.state::<OpenedFile>();
                    *state.0.lock().unwrap() = Some(path.to_string_lossy().into_owned());
                    break;
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                if let Some(url) = urls.first() {
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().into_owned();
                        let state = app.state::<OpenedFile>();
                        *state.0.lock().unwrap() = Some(path_str.clone());
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("file-opened", path_str);
                        }
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app, event);
            }
        });
}
