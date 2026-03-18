import { useCallback, useRef } from "react";
import { MarkdownEditor, type EditorHandle } from "./components/Editor";
import { ErrorBanner } from "./components/ErrorBanner";
import { useFile } from "./hooks/useFile";

const PLACEHOLDER = `# Welcome to Skriv

Start writing markdown here.
`;

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const { content, error, markModified, clearError } = useFile();

  const handleChange = useCallback(() => {
    markModified();
  }, [markModified]);

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
