import { useEffect, useCallback, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { MarkdownEditor, type EditorHandle } from "./components/Editor";
import { ErrorBanner } from "./components/ErrorBanner";
import { useFile } from "./hooks/useFile";

const PLACEHOLDER = `# Welcome to Skriv

Start writing markdown here.
`;

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const { content, path, error, markModified, clearError, saveFile, saveNewFile } = useFile();

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
        e.preventDefault();
        handleSaveAs();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleSaveAs]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <ErrorBanner message={error} onDismiss={clearError} />
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
