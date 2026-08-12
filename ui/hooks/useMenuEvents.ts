import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MENU_EVENT_SHORTCUTS, menuEventName, type ShortcutHandlers } from "../utils/shortcuts";

/**
 * Bridge native menu items to frontend handlers, for every registry shortcut
 * with an event-emitting menu item (ui/utils/shortcuts.ts). The Rust menu
 * handler emits these events to the focused window only
 * (src-tauri/src/menu.rs), so the listener must be window-scoped — a global
 * listen() receives every window's events regardless of the emit target.
 */
export function useMenuEvents(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const win = getCurrentWindow();
    const unlistens = MENU_EVENT_SHORTCUTS.map((shortcut) =>
      win.listen(menuEventName(shortcut.id), () => {
        ref.current[shortcut.id]();
      })
    );
    return () => {
      unlistens.forEach((p) => p.then((fn) => fn()));
    };
  }, []);
}
