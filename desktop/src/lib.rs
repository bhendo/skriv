mod commands;
mod scope;
mod validated_path;

use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::Manager;

#[derive(Default)]
pub struct OpenedFile(pub Mutex<Option<String>>);

#[cfg(not(target_os = "macos"))]
fn resolve_file_path(arg: &str) -> Option<std::path::PathBuf> {
    if arg.starts_with('-') {
        return None;
    }
    let path = if let Some(stripped) = arg.strip_prefix("file://") {
        std::path::PathBuf::from(stripped)
    } else {
        std::path::PathBuf::from(arg)
    };
    path.canonicalize().ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenedFile::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::write_new_file,
            commands::get_file_info,
            commands::get_opened_file,
        ])
        .setup(|_app| {
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(file_arg) = std::env::args().nth(1) {
                    if let Some(path) = resolve_file_path(&file_arg) {
                        let state = _app.state::<OpenedFile>();
                        *state.0.lock().unwrap() = Some(path.to_string_lossy().to_string());
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                if let Some(url) = urls.first() {
                    if let Ok(path) = url.to_file_path() {
                        let state = _app.state::<OpenedFile>();
                        *state.0.lock().unwrap() = Some(path.to_string_lossy().to_string());
                        if let Some(window) = _app.get_webview_window("main") {
                            let _ = window.emit("file-opened", path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        });
}
