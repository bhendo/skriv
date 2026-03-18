import { useRef } from "react";
import { MarkdownEditor, type EditorHandle } from "./components/Editor";

const PLACEHOLDER = `# Welcome to Skriv

Start writing markdown here. **Bold**, *italic*, and \`code\` work out of the box.

- List item one
- List item two

> A blockquote for good measure.

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
`;

function App() {
  const editorRef = useRef<EditorHandle>(null);

  return (
    <div style={{ height: "100vh", overflow: "auto" }}>
      <MarkdownEditor ref={editorRef} defaultValue={PLACEHOLDER} onChange={() => {}} />
    </div>
  );
}

export default App;
