import { useEffect, useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MarkdownEditor, type EditorHandle } from "./components/Editor";
import { SourceEditor } from "./components/SourceEditor";
import { SearchBar } from "./components/SearchBar";
import { ErrorBanner } from "./components/ErrorBanner";
import { ReloadBanner } from "./components/ReloadBanner";
import { useFile } from "./hooks/useFile";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSearch } from "./hooks/useSearch";
import { useTheme } from "./hooks/useTheme";
import { useWindowClose } from "./hooks/useWindowClose";
import { reinitMermaid } from "./plugins/mermaid-block";

const PLACEHOLDER = `# Welcome to Skriv

Start writing markdown here.
`;

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

  const { theme } = useTheme();

  useEffect(() => {
    reinitMermaid();
  }, [theme]);

  const [showReloadBanner, setShowReloadBanner] = useState(false);
  const [syntaxToggling, setSyntaxToggling] = useState(true);
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
    async (markdown?: string) => {
      const md = markdown ?? editorRef.current?.getMarkdown();
      if (md === undefined) return;

      const selected = await save({
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (selected) {
        await saveNewFile(selected, md);
      }
    },
    [saveNewFile]
  );

  const handleSave = useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (markdown === undefined) {
      console.warn("Save skipped: editor not ready");
      return;
    }

    if (!path) {
      handleSaveAs(markdown);
      return;
    }

    await saveFile(markdown);
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

  const snapshotAndToggle = useCallback((toggle: React.Dispatch<React.SetStateAction<boolean>>) => {
    const markdown = editorRef.current?.getMarkdown();
    if (markdown !== undefined) {
      setEditorSnapshot(markdown);
    }
    toggle((prev) => !prev);
  }, []);

  const handleToggleSyntax = useCallback(
    () => snapshotAndToggle(setSyntaxToggling),
    [snapshotAndToggle]
  );

  const handleToggleSourceMode = useCallback(
    () => snapshotAndToggle(setSourceMode),
    [snapshotAndToggle]
  );

  const getMilkdownCtx = useCallback(() => {
    return editorRef.current?.getMilkdownCtx?.() ?? null;
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
  } = useSearch({ editorRef, sourceMode, getMilkdownCtx });

  useKeyboardShortcuts({
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onOpen: handleOpen,
    onNewWindow: handleNewWindow,
    onToggleSyntax: handleToggleSyntax,
    onToggleSourceMode: handleToggleSourceMode,
    onSearch: openSearch,
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
    const unlisten = listen<string>("file-opened", (event) => {
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
    const unlisten = listen<string>("file-changed", () => {
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
              defaultValue={editorSnapshot ?? content ?? PLACEHOLDER}
              onChange={handleChange}
            />
          ) : (
            <MarkdownEditor
              ref={editorRef}
              defaultValue={editorSnapshot ?? content ?? PLACEHOLDER}
              onChange={handleChange}
              syntaxToggling={syntaxToggling}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
