import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";

interface UseWindowCloseOptions {
  isModified: boolean;
  onSave: () => Promise<void>;
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
    // Custom button labels return the label text as the result, not "Yes"/"No"/"Cancel"
    const SAVE = "Save";
    const DONT_SAVE = "Don't Save";
    const CANCEL = "Cancel";

    const result = await message("Do you want to save your changes?", {
      title: "Unsaved Changes",
      kind: "warning",
      buttons: { yes: SAVE, no: DONT_SAVE, cancel: CANCEL },
    });

    if (result === SAVE) {
      await onSaveRef.current();
      await invoke("close_window");
    } else if (result === DONT_SAVE) {
      await invoke("close_window");
    }
    // "Cancel" or dialog dismissed → do nothing, keep window open
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
    const unlisten = listen("quit-requested", async () => {
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
