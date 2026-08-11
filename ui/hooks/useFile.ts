import { useState, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fileNameFromPath } from "../utils/path";

interface FileState {
  path: string | null;
  content: string;
  isModified: boolean;
  error: string | null;
}

const EMPTY_STATE: FileState = {
  path: null,
  content: "",
  isModified: false,
  error: null,
};

export function useFile() {
  const [fileState, setFileState] = useState<FileState>(EMPTY_STATE);
  const pathRef = useRef<string | null>(null);

  const fileName = useMemo(() => fileNameFromPath(fileState.path), [fileState.path]);

  const clearError = useCallback(() => {
    setFileState((prev) => ({ ...prev, error: null }));
  }, []);

  const openFile = useCallback(async (path: string) => {
    try {
      const [content] = await Promise.all([
        invoke<string>("read_file", { path }),
        invoke("watch_file", { path }),
      ]);
      pathRef.current = path;
      setFileState({
        path,
        content,
        isModified: false,
        error: null,
      });
    } catch (e) {
      setFileState((prev) => ({
        ...prev,
        error: `Failed to open file: ${e}`,
      }));
    }
  }, []);

  const saveFile = useCallback(async (content: string) => {
    const path = pathRef.current;
    if (!path) return false;
    try {
      await invoke("write_file", { path, content });
      setFileState((prev) => ({ ...prev, content, isModified: false, error: null }));
      return true;
    } catch (e) {
      setFileState((prev) => ({
        ...prev,
        error: `Failed to save file: ${e}`,
      }));
      return false;
    }
  }, []);

  const saveNewFile = useCallback(async (path: string, content: string) => {
    try {
      await invoke("write_new_file", { path, content });
      pathRef.current = path;
      setFileState({
        path,
        content,
        isModified: false,
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
    fileName,
    openFile,
    saveFile,
    saveNewFile,
    markModified,
    clearError,
  };
}
