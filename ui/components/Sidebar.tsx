import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fileNameFromPath, parentFolderName } from "../utils/path";

export interface DirEntryInfo {
  name: string;
  path: string;
}

interface SidebarProps {
  currentPath: string | null;
  onFileSelect: (path: string) => void;
}

export function Sidebar({ currentPath, onFileSelect }: SidebarProps) {
  const [folderFiles, setFolderFiles] = useState<DirEntryInfo[]>([]);
  const [recents, setRecents] = useState<string[]>([]);

  // When currentPath is null the Folder section isn't rendered, so any stale
  // listing state is invisible — no reset needed.
  const refreshFolder = useCallback(() => {
    if (!currentPath) return;
    invoke<DirEntryInfo[]>("list_markdown_files", { path: currentPath })
      .then((files) => setFolderFiles(files ?? []))
      .catch(() => setFolderFiles([]));
  }, [currentPath]);

  const refreshRecents = useCallback(() => {
    invoke<string[]>("get_recent_files")
      .then((files) => setRecents(files ?? []))
      .catch(() => setRecents([]));
  }, []);

  useEffect(() => {
    refreshFolder();
  }, [refreshFolder]);

  // No directory watcher (v1) — refetch the listing when the window regains focus
  useEffect(() => {
    const onFocus = () => refreshFolder();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshFolder]);

  useEffect(() => {
    refreshRecents();
    // The event payload carries the already-pruned list, so no follow-up
    // get_recent_files round-trip is needed.
    const unlisten = listen<string[]>("recents-changed", (event) => {
      setRecents(event.payload ?? []);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshRecents]);

  const visibleRecents = recents.filter((p) => p !== currentPath);

  return (
    <aside className="sidebar" aria-label="File navigation">
      {currentPath && (
        <section className="sidebar-section">
          <h2 className="sidebar-section-title">{parentFolderName(currentPath)}</h2>
          {folderFiles.map((file) => (
            <button
              key={file.path}
              className={file.path === currentPath ? "sidebar-item active" : "sidebar-item"}
              title={file.path}
              onClick={() => onFileSelect(file.path)}
            >
              {file.name}
            </button>
          ))}
        </section>
      )}
      <section className="sidebar-section">
        <h2 className="sidebar-section-title">Recent</h2>
        {visibleRecents.length === 0 ? (
          <div className="sidebar-empty">No recent files</div>
        ) : (
          visibleRecents.map((recentPath) => (
            <button
              key={recentPath}
              className="sidebar-item"
              title={recentPath}
              onClick={() => onFileSelect(recentPath)}
            >
              {fileNameFromPath(recentPath)}
            </button>
          ))
        )}
      </section>
    </aside>
  );
}
