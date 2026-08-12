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

  const openDocument = useCallback(async (path: string, recordRecent: boolean) => {
    try {
      // One command reads, watches, and updates backend window state
      // atomically — a partial failure leaves the previous document intact.
      const content = await invoke<string>("open_document", { path, recordRecent });
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

  const openFile = useCallback((path: string) => openDocument(path, true), [openDocument]);

  // Re-reads the already-open file (external change); not a user open, so it
  // must not touch the recents list.
  const reloadFile = useCallback((path: string) => openDocument(path, false), [openDocument]);

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
    reloadFile,
    saveFile,
    saveNewFile,
    markModified,
    clearError,
  };
}
