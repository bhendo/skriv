mod commands;
mod scope;
mod validated_path;
pub(crate) mod watcher;
pub mod window_manager;

use tauri::{Emitter, Manager};

fn resolve_file_path(arg: &str) -> Option<std::path::PathBuf> {
    if arg.starts_with('-') {
        return None;
    }
    let path = if let Some(stripped) = arg.strip_prefix("file://") {
        std::path::PathBuf::from(stripped)
    } else {
        std::path::PathBuf::from(arg)
    };
    if let Ok(canonical) = path.canonicalize() {
        return Some(canonical);
    }
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

fn open_or_focus_paths(app: &tauri::AppHandle, paths: Vec<std::path::PathBuf>) {
    let manager = app.state::<window_manager::WindowManager>();

    if paths.is_empty() {
        let label = manager.next_label();
        if window_manager::WindowManager::build_window(app, &label).is_ok() {
            manager.register(&label);
        }
        return;
    }

    for path in paths {
        let canonical = match path.canonicalize() {
            Ok(c) => c,
            Err(_) => continue,
        };

        if let Some(existing_label) = manager.find_by_path(&canonical) {
            if let Some(win) = app.get_webview_window(&existing_label) {
                let _ = win.set_focus();
            }
            continue;
        }

        // Reuse a blank window if one exists (e.g., setup created one before
        // macOS Opened event arrived with the file path)
        if let Some(blank_label) = manager.find_blank() {
            let path_str = canonical.to_string_lossy().into_owned();
            manager.set_file_path(&blank_label, Some(canonical));
            if let Some(win) = app.get_webview_window(&blank_label) {
                let _ = win.set_focus();
                // Tell the already-loaded frontend to open the file
                let _ = win.emit("file-opened", path_str);
            }
            continue;
        }

        let label = manager.next_label();
        if window_manager::WindowManager::build_window(app, &label).is_ok() {
            manager.register(&label);
            manager.set_file_path(&label, Some(canonical));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(window_manager::WindowManager::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<std::path::PathBuf> = argv
                .iter()
                .skip(1)
                .filter_map(|arg| resolve_file_path(arg))
                .collect();
            open_or_focus_paths(app, paths);
        }))
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::write_new_file,
            commands::get_file_info,
            commands::get_opened_file,
            commands::watch_file,
            commands::unwatch_file,
            commands::create_window,
            commands::close_window,
        ])
        .setup(|app| {
            let paths: Vec<std::path::PathBuf> = std::env::args()
                .skip(1)
                .filter_map(|arg| resolve_file_path(&arg))
                .collect();

            if !paths.is_empty() {
                // CLI args have file paths — open them now
                open_or_focus_paths(app.handle(), paths);
            } else {
                // No CLI args. On macOS, file associations deliver paths via
                // RunEvent::Opened (not CLI args), so defer blank window creation
                // to MainEventsCleared to give Opened a chance to fire first.
                // On other platforms, create the blank window immediately.
                #[cfg(not(target_os = "macos"))]
                open_or_focus_paths(app.handle(), vec![]);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run({
            let mut needs_initial_window = true;
            move |app, event| {
                match event {
                    #[cfg(target_os = "macos")]
                    tauri::RunEvent::Opened { urls } => {
                        needs_initial_window = false;
                        let paths: Vec<std::path::PathBuf> = urls
                            .iter()
                            .filter_map(|url| url.to_file_path().ok())
                            .collect();
                        open_or_focus_paths(app, paths);
                    }
                    tauri::RunEvent::MainEventsCleared if needs_initial_window => {
                        // After the first batch of events, if no window was created
                        // (no CLI args, no macOS Opened event), create a blank one.
                        needs_initial_window = false;
                        let manager = app.state::<window_manager::WindowManager>();
                        if manager.window_count() == 0 {
                            open_or_focus_paths(app, vec![]);
                        }
                    }
                    tauri::RunEvent::ExitRequested { api, code, .. } => {
                        if code.is_some() {
                            return;
                        }
                        api.prevent_exit();
                        let manager = app.state::<window_manager::WindowManager>();
                        let labels = manager.labels();
                        for label in labels {
                            if let Some(win) = app.get_webview_window(&label) {
                                let _ = win.emit("quit-requested", ());
                            }
                        }
                    }
                    _ => {}
                }
            }
        });
}
