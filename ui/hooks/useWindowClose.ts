import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { promptUnsavedChanges } from "../utils/unsavedChanges";
import { useLatestRef } from "./useLatestRef";

interface UseWindowCloseOptions {
  isModified: boolean;
  /** Resolves true when the save actually happened (false on cancel/failure). */
  onSave: () => Promise<boolean>;
  /**
   * Consulted at close time: when true, save-and-close silently instead of
   * prompting (auto-save would have written these changes moments later
   * anyway). A failed save still falls back to the prompt.
   */
  shouldAutoSave: () => boolean;
}

export function useWindowClose({ isModified, onSave, shouldAutoSave }: UseWindowCloseOptions) {
  const isModifiedRef = useLatestRef(isModified);
  const onSaveRef = useLatestRef(onSave);
  const shouldAutoSaveRef = useLatestRef(shouldAutoSave);

  // Stable (deps are refs), so the mount-only listener effects can depend on
  // it without re-subscribing.
  const handleCloseRequest = useCallback(async () => {
    if (!isModifiedRef.current) {
      await invoke("close_window");
      return;
    }

    if (shouldAutoSaveRef.current() && (await onSaveRef.current())) {
      await invoke("close_window");
      return;
    }

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
  }, [isModifiedRef, onSaveRef, shouldAutoSaveRef]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      // Always prevent native close — we manage it via close_window command
      event.preventDefault();
      await handleCloseRequest();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleCloseRequest]);

  useEffect(() => {
    // Window-scoped: the backend emits quit-requested per window label; a
    // global listen() would fire once per open window.
    const unlisten = getCurrentWindow().listen("quit-requested", handleCloseRequest);

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleCloseRequest]);
}
