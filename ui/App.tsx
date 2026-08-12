import { useEffect, useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LivePreviewEditor } from "./components/LivePreviewEditor";
import { SourceEditor } from "./components/SourceEditor";
import { SearchBar } from "./components/SearchBar";
import { ErrorBanner } from "./components/ErrorBanner";
import { ReloadBanner } from "./components/ReloadBanner";
import { Sidebar } from "./components/Sidebar";
import { SidebarToggle } from "./components/SidebarToggle";
import { useEditorView } from "./hooks/useEditorView";
import { useFile } from "./hooks/useFile";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMenuEvents } from "./hooks/useMenuEvents";
import { useSearch } from "./hooks/useSearch";
import { useToc } from "./hooks/useToc";
import { useWindowClose } from "./hooks/useWindowClose";
import { promptUnsavedChanges } from "./utils/unsavedChanges";
import type { ShortcutHandlers } from "./utils/shortcuts";
import { captureEditorPosition } from "./utils/editorPosition";
import type { EditorPosition } from "./utils/editorPosition";
import type { EditorHandle } from "./types/editor";
import type { SidebarTab } from "./types/toc";

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const getView = useEditorView(editorRef);
  const {
    content,
    path,
    fileName,
    isModified,
    error,
    openFile,
    markModified,
    clearError,
    saveFile,
    saveNewFile,
  } = useFile();

  const [showReloadBanner, setShowReloadBanner] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [sourceMode, setSourceMode] = useState(false);
  // Document and cursor/scroll position carried atomically from the outgoing
  // editor to its replacement on a mode toggle — one object so a position can
  // never pair with a document it wasn't captured from. The mounting editor
  // applies it, not an App effect: StrictMode's dev remount rebuilds the view
  // after parent effects have run, which would silently discard the restore.
  const [editorHandoff, setEditorHandoff] = useState<{
    markdown: string;
    position: EditorPosition;
  } | null>(null);
  const isModifiedRef = useRef(isModified);
  useEffect(() => {
    isModifiedRef.current = isModified;
  }, [isModified]);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const { headings, activeIndex, navigateToHeading, notifyDocChanged } = useToc({
    editorRef,
    sourceMode,
    content,
    enabled: sidebarVisible && sidebarTab === "outline",
  });

  const handleChange = useCallback(() => {
    markModified();
    notifyDocChanged();
  }, [markModified, notifyDocChanged]);

  const handleSaveAs = useCallback(
    async (markdown?: string): Promise<boolean> => {
      const md = markdown ?? editorRef.current?.getMarkdown();
      if (md === undefined) return false;

      const selected = await save({
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (!selected) return false;
      return saveNewFile(selected, md);
    },
    [saveNewFile]
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    const markdown = editorRef.current?.getMarkdown();
    if (markdown === undefined) {
      console.warn("Save skipped: editor not ready");
      return false;
    }

    if (!path) {
      return handleSaveAs(markdown);
    }

    return saveFile(markdown);
  }, [path, saveFile, handleSaveAs]);

  const handleNewWindow = useCallback(async () => {
    await invoke("create_window");
  }, []);

  const handleOpen = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (!selected) return;

    if (!pathRef.current) {
      // Current window has no file — open in place
      openFile(selected as string);
    } else {
      // Current window has a file — open in a new window
      await invoke("create_window", { path: selected });
    }
  }, [openFile]);

  const handleOpenInPlace = useCallback(
    async (nextPath: string) => {
      if (nextPath === pathRef.current) return;

      const focused = await invoke<boolean>("focus_existing_window", {
        path: nextPath,
      });
      if (focused) return;

      if (isModifiedRef.current) {
        const choice = await promptUnsavedChanges();
        if (choice === "cancel") return;
        if (choice === "save" && !(await handleSave())) return;
      }

      await openFile(nextPath);
    },
    [handleSave, openFile]
  );

  const handleToggleSidebar = useCallback(() => {
    setSidebarVisible((prev) => !prev);
  }, []);

  // Three-state: hidden → show on Outline; on Files → switch; on Outline → hide.
  const handleToggleOutline = useCallback(() => {
    if (!sidebarVisible) {
      setSidebarVisible(true);
      setSidebarTab("outline");
    } else if (sidebarTab !== "outline") {
      setSidebarTab("outline");
    } else {
      setSidebarVisible(false);
    }
  }, [sidebarVisible, sidebarTab]);

  const handleToggleSourceMode = useCallback(() => {
    const view = getView();
    if (view) {
      setEditorHandoff({
        markdown: view.state.doc.toString(),
        position: captureEditorPosition(view),
      });
    }
    setSourceMode((prev) => !prev);
  }, [getView]);

  const {
    isSearchOpen,
    initialShowReplace,
    searchInfo,
    initialQuery,
    focusKey,
    openSearch,
    openReplace,
    closeSearch,
    handleQueryChange,
    handleNext,
    handlePrev,
    handleToggleCaseSensitive,
    handleReplace,
    handleReplaceAll,
  } = useSearch({ editorRef });

  // One handler per registry shortcut; keyboard chords and menu items
  // dispatch through the same map (ui/utils/shortcuts.ts).
  const shortcutHandlers: ShortcutHandlers = {
    "new-window": handleNewWindow,
    open: handleOpen,
    save: handleSave,
    "save-as": handleSaveAs,
    find: openSearch,
    replace: openReplace,
    "find-next": handleNext,
    "find-prev": handlePrev,
    "toggle-source-mode": handleToggleSourceMode,
    "toggle-sidebar": handleToggleSidebar,
    "toggle-outline": handleToggleOutline,
  };

  useKeyboardShortcuts(shortcutHandlers);
  useMenuEvents(shortcutHandlers);

  useWindowClose({
    isModified,
    onSave: handleSave,
  });

  useEffect(() => {
    invoke<string | null>("get_opened_file").then((filePath) => {
      if (filePath) {
        openFile(filePath);
      }
    });
  }, [openFile]);

  useEffect(() => {
    // Window-scoped listen: the backend targets this window's label, and a
    // global listen() would receive every window's file-opened events.
    const unlisten = getCurrentWindow().listen<string>("file-opened", (event) => {
      openFile(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openFile]);

  useEffect(() => {
    const title = isModified ? `${fileName} — Edited` : fileName;
    getCurrentWindow().setTitle(title);
  }, [fileName, isModified]);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string>("file-changed", () => {
      if (isModifiedRef.current) {
        setShowReloadBanner(true);
      } else {
        if (path) openFile(path);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [path, openFile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing banner visibility with file state
    setShowReloadBanner(false);
    setEditorHandoff(null);
    setSourceMode(false);
  }, [path, content]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ErrorBanner message={error} onDismiss={clearError} />
      <ReloadBanner
        visible={showReloadBanner}
        onReload={() => {
          setShowReloadBanner(false);
          if (path) openFile(path);
        }}
        onDismiss={() => setShowReloadBanner(false)}
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <SidebarToggle visible={sidebarVisible} onToggle={handleToggleSidebar} />
        {sidebarVisible && (
          <Sidebar
            currentPath={path}
            onFileSelect={handleOpenInPlace}
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            headings={headings}
            activeHeadingIndex={activeIndex}
            onHeadingSelect={navigateToHeading}
          />
        )}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {isSearchOpen && (
            <SearchBar
              matchCount={searchInfo.matchCount}
              activeIndex={searchInfo.activeIndex}
              caseSensitive={searchInfo.caseSensitive}
              initialShowReplace={initialShowReplace}
              initialQuery={initialQuery}
              focusKey={focusKey}
              onQueryChange={handleQueryChange}
              onNext={handleNext}
              onPrev={handlePrev}
              onToggleCaseSensitive={handleToggleCaseSensitive}
              onReplace={handleReplace}
              onReplaceAll={handleReplaceAll}
              onClose={closeSearch}
            />
          )}
          {/* overflow hidden: .cm-scroller is the only intended scroll container */}
          <div style={{ height: "100%", overflow: "hidden" }}>
            {sourceMode ? (
              <SourceEditor
                ref={editorRef}
                defaultValue={editorHandoff?.markdown ?? content}
                onChange={handleChange}
                restorePosition={editorHandoff?.position ?? null}
              />
            ) : (
              <LivePreviewEditor
                ref={editorRef}
                defaultValue={editorHandoff?.markdown ?? content}
                onChange={handleChange}
                restorePosition={editorHandoff?.position ?? null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
