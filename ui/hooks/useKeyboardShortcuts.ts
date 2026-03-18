import { useEffect } from "react";

interface ShortcutHandlers {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
}

export function useKeyboardShortcuts({ onSave, onSaveAs, onOpen }: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.shiftKey && e.key === "s") {
        e.preventDefault();
        onSaveAs();
      } else if (e.key === "s") {
        e.preventDefault();
        onSave();
      } else if (e.key === "o") {
        e.preventDefault();
        onOpen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, onSaveAs, onOpen]);
}
