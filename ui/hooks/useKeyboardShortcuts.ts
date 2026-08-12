import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutHandlers } from "../utils/shortcuts";

/**
 * Global keydown dispatch for the shortcut registry (ui/utils/shortcuts.ts).
 * On macOS the webview sees the keydown before the native menu, so
 * preventDefault here is what keeps menu accelerators from double-firing
 * (see src-tauri/src/menu.rs).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const id = matchShortcut(e);
      if (id) {
        e.preventDefault();
        ref.current[id]();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
