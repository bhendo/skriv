import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FileState {
  path: string | null;
  content: string;
  isModified: boolean;
  fileName: string;
  error: string | null;
}

function fileNameFromPath(path: string): string {
  return path.split("/").pop() || "Untitled";
}

const EMPTY_STATE: FileState = {
  path: null,
  content: "",
  isModified: false,
  fileName: "Untitled",
  error: null,
};

export function useFile() {
  const [fileState, setFileState] = useState<FileState>(EMPTY_STATE);

  const clearError = useCallback(() => {
    setFileState((prev) => ({ ...prev, error: null }));
  }, []);

  const openFile = useCallback(async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { path });
      setFileState({
        path,
        content,
        isModified: false,
        fileName: fileNameFromPath(path),
        error: null,
      });
      await invoke("watch_file", { path });
    } catch (e) {
      setFileState((prev) => ({
        ...prev,
        error: `Failed to open file: ${e}`,
      }));
    }
  }, []);

  const saveFile = useCallback(
    async (content: string) => {
      if (!fileState.path) {
        // No path — caller should trigger Save As dialog
        return false;
      }
      try {
        await invoke("write_file", { path: fileState.path, content });
        setFileState((prev) => ({ ...prev, content, isModified: false, error: null }));
        return true;
      } catch (e) {
        setFileState((prev) => ({
          ...prev,
          error: `Failed to save file: ${e}`,
        }));
        return false;
      }
    },
    [fileState.path]
  );

  const saveNewFile = useCallback(async (path: string, content: string) => {
    try {
      await invoke("write_new_file", { path, content });
      setFileState({
        path,
        content,
        isModified: false,
        fileName: fileNameFromPath(path),
        error: null,
      });
      return true;
    } catch (e) {
      setFileState((prev) => ({
        ...prev,
        error: `Failed to save file: ${e}`,
      }));
      return false;
    }
  }, []);

  const markModified = useCallback(() => {
    setFileState((prev) => {
      if (prev.isModified) return prev;
      return { ...prev, isModified: true };
    });
  }, []);

  return {
    ...fileState,
    openFile,
    saveFile,
    saveNewFile,
    markModified,
    clearError,
  };
}
