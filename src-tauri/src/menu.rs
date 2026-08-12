use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

/// Attach an accelerator only on macOS. There, WKWebView sees the keydown
/// first and useKeyboardShortcuts' preventDefault suppresses the menu key
/// equivalent (verified: Cmd+M toggles source mode, not Minimize), so the
/// accelerator serves as the menu hint plus a fallback when the webview
/// doesn't claim the key. On Windows/Linux accelerator interception order
/// differs per backend, so menu items carry no accelerators there and the
/// webview hook alone handles keys — no double-firing on any platform.
#[cfg(target_os = "macos")]
fn accel(item: MenuItemBuilder, keys: &str) -> MenuItemBuilder {
    item.accelerator(keys)
}

#[cfg(not(target_os = "macos"))]
fn accel(item: MenuItemBuilder, _keys: &str) -> MenuItemBuilder {
    item
}

/// Send a menu event to the focused window's webview, which owns the editor
/// state needed to handle it. Must be emit_to + a window-scoped listener on
/// the JS side: plain emit broadcasts, and globally-registered JS listeners
/// receive every event regardless of the emit target.
fn emit_to_focused(app: &tauri::AppHandle, event: &str) {
    let windows = app.webview_windows();
    if let Some(win) = windows.values().find(|w| w.is_focused().unwrap_or(false)) {
        let _ = app.emit_to(win.label(), event, ());
    }
}

/// Build the native application menu. Must run in setup (main thread).
pub fn init(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    let app_menu = SubmenuBuilder::new(handle, "Skriv")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new_window = accel(
        MenuItemBuilder::with_id("new-window", "New Window"),
        "CmdOrCtrl+N",
    )
    .build(handle)?;
    let open = accel(MenuItemBuilder::with_id("open", "Open…"), "CmdOrCtrl+O").build(handle)?;
    let save = accel(MenuItemBuilder::with_id("save", "Save"), "CmdOrCtrl+S").build(handle)?;
    let save_as = accel(
        MenuItemBuilder::with_id("save-as", "Save As…"),
        "CmdOrCtrl+Shift+S",
    )
    .build(handle)?;

    let file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_window)
        .item(&open)
        .separator()
        .item(&save)
        .item(&save_as)
        .separator()
        .close_window()
        .build()?;

    let find = accel(MenuItemBuilder::with_id("find", "Find…"), "CmdOrCtrl+F").build(handle)?;
    // Cmd+Alt+F is the macOS convention for replace (Cmd+H belongs to Hide);
    // the webview hook claims the same chord, so the accelerator is the menu
    // hint plus fallback like every other item here.
    let replace = accel(
        MenuItemBuilder::with_id("replace", "Find and Replace…"),
        "CmdOrCtrl+Alt+F",
    )
    .build(handle)?;

    // Replacing the default menu removes the stock Edit menu; without these
    // items Cmd+C/V/X/Z stop working in the webview on macOS.
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&find)
        .item(&replace)
        .build()?;

    let toggle_sidebar = accel(
        MenuItemBuilder::with_id("toggle-sidebar", "Toggle Sidebar"),
        "CmdOrCtrl+B",
    )
    .build(handle)?;
    let toggle_outline = accel(
        MenuItemBuilder::with_id("toggle-outline", "Toggle Outline"),
        "CmdOrCtrl+Shift+L",
    )
    .build(handle)?;
    let view_menu = SubmenuBuilder::new(handle, "View")
        .item(&toggle_sidebar)
        .item(&toggle_outline)
        .build()?;

    let window_menu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .separator()
        .fullscreen()
        .build()?;
    #[cfg(target_os = "macos")]
    window_menu.set_as_windows_menu_for_nsapp()?;

    let keyboard_shortcuts = accel(
        MenuItemBuilder::with_id("keyboard-shortcuts", "Keyboard Shortcuts"),
        "CmdOrCtrl+/",
    )
    .build(handle)?;
    let help_menu = SubmenuBuilder::new(handle, "Help")
        .item(&keyboard_shortcuts)
        .build()?;
    #[cfg(target_os = "macos")]
    help_menu.set_as_help_menu_for_nsapp()?;

    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app, event| match event.id().as_ref() {
        // New Window needs no frontend state — go straight to window creation.
        "new-window" => crate::open_or_focus_paths(app, vec![]),
        "open" => emit_to_focused(app, "menu-open"),
        "save" => emit_to_focused(app, "menu-save"),
        "save-as" => emit_to_focused(app, "menu-save-as"),
        "toggle-sidebar" => emit_to_focused(app, "menu-toggle-sidebar"),
        "toggle-outline" => emit_to_focused(app, "menu-toggle-outline"),
        "find" => emit_to_focused(app, "menu-find"),
        "replace" => emit_to_focused(app, "menu-replace"),
        "keyboard-shortcuts" => emit_to_focused(app, "menu-keyboard-shortcuts"),
        _ => {}
    });

    Ok(())
}
