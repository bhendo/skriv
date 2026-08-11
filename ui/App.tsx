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
import { useFile } from "./hooks/useFile";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMenuEvents } from "./hooks/useMenuEvents";
import { useSearch } from "./hooks/useSearch";
import { useWindowClose } from "./hooks/useWindowClose";
import { promptUnsavedChanges } from "./utils/unsavedChanges";
import type { EditorHandle } from "./types/editor";

function App() {
  const editorRef = useRef<EditorHandle>(null);
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
  const [sourceMode, setSourceMode] = useState(false);
  const [editorSnapshot, setEditorSnapshot] = useState<string | null>(null);
  const isModifiedRef = useRef(isModified);
  useEffect(() => {
    isModifiedRef.current = isModified;
  }, [isModified]);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const handleChange = useCallback(() => {
    markModified();
  }, [markModified]);

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

  const handleToggleSourceMode = useCallback(() => {
    const markdown = editorRef.current?.getMarkdown();
    if (markdown !== undefined) {
      setEditorSnapshot(markdown);
    }
    setSourceMode((prev) => !prev);
  }, []);

  const {
    isSearchOpen,
    searchInfo,
    initialQuery,
    focusKey,
    openSearch,
    closeSearch,
    handleQueryChange,
    handleNext,
    handlePrev,
    handleToggleCaseSensitive,
  } = useSearch({ editorRef });

  useKeyboardShortcuts({
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onOpen: handleOpen,
    onNewWindow: handleNewWindow,
    onToggleSourceMode: handleToggleSourceMode,
    onSearch: openSearch,
    onToggleSidebar: handleToggleSidebar,
  });

  useMenuEvents({
    onOpen: handleOpen,
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onToggleSidebar: handleToggleSidebar,
  });

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
    setEditorSnapshot(null);
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
        {sidebarVisible && <Sidebar currentPath={path} onFileSelect={handleOpenInPlace} />}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {isSearchOpen && (
            <SearchBar
              matchCount={searchInfo.matchCount}
              activeIndex={searchInfo.activeIndex}
              caseSensitive={searchInfo.caseSensitive}
              initialQuery={initialQuery}
              focusKey={focusKey}
              onQueryChange={handleQueryChange}
              onNext={handleNext}
              onPrev={handlePrev}
              onToggleCaseSensitive={handleToggleCaseSensitive}
              onClose={closeSearch}
            />
          )}
          <div style={{ height: "100%", overflow: "auto" }}>
            {sourceMode ? (
              <SourceEditor
                ref={editorRef}
                defaultValue={editorSnapshot ?? content}
                onChange={handleChange}
              />
            ) : (
              <LivePreviewEditor
                ref={editorRef}
                defaultValue={editorSnapshot ?? content}
                onChange={handleChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
