import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fileNameFromPath, parentFolderName } from "../utils/path";
import { OutlinePanel } from "./OutlinePanel";
import type { SidebarTab, TocHeading } from "../types/toc";

export interface DirEntryInfo {
  name: string;
  path: string;
}

interface SidebarProps {
  currentPath: string | null;
  onFileSelect: (path: string) => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  headings: TocHeading[];
  activeHeadingIndex: number;
  onHeadingSelect: (heading: TocHeading) => void;
}

const TABS: ReadonlyArray<[SidebarTab, string]> = [
  ["files", "Files"],
  ["outline", "Outline"],
];

export function Sidebar({
  currentPath,
  onFileSelect,
  activeTab,
  onTabChange,
  headings,
  activeHeadingIndex,
  onHeadingSelect,
}: SidebarProps) {
  const [folderFiles, setFolderFiles] = useState<DirEntryInfo[]>([]);
  const [recents, setRecents] = useState<string[]>([]);

  // Gated on the Files tab: with the Outline showing, the directory scan
  // (and its window-focus refetches) would produce nothing visible. The
  // activeTab dependency re-runs the effect on switch back, so the panel is
  // fresh when it appears. When currentPath is null the Folder section isn't
  // rendered, so any stale listing state is invisible — no reset needed.
  const refreshFolder = useCallback(() => {
    if (!currentPath || activeTab !== "files") return;
    invoke<DirEntryInfo[]>("list_markdown_files", { path: currentPath })
      .then((files) => setFolderFiles(files ?? []))
      .catch(() => setFolderFiles([]));
  }, [currentPath, activeTab]);

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
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar sections">
        {TABS.map(([tab, label]) => (
          <button
            key={tab}
            role="tab"
            id={`sidebar-tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`sidebar-panel-${tab}`}
            className={activeTab === tab ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => onTabChange(tab)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "files" ? (
        <div role="tabpanel" id="sidebar-panel-files" aria-labelledby="sidebar-tab-files">
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
        </div>
      ) : (
        <div role="tabpanel" id="sidebar-panel-outline" aria-labelledby="sidebar-tab-outline">
          <OutlinePanel
            headings={headings}
            activeIndex={activeHeadingIndex}
            onHeadingSelect={onHeadingSelect}
          />
        </div>
      )}
    </aside>
  );
}
