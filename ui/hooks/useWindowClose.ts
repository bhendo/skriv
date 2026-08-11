import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { promptUnsavedChanges } from "../utils/unsavedChanges";

interface UseWindowCloseOptions {
  isModified: boolean;
  /** Resolves true when the save actually happened (false on cancel/failure). */
  onSave: () => Promise<boolean>;
}

export function useWindowClose({ isModified, onSave }: UseWindowCloseOptions) {
  const isModifiedRef = useRef(isModified);
  useEffect(() => {
    isModifiedRef.current = isModified;
  }, [isModified]);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  async function handleUnsavedChanges() {
    const choice = await promptUnsavedChanges();

    if (choice === "save") {
      // Only close when the save went through — a cancelled Save As or a
      // write failure must keep the window (and its content) alive.
      if (await onSaveRef.current()) {
        await invoke("close_window");
      }
    } else if (choice === "dont-save") {
      await invoke("close_window");
    }
    // "cancel" or dialog dismissed → do nothing, keep window open
  }

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      // Always prevent native close — we manage it via close_window command
      event.preventDefault();

      if (!isModifiedRef.current) {
        await invoke("close_window");
        return;
      }
      await handleUnsavedChanges();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    // Window-scoped: the backend emits quit-requested per window label; a
    // global listen() would fire once per open window.
    const unlisten = getCurrentWindow().listen("quit-requested", async () => {
      if (!isModifiedRef.current) {
        await invoke("close_window");
        return;
      }
      await handleUnsavedChanges();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
