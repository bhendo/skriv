import { useEffect, useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MarkdownEditor, type EditorHandle } from "./components/Editor";
import { ErrorBanner } from "./components/ErrorBanner";
import { ReloadBanner } from "./components/ReloadBanner";
import { useFile } from "./hooks/useFile";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTheme } from "./hooks/useTheme";

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

  useTheme();

  const [showReloadBanner, setShowReloadBanner] = useState(false);
  const isModifiedRef = useRef(isModified);
  useEffect(() => {
    isModifiedRef.current = isModified;
  }, [isModified]);

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
    if (markdown === undefined) return;

    if (!path) {
      handleSaveAs(markdown);
      return;
    }

    await saveFile(markdown);
  }, [path, saveFile, handleSaveAs]);

  const handleOpen = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (selected) {
      openFile(selected as string);
    }
  }, [openFile]);

  useKeyboardShortcuts({
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onOpen: handleOpen,
  });

  // Check for file passed as argument on launch
  useEffect(() => {
    invoke<string | null>("get_opened_file").then((filePath) => {
      if (filePath) {
        openFile(filePath);
      }
    });
  }, [openFile]);

  // Listen for files opened while app is running
  useEffect(() => {
    const unlisten = listen<string>("file-opened", (event) => {
      openFile(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openFile]);

  // Update native window title with filename and modified indicator
  useEffect(() => {
    const title = isModified ? `${fileName} — Edited` : fileName;
    getCurrentWindow().setTitle(title);
  }, [fileName, isModified]);

  // Listen for external file changes on disk
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

  // Clear reload banner when a new file is opened or reloaded
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing banner visibility with file state
    setShowReloadBanner(false);
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
      <div style={{ flex: 1, overflow: "auto" }}>
        <MarkdownEditor
          ref={editorRef}
          defaultValue={content || PLACEHOLDER}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

export default App;
