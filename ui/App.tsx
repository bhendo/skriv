import { useEffect, useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { homeDir } from "@tauri-apps/api/path";
import { LivePreviewEditor } from "./components/LivePreviewEditor";
import { SourceEditor } from "./components/SourceEditor";
import { SearchBar } from "./components/SearchBar";
import { ErrorBanner } from "./components/ErrorBanner";
import { ReloadBanner } from "./components/ReloadBanner";
import { ShortcutCheatsheet } from "./components/ShortcutCheatsheet";
import { Sidebar } from "./components/Sidebar";
import { SidebarToggle } from "./components/SidebarToggle";
import { useAutoSave } from "./hooks/useAutoSave";
import { useEditorView } from "./hooks/useEditorView";
import { useFile } from "./hooks/useFile";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMenuEvents } from "./hooks/useMenuEvents";
import { useSearch } from "./hooks/useSearch";
import { useToc } from "./hooks/useToc";
import { useWindowClose } from "./hooks/useWindowClose";
import { loadAutoSavePref, storeAutoSavePref } from "./utils/autoSavePref";
import { promptUnsavedChanges } from "./utils/unsavedChanges";
import { windowTitle } from "./utils/path";
import type { ShortcutHandlers } from "./utils/shortcuts";
import { captureEditorPosition } from "./utils/editorPosition";
import type { EditorPosition } from "./utils/editorPosition";
import type { EditorHandle } from "./types/editor";
import type { SidebarTab } from "./types/toc";

/** Mirror the persisted auto-save preference into the native menu checkbox. */
function pushAutoSaveMenuState() {
  void invoke("sync_auto_save_menu", { enabled: loadAutoSavePref() });
}

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const getView = useEditorView(editorRef);
  const {
    content,
    path,
    docVersion,
    isModified,
    error,
    openFile,
    reloadFile,
    markModified,
    clearError,
    saveFile,
    saveNewFile,
  } = useFile();

  const [showReloadBanner, setShowReloadBanner] = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [sourceMode, setSourceMode] = useState(false);
  // Document and cursor/scroll position carried atomically from the outgoing
  // editor to its replacement on a mode toggle — one object so a position can
  // never pair with a document it wasn't captured from. The mounting editor
  // applies it, not an App effect: StrictMode's dev remount rebuilds the view
  // after parent effects have run, which would silently discard the restore.
  // Stamped with the docVersion it was captured under and discarded in render
  // when the shell has since replaced the document — the effect that clears it
  // runs after child effects, too late to stop a stale handoff being applied.
  const [editorHandoff, setEditorHandoff] = useState<{
    markdown: string;
    position: EditorPosition;
    docVersion: number;
  } | null>(null);
  const handoff = editorHandoff?.docVersion === docVersion ? editorHandoff : null;
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
    docVersion,
    enabled: sidebarVisible && sidebarTab === "outline",
  });

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

  const { notifyChange, shouldAutoSave } = useAutoSave({
    hasPath: path !== null,
    isModified,
    onSave: handleSave,
  });

  const handleChange = useCallback(() => {
    markModified();
    notifyDocChanged();
    notifyChange();
  }, [markModified, notifyDocChanged, notifyChange]);

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
        docVersion,
      });
    }
    setSourceMode((prev) => !prev);
  }, [getView, docVersion]);

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
    // Menu-only checkbox; the pref is read fresh wherever it's consulted, so
    // no React state — just persist and mirror into the native menu.
    "toggle-auto-save": () => {
      storeAutoSavePref(!loadAutoSavePref());
      pushAutoSaveMenuState();
    },
    // Toggle, so the chord that opens the cheatsheet also dismisses it.
    "keyboard-shortcuts": () => setShowCheatsheet((prev) => !prev),
  };

  useKeyboardShortcuts(shortcutHandlers);
  useMenuEvents(shortcutHandlers);

  useWindowClose({
    isModified,
    onSave: handleSave,
    // With auto-save active, closing is itself the "save now" signal — the
    // prompt would ask about changes auto-save was about to write anyway.
    shouldAutoSave,
  });

  // The checkbox lives in native code and defaults to checked; align it with
  // the persisted preference once per window load (idempotent across windows).
  useEffect(() => {
    pushAutoSaveMenuState();
  }, []);

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

  // null until resolved (or forever outside Tauri, e.g. e2e in a browser);
  // windowTitle then shows the unabbreviated directory.
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir().then(setHome, () => {});
  }, []);

  useEffect(() => {
    getCurrentWindow().setTitle(windowTitle(path, home, isModified));
  }, [path, home, isModified]);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string>("file-changed", () => {
      if (isModifiedRef.current) {
        setShowReloadBanner(true);
      } else {
        if (path) reloadFile(path);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [path, reloadFile]);

  // Shell replaced the document (open/reload). Keyed on docVersion, not
  // content: a save echoes content back through state, and resetting here on
  // save kicked source mode back to live preview on every Cmd+S (worse under
  // auto-save). Source mode is a user choice, so reloads keep it; the sync
  // effects inside the editors swap the buffer. The render-time `handoff`
  // guard is what invalidates a stale handoff; clearing it here only frees
  // the old document string it holds.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing banner visibility with file state
    setShowReloadBanner(false);
    setEditorHandoff(null);
  }, [docVersion]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ErrorBanner message={error} onDismiss={clearError} />
      <ReloadBanner
        visible={showReloadBanner}
        onReload={() => {
          setShowReloadBanner(false);
          if (path) reloadFile(path);
        }}
        onDismiss={() => setShowReloadBanner(false)}
      />
      {showCheatsheet && <ShortcutCheatsheet onClose={() => setShowCheatsheet(false)} />}
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
                defaultValue={handoff?.markdown ?? content}
                docVersion={docVersion}
                onChange={handleChange}
                restorePosition={handoff?.position ?? null}
              />
            ) : (
              <LivePreviewEditor
                ref={editorRef}
                defaultValue={handoff?.markdown ?? content}
                docVersion={docVersion}
                onChange={handleChange}
                restorePosition={handoff?.position ?? null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
