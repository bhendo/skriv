import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FileState {
  path: string | null;
  content: string;
  /**
   * Bumped only when the shell replaces the document (open/reload), never on
   * save. Editors reset on a version change; comparing content strings would
   * misread a save echo as a new document when keystrokes land while the
   * write is in flight.
   */
  docVersion: number;
  isModified: boolean;
  error: string | null;
}

const EMPTY_STATE: FileState = {
  path: null,
  content: "",
  docVersion: 0,
  isModified: false,
  error: null,
};

export function useFile() {
  const [fileState, setFileState] = useState<FileState>(EMPTY_STATE);
  const pathRef = useRef<string | null>(null);
  // Counts every edit; a save only clears isModified when no edit landed
  // after it captured the document.
  const changeGenRef = useRef(0);
  // Mirrors fileState.docVersion for async guards: a save that resolves
  // after the document was replaced must not touch state at all.
  const docVersionRef = useRef(0);

  const clearError = useCallback(() => {
    setFileState((prev) => ({ ...prev, error: null }));
  }, []);

  const openDocument = useCallback(async (path: string, recordRecent: boolean) => {
    try {
      // One command reads, watches, and updates backend window state
      // atomically — a partial failure leaves the previous document intact.
      const content = await invoke<string>("open_document", { path, recordRecent });
      pathRef.current = path;
      const docVersion = ++docVersionRef.current;
      setFileState({
        path,
        content,
        docVersion,
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
    const gen = changeGenRef.current;
    const version = docVersionRef.current;
    try {
      await invoke("write_file", { path, content });
      // Document replaced while the write was in flight: the write itself
      // succeeded, but its state (content echo, isModified, errors) belongs
      // to the document that is no longer open.
      if (docVersionRef.current !== version) return true;
      setFileState((prev) => ({
        ...prev,
        // Editors ignore this echo (they reset on docVersion only); it keeps
        // `content` — the document an editor mounts with when it has no
        // handoff — no staler than the last save.
        content,
        // A keystroke that landed while the write was in flight is not on
        // disk; only a save no edit outran may mark the document clean.
        isModified: changeGenRef.current !== gen,
        error: null,
      }));
      return true;
    } catch (e) {
      if (docVersionRef.current !== version) return false;
      setFileState((prev) => ({
        ...prev,
        error: `Failed to save file: ${e}`,
      }));
      return false;
    }
  }, []);

  const saveNewFile = useCallback(async (path: string, content: string) => {
    const gen = changeGenRef.current;
    const version = docVersionRef.current;
    try {
      await invoke("write_new_file", { path, content });
      if (docVersionRef.current !== version) return true;
      pathRef.current = path;
      // Same document under a new path — docVersion stays, so editors keep
      // their buffer, selection, and undo history.
      setFileState((prev) => ({
        ...prev,
        path,
        content,
        isModified: changeGenRef.current !== gen,
        error: null,
      }));
      return true;
    } catch (e) {
      if (docVersionRef.current !== version) return false;
      setFileState((prev) => ({
        ...prev,
        error: `Failed to save file: ${e}`,
      }));
      return false;
    }
  }, []);

  const markModified = useCallback(() => {
    changeGenRef.current++;
    setFileState((prev) => {
      if (prev.isModified) return prev;
      return { ...prev, isModified: true };
    });
  }, []);

  return {
    ...fileState,
    openFile,
    reloadFile,
    saveFile,
    saveNewFile,
    markModified,
    clearError,
  };
}
