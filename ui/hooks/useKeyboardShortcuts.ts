import { useEffect, useRef } from "react";

interface ShortcutHandlers {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewWindow?: () => void;
  onToggleSourceMode?: () => void;
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onToggleOutline?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        ref.current.onSearch?.();
        return;
      }

      if (e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        ref.current.onNewWindow?.();
        return;
      }

      if (e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        ref.current.onToggleSidebar?.();
        return;
      }

      // toLowerCase: with Shift held, key can report as "L" on real hardware
      if (e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        ref.current.onToggleOutline?.();
        return;
      }

      if (e.shiftKey && e.key === "s") {
        e.preventDefault();
        ref.current.onSaveAs();
      } else if (e.key === "s") {
        e.preventDefault();
        ref.current.onSave();
      } else if (e.key === "o") {
        e.preventDefault();
        ref.current.onOpen();
      } else if (e.key === "m") {
        e.preventDefault();
        ref.current.onToggleSourceMode?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
