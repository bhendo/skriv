import { useEffect, useRef } from "react";

interface ShortcutHandlers {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewWindow?: () => void;
  onToggleSyntax?: () => void;
  onToggleSourceMode?: () => void;
  onSearch?: () => void;
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

      if (e.shiftKey && e.key === "s") {
        e.preventDefault();
        ref.current.onSaveAs();
      } else if (e.key === "s") {
        e.preventDefault();
        ref.current.onSave();
      } else if (e.key === "o") {
        e.preventDefault();
        ref.current.onOpen();
      } else if (e.shiftKey && e.key === "e") {
        e.preventDefault();
        ref.current.onToggleSyntax?.();
      } else if (e.key === "m") {
        e.preventDefault();
        ref.current.onToggleSourceMode?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
