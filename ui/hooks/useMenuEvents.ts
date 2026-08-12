import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface MenuHandlers {
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onToggleSidebar: () => void;
  onToggleOutline: () => void;
}

const MENU_EVENTS: ReadonlyArray<[string, keyof MenuHandlers]> = [
  ["menu-open", "onOpen"],
  ["menu-save", "onSave"],
  ["menu-save-as", "onSaveAs"],
  ["menu-toggle-sidebar", "onToggleSidebar"],
  ["menu-toggle-outline", "onToggleOutline"],
];

/**
 * Bridge native menu items to frontend handlers. The Rust menu handler emits
 * these events to the focused window only (src-tauri/src/menu.rs), so the
 * listener must be window-scoped — a global listen() receives every window's
 * events regardless of the emit target.
 */
export function useMenuEvents(handlers: MenuHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const win = getCurrentWindow();
    const unlistens = MENU_EVENTS.map(([event, handler]) =>
      win.listen(event, () => {
        ref.current[handler]();
      })
    );
    return () => {
      unlistens.forEach((p) => p.then((fn) => fn()));
    };
  }, []);
}
