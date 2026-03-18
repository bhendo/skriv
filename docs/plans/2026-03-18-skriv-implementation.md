# Skriv Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Typora-style WYSIWYG markdown editor as a macOS desktop app using Tauri, React, and Milkdown Crepe.

**Architecture:** Tauri v2 wraps a React + TypeScript frontend that uses Milkdown Crepe (batteries-included editor layer on ProseMirror + remark) for WYSIWYG markdown editing. The Rust backend handles file I/O, file watching, and CLI argument parsing. The frontend communicates with the backend via Tauri's `invoke` API.

**Tech Stack:** Tauri v2, React 18+, TypeScript, Milkdown Crepe v7 (`@milkdown/crepe`, `@milkdown/react`), Vite, Rust (notify v8 crate)

**Design doc:** `docs/plans/2026-03-18-skriv-design.md`

**Post-MVP:** Cursor-aware Typora-style syntax toggling (show raw markdown on cursor entry), web version

---

### Task 1: Scaffold Tauri + React + TypeScript Project

**Files:**
- Create: `.mise.toml` (pin Node and Rust versions)
- Create: Project scaffold via `create-tauri-app` (generates `src/` and `src-tauri/`, then rename to `ui/` and `desktop/`)
- Modify: `desktop/tauri.conf.json` (rename app to "skriv", configure window, set CSP)
- Modify: `desktop/Cargo.toml` (rename package to "skriv")

**Step 1: Set up dev dependencies with mise**

Pin Node and Rust versions for the repository:

```bash
mise use node@lts
mise use rust@stable
```

This creates a `.mise.toml` at the repo root. Verify:

```bash
mise ls
node --version
rustc --version
cargo --version
```

**Step 2: Scaffold the project**

Run interactively from the repo root:
```bash
npm create tauri-app@latest . -- --template react-ts
```
If the interactive tool doesn't accept `.` as the project directory, scaffold into a temp name and move files. Select:
- Frontend language: TypeScript
- Package manager: npm
- UI template: React
- UI flavor: TypeScript

After scaffolding, rename the default directories to match our semantic structure:

```bash
mv src-tauri desktop
mv src ui
mv index.html ui/
```

Update `vite.config.ts` to set the root to `ui/`:
```ts
export default defineConfig({
  root: "ui",
  // ... other config
});
```

Update `desktop/tauri.conf.json` to point `frontendDist` and `devUrl` to the correct paths relative to `desktop/`.

**Step 3: Rename the app to "skriv"**

In `desktop/tauri.conf.json`, set:
```json
{
  "productName": "Skriv",
  "identifier": "com.skriv.app"
}
```

In `desktop/Cargo.toml`, set:
```toml
[package]
name = "skriv"
```

**Step 4: Configure window and CSP**

In `desktop/tauri.conf.json`, configure the window and set a restrictive Content Security Policy:
```json
{
  "app": {
    "windows": [
      {
        "title": "Skriv",
        "width": 900,
        "height": 700
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: https:; connect-src 'self'"
    }
  }
}
```

**Step 5: Install frontend dependencies**

```bash
npm install
```

**Step 6: Verify the app launches**

```bash
npm run tauri dev
```

Expected: A Tauri window opens showing the default React starter page.

**Step 7: Clean up starter code**

Remove the default Vite/React demo content from `ui/App.tsx`, `ui/App.css`, and `ui/main.tsx`. Leave a minimal `<div>Skriv</div>` placeholder.

**Step 8: Set up formatting and linting tools**

Install and configure ESLint and Prettier for the TypeScript/React frontend:

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier
```

Create `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Create `eslint.config.js` (flat config):
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  }
);
```

Add scripts to `package.json`:
```json
{
  "scripts": {
    "lint": "eslint ui/",
    "lint:fix": "eslint ui/ --fix",
    "format": "prettier --write ui/",
    "format:check": "prettier --check ui/"
  }
}
```

For the Rust backend, `cargo fmt` and `clippy` are already available via rustup. Verify:
```bash
cd desktop && cargo fmt --check && cargo clippy -- -D warnings
```

Add a `rustfmt.toml` in `desktop/`:
```toml
edition = "2021"
max_width = 100
```

**Step 9: Verify linting and formatting pass**

```bash
npm run lint && npm run format:check
cd desktop && cargo fmt --check && cargo clippy -- -D warnings
```

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri + React + TypeScript project with mise, linting, and formatting"
```

---

### Task 2: Security Foundations + Rust File Commands

**Files:**
- Create: `desktop/src/commands.rs`
- Create: `desktop/src/validated_path.rs`
- Modify: `desktop/src/lib.rs` (register commands)
- Modify: `desktop/Cargo.toml` (add serde, tempfile dev-dep)

This task combines security foundations with file I/O commands. The `ValidatedPath` type ensures all file operations validate and canonicalize paths from the start.

**Step 1: Create the ValidatedPath type**

Create `desktop/src/validated_path.rs`:

```rust
use std::path::{Path, PathBuf};

const ALLOWED_EXTENSIONS: &[&str] = &["md", "markdown"];

/// A validated, canonicalized file path restricted to markdown files.
/// All file I/O commands must use this type instead of raw String paths.
#[derive(Debug, Clone)]
pub struct ValidatedPath {
    inner: PathBuf,
}

impl ValidatedPath {
    /// Validate and canonicalize a path string.
    /// Returns an error if:
    /// - The path cannot be canonicalized (doesn't exist or permission denied)
    /// - The file extension is not a markdown extension
    pub fn new(path: &str) -> Result<Self, String> {
        let path = PathBuf::from(path);

        // Canonicalize to resolve symlinks, .., and relative paths
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Invalid path '{}': {}", path.display(), e))?;

        // Validate extension
        let ext = canonical
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        if !ALLOWED_EXTENSIONS.contains(&ext) {
            return Err(format!(
                "File '{}' is not a markdown file (expected .md or .markdown)",
                canonical.display()
            ));
        }

        Ok(Self { inner: canonical })
    }

    /// Create a ValidatedPath for a file that may not exist yet (for Save As).
    /// Validates the parent directory exists and the extension is correct.
    pub fn new_for_write(path: &str) -> Result<Self, String> {
        let path = PathBuf::from(path);

        // Validate extension
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        if !ALLOWED_EXTENSIONS.contains(&ext) {
            return Err(format!(
                "File '{}' is not a markdown file (expected .md or .markdown)",
                path.display()
            ));
        }

        // Validate parent directory exists
        let parent = path
            .parent()
            .ok_or_else(|| format!("Invalid path: no parent directory for '{}'", path.display()))?;

        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Invalid directory '{}': {}", parent.display(), e))?;

        Ok(Self {
            inner: canonical_parent.join(path.file_name().unwrap()),
        })
    }

    pub fn as_path(&self) -> &Path {
        &self.inner
    }

    pub fn to_string_lossy(&self) -> String {
        self.inner.to_string_lossy().to_string()
    }

    /// Return the parent directory path (for asset protocol scoping).
    pub fn parent_dir(&self) -> Option<PathBuf> {
        self.inner.parent().map(|p| p.to_path_buf())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_valid_markdown_path() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();

        let result = ValidatedPath::new(&file_path.to_string_lossy());
        assert!(result.is_ok());
    }

    #[test]
    fn test_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();

        let result = ValidatedPath::new(&file_path.to_string_lossy());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a markdown file"));
    }

    #[test]
    fn test_rejects_nonexistent() {
        let result = ValidatedPath::new("/nonexistent/file.md");
        assert!(result.is_err());
    }

    #[test]
    fn test_canonicalizes_path() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();

        // Use a relative-style path with the file
        let validated = ValidatedPath::new(&file_path.to_string_lossy()).unwrap();
        // Canonicalized path should not contain ".."
        assert!(!validated.to_string_lossy().contains(".."));
    }

    #[test]
    fn test_new_for_write_valid() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("new_file.md");

        let result = ValidatedPath::new_for_write(&file_path.to_string_lossy());
        assert!(result.is_ok());
    }

    #[test]
    fn test_new_for_write_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("new_file.txt");

        let result = ValidatedPath::new_for_write(&file_path.to_string_lossy());
        assert!(result.is_err());
    }
}
```

**Step 2: Create file commands using ValidatedPath**

Create `desktop/src/commands.rs`:

```rust
use crate::validated_path::ValidatedPath;

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let validated = ValidatedPath::new(&path)?;
    std::fs::read_to_string(validated.as_path())
        .map_err(|e| format!("Failed to read '{}': {}", validated.to_string_lossy(), e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let validated = ValidatedPath::new(&path)?;
    std::fs::write(validated.as_path(), &content)
        .map_err(|e| format!("Failed to write '{}': {}", validated.to_string_lossy(), e))
}

#[tauri::command]
pub fn write_new_file(path: String, content: String) -> Result<(), String> {
    let validated = ValidatedPath::new_for_write(&path)?;
    std::fs::write(validated.as_path(), &content)
        .map_err(|e| format!("Failed to write '{}': {}", validated.to_string_lossy(), e))
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let validated = ValidatedPath::new(&path)?;
    let metadata = std::fs::metadata(validated.as_path())
        .map_err(|e| format!("Failed to get info for '{}': {}", validated.to_string_lossy(), e))?;
    let name = validated
        .as_path()
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let dir = validated
        .parent_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let modified = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    Ok(FileInfo {
        name,
        dir,
        modified,
    })
}

#[derive(serde::Serialize)]
pub struct FileInfo {
    pub name: String,
    pub dir: String,
    pub modified: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_read_file_success() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "# Hello").unwrap();

        let result = read_file(file_path.to_string_lossy().to_string());
        assert_eq!(result.unwrap(), "# Hello");
    }

    #[test]
    fn test_read_file_rejects_non_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();

        let result = read_file(file_path.to_string_lossy().to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a markdown file"));
    }

    #[test]
    fn test_read_file_not_found() {
        let result = read_file("/nonexistent/file.md".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_write_file_success() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("output.md");
        fs::write(&file_path, "").unwrap(); // create first so ValidatedPath::new works

        let result = write_file(
            file_path.to_string_lossy().to_string(),
            "# Written".to_string(),
        );
        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "# Written");
    }

    #[test]
    fn test_write_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("new.md");

        let result = write_new_file(
            file_path.to_string_lossy().to_string(),
            "# New file".to_string(),
        );
        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "# New file");
    }

    #[test]
    fn test_get_file_info() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("info.md");
        fs::write(&file_path, "content").unwrap();

        let result = get_file_info(file_path.to_string_lossy().to_string());
        let info = result.unwrap();
        assert_eq!(info.name, "info.md");
        assert!(info.modified > 0);
    }
}
```

**Step 3: Add tempfile dev dependency**

In `desktop/Cargo.toml`, add:
```toml
[dev-dependencies]
tempfile = "3"
```

**Step 4: Register commands in lib.rs**

In `desktop/src/lib.rs`:

```rust
mod commands;
mod validated_path;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::write_new_file,
            commands::get_file_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Run tests**

```bash
cd desktop && cargo test
```

Expected: All tests pass (ValidatedPath + commands).

**Step 6: Commit**

```bash
git add desktop/src/validated_path.rs desktop/src/commands.rs desktop/src/lib.rs desktop/Cargo.toml desktop/Cargo.lock
git commit -m "feat: add ValidatedPath security type and file I/O commands with tests"
```

---

### Task 3: Milkdown Crepe Editor Component

**Files:**
- Create: `ui/components/Editor.tsx`
- Modify: `ui/App.tsx`
- Modify: `ui/main.tsx`
- Modify: `package.json` (add milkdown + crepe deps)

**Step 1: Install Milkdown Crepe packages**

```bash
npm install @milkdown/crepe @milkdown/react
```

**Step 2: Create the Editor component**

Create `ui/components/Editor.tsx`:

```tsx
import { type FC, useImperativeHandle, forwardRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { getMarkdown } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

interface EditorProps {
  defaultValue: string;
  onChange?: (markdown: string) => void;
}

export interface EditorHandle {
  getMarkdown: () => string | undefined;
}

const CrepeEditor = forwardRef<EditorHandle, EditorProps>(
  ({ defaultValue, onChange }, ref) => {
    useEditor(
      (root) => {
        const crepe = new Crepe({
          root,
          defaultValue,
          features: {
            [CrepeFeature.CodeMirror]: true,
            [CrepeFeature.Toolbar]: true,
            [CrepeFeature.BlockEdit]: true,
            [CrepeFeature.LinkTooltip]: true,
            [CrepeFeature.ImageBlock]: true,
            [CrepeFeature.Table]: true,
            [CrepeFeature.ListItem]: true,
            [CrepeFeature.Placeholder]: true,
            [CrepeFeature.Cursor]: true,
            [CrepeFeature.Latex]: false,
          },
        });

        if (onChange) {
          crepe.on((listener) => {
            listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
              if (markdown !== prevMarkdown) {
                onChange(markdown);
              }
            });
          });
        }

        return crepe;
      },
      [defaultValue]
    );

    const [loading, getInstance] = useInstance();

    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        const editor = getInstance();
        return editor?.action(getMarkdown());
      },
    }));

    return <Milkdown />;
  }
);

export const MarkdownEditor = forwardRef<EditorHandle, EditorProps>(
  (props, ref) => {
    return (
      <MilkdownProvider>
        <CrepeEditor ref={ref} {...props} />
      </MilkdownProvider>
    );
  }
);
```

Note: The exact Crepe API for the listener may differ — consult the Milkdown Crepe documentation for the correct `on` / listener pattern. The above follows the documented `useEditor` + Crepe integration. If Crepe doesn't expose `on()` for listeners, configure the listener via `crepe.editor.config()` before creation.

**Step 3: Wire up App.tsx**

```tsx
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
      <MarkdownEditor
        ref={editorRef}
        defaultValue={PLACEHOLDER}
        onChange={() => {}}
      />
    </div>
  );
}

export default App;
```

**Step 4: Update main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Step 5: Verify the editor renders**

```bash
npm run tauri dev
```

Expected: The Tauri window shows a Crepe-powered editor with the placeholder markdown. Bold/italic/lists/blockquotes/tables/code blocks should all render as WYSIWYG. The floating toolbar should appear on text selection. Code blocks should have syntax highlighting via CodeMirror.

**Step 6: Commit**

```bash
git add ui/components/Editor.tsx ui/App.tsx ui/main.tsx package.json package-lock.json
git commit -m "feat: add Milkdown Crepe WYSIWYG editor with React integration"
```

---

### Task 4: Wire File Loading via Tauri Commands

**Files:**
- Create: `ui/hooks/useFile.ts`
- Create: `ui/components/ErrorBanner.tsx`
- Modify: `ui/App.tsx`

**Step 1: Create ErrorBanner component**

Create `ui/components/ErrorBanner.tsx`:

```tsx
import { type FC } from "react";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export const ErrorBanner: FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div
      style={{
        padding: "8px 16px",
        backgroundColor: "#fef2f2",
        borderBottom: "1px solid #fecaca",
        color: "#991b1b",
        fontSize: 13,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#991b1b",
          fontSize: 16,
        }}
      >
        x
      </button>
    </div>
  );
};
```

**Step 2: Create useFile hook with error handling**

Create `ui/hooks/useFile.ts`:

```ts
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FileState {
  path: string | null;
  content: string;
  isModified: boolean;
  fileName: string;
  error: string | null;
}

const EMPTY_STATE: FileState = {
  path: null,
  content: "",
  isModified: false,
  fileName: "Untitled",
  error: null,
};

export function useFile() {
  const [fileState, setFileState] = useState<FileState>(EMPTY_STATE);

  const clearError = useCallback(() => {
    setFileState((prev) => ({ ...prev, error: null }));
  }, []);

  const openFile = useCallback(async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { path });
      const fileName = path.split("/").pop() || "Untitled";
      setFileState({
        path,
        content,
        isModified: false,
        fileName,
        error: null,
      });
    } catch (e) {
      setFileState((prev) => ({
        ...prev,
        error: `Failed to open file: ${e}`,
      }));
    }
  }, []);

  const saveFile = useCallback(
    async (content: string) => {
      if (!fileState.path) {
        // No path — caller should trigger Save As dialog
        return false;
      }
      try {
        await invoke("write_file", { path: fileState.path, content });
        setFileState((prev) => ({ ...prev, content, isModified: false, error: null }));
        return true;
      } catch (e) {
        setFileState((prev) => ({
          ...prev,
          error: `Failed to save file: ${e}`,
        }));
        return false;
      }
    },
    [fileState.path]
  );

  const saveNewFile = useCallback(async (path: string, content: string) => {
    try {
      await invoke("write_new_file", { path, content });
      const fileName = path.split("/").pop() || "Untitled";
      setFileState({
        path,
        content,
        isModified: false,
        fileName,
        error: null,
      });
      return true;
    } catch (e) {
      setFileState((prev) => ({
        ...prev,
        error: `Failed to save file: ${e}`,
      }));
      return false;
    }
  }, []);

  const markModified = useCallback(() => {
    setFileState((prev) => {
      if (prev.isModified) return prev;
      return { ...prev, isModified: true };
    });
  }, []);

  return {
    ...fileState,
    openFile,
    saveFile,
    saveNewFile,
    markModified,
    clearError,
  };
}
```

**Step 3: Update App.tsx to use file hook**

```tsx
import { useCallback, useRef } from "react";
import { MarkdownEditor, type EditorHandle } from "./components/Editor";
import { ErrorBanner } from "./components/ErrorBanner";
import { useFile } from "./hooks/useFile";

const PLACEHOLDER = `# Welcome to Skriv

Start writing markdown here.
`;

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const { content, path, fileName, isModified, error, openFile, saveFile, saveNewFile, markModified, clearError } =
    useFile();

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
```

**Step 4: Verify**

```bash
npm run tauri dev
```

Expected: App launches with placeholder content. No errors in console.

**Step 5: Commit**

```bash
git add ui/hooks/useFile.ts ui/components/ErrorBanner.tsx ui/App.tsx
git commit -m "feat: add useFile hook with error handling and ErrorBanner component"
```

---

### Task 5: Save Functionality (Cmd+S, Cmd+Shift+S for Save As)

**Files:**
- Modify: `ui/App.tsx` (add keyboard handlers + save flow)
- Modify: `package.json` (add dialog plugin)
- Modify: `desktop/src/lib.rs` (register dialog plugin)
- Modify: `desktop/Cargo.toml` (add tauri-plugin-dialog)
- Modify: `desktop/capabilities/default.json` (add dialog permission)

**Step 1: Install dialog plugin**

```bash
npm install @tauri-apps/plugin-dialog
cargo add tauri-plugin-dialog --manifest-path desktop/Cargo.toml
```

**Step 2: Register dialog plugin in lib.rs**

Add `.plugin(tauri_plugin_dialog::init())` to the Tauri builder.

**Step 3: Add dialog permission**

In `desktop/capabilities/default.json`, add `"dialog:default"` to the permissions array.

**Step 4: Add keyboard handlers in App.tsx**

```tsx
import { useEffect, useCallback, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";

// Add to App component:
const handleSave = useCallback(async () => {
  const markdown = editorRef.current?.getMarkdown();
  if (markdown === undefined) return;

  if (!path) {
    // No file path — trigger Save As
    handleSaveAs(markdown);
    return;
  }

  await saveFile(markdown);
}, [path, saveFile]);

const handleSaveAs = useCallback(async (markdown?: string) => {
  const content = markdown ?? editorRef.current?.getMarkdown();
  if (content === undefined) return;

  const selected = await save({
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (selected) {
    await saveNewFile(selected, content);
  }
}, [saveNewFile]);

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
```

**Step 5: Verify**

```bash
npm run tauri dev
```

Expected: Cmd+S saves when a file is open, triggers Save As dialog when untitled. Cmd+Shift+S always triggers Save As.

**Step 6: Commit**

```bash
git add ui/App.tsx desktop/src/lib.rs desktop/Cargo.toml desktop/Cargo.lock desktop/capabilities/default.json package.json package-lock.json
git commit -m "feat: add Cmd+S save and Cmd+Shift+S Save As with dialog plugin"
```

---

### Task 6: Title Bar Component

**Files:**
- Create: `ui/components/TitleBar.tsx`
- Modify: `ui/App.tsx`

**Step 1: Create TitleBar component**

Create `ui/components/TitleBar.tsx`:

```tsx
import { type FC } from "react";

interface TitleBarProps {
  fileName: string;
  isModified: boolean;
}

export const TitleBar: FC<TitleBarProps> = ({ fileName, isModified }) => {
  return (
    <div
      data-tauri-drag-region
      style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
        borderBottom: "1px solid #e0e0e0",
        backgroundColor: "#fafafa",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <span style={{ fontSize: 13, color: "#555" }}>
        {fileName}
        {isModified && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#999",
              marginLeft: 6,
              verticalAlign: "middle",
            }}
          />
        )}
      </span>
    </div>
  );
};
```

**Step 2: Add TitleBar to App.tsx**

Add above the editor in the layout:

```tsx
<TitleBar fileName={fileName} isModified={isModified} />
```

Import `TitleBar` from `./components/TitleBar`.

**Step 3: Verify**

```bash
npm run tauri dev
```

Expected: Title bar shows "Untitled" with no dot. Editing shows the dot indicator. Opening a file shows the filename.

**Step 4: Commit**

```bash
git add ui/components/TitleBar.tsx ui/App.tsx
git commit -m "feat: add title bar with filename and modified indicator"
```

---

### Task 7: Custom Skriv Theme

**Files:**
- Create: `ui/theme/skriv.css`
- Modify: `ui/components/Editor.tsx` (add theme import)

**Step 1: Create custom CSS theme**

Create `ui/theme/skriv.css` with Typora-inspired styling. Override Crepe's default theme variables and selectors:

```css
/* Skriv theme — clean, Typora-inspired overrides on Crepe */

html, body, #root {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: #ffffff;
  color: #333;
}

.milkdown {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 60px;
  outline: none;
}

.milkdown .editor {
  outline: none;
}

.milkdown .editor h1 {
  font-size: 2em;
  font-weight: 600;
  margin: 1.2em 0 0.6em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #eee;
}

.milkdown .editor h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin: 1em 0 0.5em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid #eee;
}

.milkdown .editor h3 {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
}

.milkdown .editor p {
  margin: 0.5em 0;
  line-height: 1.7;
}

.milkdown .editor blockquote {
  border-left: 4px solid #ddd;
  margin: 0.8em 0;
  padding: 0.4em 1em;
  color: #666;
}

.milkdown .editor code {
  background: #f5f5f5;
  border-radius: 3px;
  padding: 0.15em 0.4em;
  font-size: 0.9em;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
}

.milkdown .editor pre {
  background: #f8f8f8;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin: 0.8em 0;
}

.milkdown .editor pre code {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.6;
}

.milkdown .editor a {
  color: #4183c4;
  text-decoration: none;
}

.milkdown .editor a:hover {
  text-decoration: underline;
}

.milkdown .editor img {
  max-width: 100%;
  border-radius: 4px;
  margin: 0.5em 0;
}

.milkdown .editor hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 1.5em 0;
}

.milkdown .editor table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0;
}

.milkdown .editor th,
.milkdown .editor td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.milkdown .editor th {
  background: #f5f5f5;
  font-weight: 600;
}
```

**Step 2: Import theme in Editor.tsx**

Add `import "../theme/skriv.css"` to `Editor.tsx` — this loads after Crepe's base styles, overriding them.

**Step 3: Verify**

```bash
npm run tauri dev
```

Expected: Editor displays with clean Typora-like styling — white background, readable typography, subtle borders.

**Step 4: Commit**

```bash
git add ui/theme/skriv.css ui/components/Editor.tsx
git commit -m "feat: add custom Skriv theme overriding Crepe defaults"
```

---

### Task 8: Image Support (Asset Protocol with Dynamic Scoping)

**Files:**
- Create: `desktop/src/scope.rs` (dynamic asset scope management)
- Modify: `desktop/tauri.conf.json` (enable asset protocol with empty initial scope)
- Modify: `desktop/Cargo.toml` (enable protocol-asset feature)
- Modify: `desktop/capabilities/default.json` (add asset protocol permission)
- Modify: `desktop/src/lib.rs` (register scope module)
- Modify: `desktop/src/commands.rs` (call scope expansion on file open)

**Step 1: Enable Tauri asset protocol**

In `desktop/Cargo.toml`, ensure tauri has:
```toml
tauri = { version = "2", features = ["protocol-asset"] }
```

In `desktop/tauri.conf.json`, enable the asset protocol with an empty initial scope (directories are added dynamically when files are opened):
```json
{
  "app": {
    "security": {
      "assetProtocol": {
        "enable": true,
        "scope": []
      }
    }
  }
}
```

**Step 2: Create the scope module**

Create `desktop/src/scope.rs`:

```rust
use std::path::Path;
use tauri::Manager;

const SENSITIVE_DIRS: &[&str] = &[".ssh", ".gnupg", ".aws", ".config", ".kube"];

/// Expand the asset protocol scope to include the parent directory of the opened file.
/// This is called internally from Rust — never exposed as a Tauri command.
pub fn expand_scope_for_file(app: &tauri::AppHandle, file_path: &Path) -> Result<(), String> {
    let dir = file_path
        .parent()
        .ok_or("File has no parent directory")?;

    let canonical_dir = dir
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize directory: {}", e))?;

    // Block root-level directories
    if canonical_dir.parent().is_none() {
        return Err("Cannot scope root directory".into());
    }

    let scope = app.asset_protocol_scope();

    // Add the directory (non-recursive — only files directly in this directory)
    scope
        .allow_directory(&canonical_dir, false)
        .map_err(|e| e.to_string())?;

    // Forbid sensitive subdirectories as defense-in-depth
    for sensitive in SENSITIVE_DIRS {
        let sensitive_path = canonical_dir.join(sensitive);
        if sensitive_path.exists() {
            let _ = scope.forbid_directory(&sensitive_path, true);
        }
    }

    Ok(())
}
```

**Step 3: Wire scope expansion into file open**

In `desktop/src/commands.rs`, update `read_file` to expand the asset scope when a file is opened:

```rust
#[tauri::command]
pub fn read_file(path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let validated = ValidatedPath::new(&path)?;
    // Expand asset protocol scope to the file's directory for image loading
    crate::scope::expand_scope_for_file(&app_handle, validated.as_path())?;
    std::fs::read_to_string(validated.as_path())
        .map_err(|e| format!("Failed to read '{}': {}", validated.to_string_lossy(), e))
}
```

Register the scope module in `desktop/src/lib.rs`:
```rust
mod scope;
```

**Step 4: Add asset protocol permission**

In `desktop/capabilities/default.json`, add `"core:asset-protocol:default"` to the permissions array.

**Step 5: Update CSP for asset protocol**

Ensure the CSP in `tauri.conf.json` includes `asset:` in `img-src` (already done in Task 1).

**Step 6: Verify**

Create a test markdown file with a relative image path (e.g., `![](screenshot.png)` with an image in the same directory) and open it. The image should render inline.

```bash
npm run tauri dev
```

**Step 7: Commit**

```bash
git add desktop/src/scope.rs desktop/src/commands.rs desktop/src/lib.rs desktop/Cargo.toml desktop/tauri.conf.json desktop/capabilities/default.json
git commit -m "feat: add dynamic asset protocol scoping for image loading"
```

---

### Task 9: File Association and CLI Argument Handling

**Files:**
- Modify: `desktop/src/lib.rs` (handle RunEvent::Opened + CLI args)
- Modify: `desktop/src/commands.rs` (add get_opened_file command)
- Modify: `desktop/tauri.conf.json` (file associations)
- Modify: `ui/App.tsx` (check for opened file on launch, listen for events)

**Step 1: Add file associations to tauri.conf.json**

```json
{
  "bundle": {
    "fileAssociations": [
      {
        "ext": ["md", "markdown"],
        "mimeType": "text/markdown",
        "name": "Markdown Document",
        "description": "Markdown text file",
        "role": "Editor"
      }
    ]
  }
}
```

**Step 2: Handle file open events in Rust**

Update `desktop/src/lib.rs`:

```rust
mod commands;
mod validated_path;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
pub struct OpenedFile(pub Mutex<Option<String>>);

fn resolve_file_path(arg: &str) -> Option<PathBuf> {
    if arg.starts_with('-') {
        return None;
    }
    let path = if let Some(stripped) = arg.strip_prefix("file://") {
        PathBuf::from(stripped)
    } else {
        PathBuf::from(arg)
    };
    // Canonicalize to resolve symlinks and relative paths
    path.canonicalize().ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenedFile::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::write_new_file,
            commands::get_file_info,
            commands::get_opened_file,
        ])
        .setup(|app| {
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(file_arg) = std::env::args().nth(1) {
                    if let Some(path) = resolve_file_path(&file_arg) {
                        let state = app.state::<OpenedFile>();
                        *state.0.lock().unwrap() = Some(path.to_string_lossy().to_string());
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                if let Some(url) = urls.first() {
                    if let Ok(path) = url.to_file_path() {
                        let state = app.state::<OpenedFile>();
                        *state.0.lock().unwrap() =
                            Some(path.to_string_lossy().to_string());
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit(
                                "file-opened",
                                path.to_string_lossy().to_string(),
                            );
                        }
                    }
                }
            }
        });
}
```

**Step 3: Add get_opened_file command**

In `desktop/src/commands.rs`:

```rust
#[tauri::command]
pub fn get_opened_file(state: tauri::State<'_, crate::OpenedFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}
```

**Step 4: Update App.tsx to check for opened file**

```tsx
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// In App component:
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
```

**Step 5: Verify**

```bash
npm run tauri dev -- -- /path/to/some/file.md
```

Expected: App opens with the specified markdown file loaded.

**Step 6: Commit**

```bash
git add desktop/src/lib.rs desktop/src/commands.rs desktop/tauri.conf.json ui/App.tsx
git commit -m "feat: handle file associations and CLI args for opening .md files"
```

---

### Task 10: File Watcher with Self-Write Suppression

**Files:**
- Create: `desktop/src/watcher.rs`
- Modify: `desktop/src/commands.rs` (add watch/unwatch commands, update write_file)
- Modify: `desktop/src/lib.rs` (register watcher state and commands)
- Modify: `desktop/Cargo.toml` (add notify v8)
- Modify: `ui/hooks/useFile.ts` (call watch_file after open)
- Modify: `ui/App.tsx` (listen for file-changed events)

**Step 1: Add notify v8 dependency**

In `desktop/Cargo.toml`:
```toml
[dependencies]
notify = "8"
```

**Step 2: Create watcher module with self-write suppression**

Create `desktop/src/watcher.rs`:

```rust
use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const SELF_WRITE_SUPPRESSION_MS: u64 = 1000;

pub struct FileWatcher {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_path: Mutex<Option<PathBuf>>,
    last_self_write: Arc<Mutex<Option<Instant>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_path: Mutex::new(None),
            last_self_write: Arc::new(Mutex::new(None)),
        }
    }

    /// Record that we just wrote to the file ourselves, so the watcher
    /// should suppress the next change event within the suppression window.
    pub fn record_self_write(&self) {
        *self.last_self_write.lock().unwrap() = Some(Instant::now());
    }

    pub fn watch(&self, path: &str, app_handle: AppHandle) -> Result<(), String> {
        self.unwatch()?;

        let path = PathBuf::from(path);
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {}", e))?;

        let emit_path = canonical.clone();
        // Clone the Arc (not the inner value) so the callback shares
        // the same Mutex as record_self_write
        let last_self_write_ref = self.last_self_write.clone();

        let mut watcher = recommended_watcher(move |res: Result<Event, _>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_)) {
                    // Check if this was a self-triggered write
                    let suppress = {
                        let last = last_self_write_ref.lock().unwrap();
                        last.map_or(false, |t| {
                            t.elapsed() < Duration::from_millis(SELF_WRITE_SUPPRESSION_MS)
                        })
                    };

                    if !suppress {
                        let _ = app_handle
                            .emit("file-changed", emit_path.to_string_lossy().to_string());
                    }
                }
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(canonical.as_ref(), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch '{}': {}", canonical.display(), e))?;

        *self.watcher.lock().unwrap() = Some(watcher);
        *self.watched_path.lock().unwrap() = Some(canonical);

        Ok(())
    }

    pub fn unwatch(&self) -> Result<(), String> {
        let mut watcher = self.watcher.lock().unwrap();
        let mut watched = self.watched_path.lock().unwrap();

        if let (Some(w), Some(p)) = (watcher.as_mut(), watched.as_ref()) {
            let _ = w.unwatch(p.as_ref());
        }

        *watcher = None;
        *watched = None;

        Ok(())
    }
}
```

Note: The `last_self_write` field is an `Arc<Mutex<Option<Instant>>>` shared between the `FileWatcher` struct and the watcher callback. Both `record_self_write()` and the callback reference the same Arc, ensuring self-write suppression works correctly. The `record_self_write` method is called from `write_file` before performing the write.

**Step 3: Add watch/unwatch commands and update write_file**

In `desktop/src/commands.rs`, add:

```rust
#[tauri::command]
pub fn watch_file(
    path: String,
    app_handle: tauri::AppHandle,
    watcher: tauri::State<'_, crate::watcher::FileWatcher>,
) -> Result<(), String> {
    // Validate path before watching (prevent using watcher as filesystem probe)
    crate::validated_path::ValidatedPath::new(&path)?;
    watcher.watch(&path, app_handle)
}

#[tauri::command]
pub fn unwatch_file(
    watcher: tauri::State<'_, crate::watcher::FileWatcher>,
) -> Result<(), String> {
    watcher.unwatch()
}
```

Update `write_file` to record self-writes:

```rust
#[tauri::command]
pub fn write_file(
    path: String,
    content: String,
    watcher: tauri::State<'_, crate::watcher::FileWatcher>,
) -> Result<(), String> {
    let validated = ValidatedPath::new(&path)?;
    watcher.record_self_write();
    std::fs::write(validated.as_path(), &content)
        .map_err(|e| format!("Failed to write '{}': {}", validated.to_string_lossy(), e))
}
```

**Step 4: Register watcher state and commands in lib.rs**

Add `.manage(watcher::FileWatcher::new())` to the builder.

Add `commands::watch_file` and `commands::unwatch_file` to `generate_handler!`.

**Step 5: Update useFile.ts to start watching after open**

```ts
const openFile = useCallback(async (path: string) => {
  try {
    const content = await invoke<string>("read_file", { path });
    const fileName = path.split("/").pop() || "Untitled";
    setFileState({ path, content, isModified: false, fileName, error: null });
    await invoke("watch_file", { path });
  } catch (e) {
    setFileState((prev) => ({ ...prev, error: `Failed to open file: ${e}` }));
  }
}, []);
```

**Step 6: Listen for file-changed events in App.tsx**

```tsx
useEffect(() => {
  const unlisten = listen<string>("file-changed", (_event) => {
    if (confirm("File changed on disk. Reload?")) {
      if (path) openFile(path);
    }
  });
  return () => {
    unlisten.then((fn) => fn());
  };
}, [path, openFile]);
```

**Step 7: Verify**

```bash
cd desktop && cargo test && cd ..
npm run tauri dev
```

Open a file, save it with Cmd+S — no "Reload?" prompt should appear (self-write suppression). Edit the file externally — the reload prompt should appear.

**Step 8: Commit**

```bash
git add desktop/src/watcher.rs desktop/src/commands.rs desktop/src/lib.rs desktop/Cargo.toml desktop/Cargo.lock ui/hooks/useFile.ts ui/App.tsx
git commit -m "feat: add file watcher with self-write suppression"
```

---

### Task 11: File Picker (Cmd+O)

**Files:**
- Modify: `ui/App.tsx` (add Cmd+O handler)

**Step 1: Add Cmd+O handler**

The dialog plugin is already installed from Task 5. Add to the keyboard handler in App.tsx:

```tsx
import { open } from "@tauri-apps/plugin-dialog";

// In the keydown handler:
if ((e.metaKey || e.ctrlKey) && e.key === "o") {
  e.preventDefault();
  const selected = await open({
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (selected) {
    openFile(selected as string);
  }
}
```

Note: The keydown handler will need to be async or dispatch to an async function.

**Step 2: Verify**

```bash
npm run tauri dev
```

Expected: Cmd+O opens a native file picker filtered to `.md` files. Selecting a file opens it in the editor.

**Step 3: Commit**

```bash
git add ui/App.tsx
git commit -m "feat: add Cmd+O file picker for opening markdown files"
```

---

### Task 12: Final Polish, Third-Party Notices, and Cleanup

**Files:**
- Modify: `ui/App.tsx` (extract keyboard shortcuts to hook)
- Create: `ui/hooks/useKeyboardShortcuts.ts`
- Create: `THIRD-PARTY-NOTICES` (license attribution for bundled dependencies)
- Create: `LICENSE` (MIT license for Skriv)
- Modify: `desktop/tauri.conf.json` (verify all config is correct)

**Step 1: Extract keyboard shortcuts into a hook**

Create `ui/hooks/useKeyboardShortcuts.ts`:

```ts
import { useEffect } from "react";

interface ShortcutHandlers {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
}

export function useKeyboardShortcuts({ onSave, onSaveAs, onOpen }: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.shiftKey && e.key === "s") {
        e.preventDefault();
        onSaveAs();
      } else if (e.key === "s") {
        e.preventDefault();
        onSave();
      } else if (e.key === "o") {
        e.preventDefault();
        onOpen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, onSaveAs, onOpen]);
}
```

**Step 2: Simplify App.tsx by using the hook**

Replace the inline keyboard handler with `useKeyboardShortcuts`.

**Step 3: Verify everything works end-to-end**

```bash
npm run tauri dev
```

Test the full flow:
- App launches with placeholder content
- Cmd+O opens a markdown file
- Edit content, title bar shows modified dot
- Cmd+S saves in place (no spurious reload prompt)
- Cmd+Shift+S triggers Save As dialog
- Edit file externally → reload prompt appears
- Errors display in the error banner

**Step 4: Add MIT license file**

Create `LICENSE` with the MIT license text, copyright holder, and current year.

**Step 5: Generate third-party license notices**

Generate attribution for all bundled dependencies:

```bash
# npm dependencies
npx license-checker --production --out THIRD-PARTY-NOTICES --customFormat '{"name":"","version":"","license":"","repository":""}'

# Cargo dependencies (install cargo-about if not present)
cargo install cargo-about
cd desktop && cargo about generate about.hbs >> ../THIRD-PARTY-NOTICES
```

Review the generated `THIRD-PARTY-NOTICES` file. Key licenses to verify:
- All Milkdown packages: MIT
- CodeMirror 6: MIT
- ProseMirror: MIT
- Vue 3: MIT
- DOMPurify: MPL-2.0 OR Apache-2.0 (use Apache-2.0)
- notify: CC0-1.0 (public domain)
- Tauri: MIT OR Apache-2.0

**Step 6: Run linting and formatting**

```bash
npm run lint:fix && npm run format
cd desktop && cargo fmt && cargo clippy -- -D warnings
```

Fix any issues found.

**Step 7: Verify everything works end-to-end**

```bash
npm run tauri dev
```

Test the full flow:
- App launches with placeholder content
- Cmd+O opens a markdown file
- Edit content, title bar shows modified dot
- Cmd+S saves in place (no spurious reload prompt)
- Cmd+Shift+S triggers Save As dialog
- Edit file externally → reload prompt appears
- Errors display in the error banner

**Step 8: Commit**

```bash
git add ui/hooks/useKeyboardShortcuts.ts ui/App.tsx LICENSE THIRD-PARTY-NOTICES
git commit -m "chore: add license, third-party notices, and extract keyboard shortcuts"
```

---

## Task Dependency Graph

```
Task 1 (scaffold + CSP)
  ├─> Task 2 (security + Rust commands) ─┐
  ├─> Task 3 (Crepe editor)              │
  │     ├─> Task 4 (file loading hook) <─┘ [needs Tasks 2 + 3]
  │     │     ├─> Task 5 (save + Save As + dialog plugin)
  │     │     ├─> Task 6 (title bar)
  │     │     ├─> Task 9 (file associations / CLI)
  │     │     ├─> Task 10 (file watcher)
  │     │     └─> Task 11 (file picker Cmd+O)
  │     ├─> Task 7 (custom theme)
  │     └─> Task 8 (images / asset protocol) [also depends on Task 2 for security]
  └─> Task 12 (final polish — after all other tasks)
```

## Execution Waves

```
Wave 1 (1 task):   Task 1 — scaffold
Wave 2 (2 tasks):  Task 2 (Rust) || Task 3 (Crepe editor)
Wave 3 (1 task):   Task 4 — merge point (needs Tasks 2 + 3)
Wave 4 (3 agents):
  Agent A: Task 7 (theme) + Task 8 (images)
  Agent B: Task 5 (save) → Task 10 (watcher) → Task 6 (title bar)
  Agent C: Task 9 (file assoc) → Task 11 (file picker)
Wave 5:            Task 12 — final polish + third-party notices
```

**Wave 4 merge strategy:** After Wave 4 completes, merge agent branches sequentially (Agent A first, then B, then C). Conflicts in `App.tsx` and `lib.rs` are additive (imports, handlers, JSX) and mechanically resolvable.

## Project Structure

```
skriv/
├── desktop/                    # Rust/Tauri desktop shell
│   ├── src/
│   │   ├── main.rs            # App entry point
│   │   ├── lib.rs             # Tauri builder, plugin registration, event handling
│   │   ├── commands.rs        # Tauri command handlers (read/write/watch/info)
│   │   ├── validated_path.rs  # ValidatedPath security type
│   │   ├── scope.rs           # Dynamic asset protocol scope management
│   │   └── watcher.rs         # File watcher with self-write suppression
│   ├── capabilities/
│   │   └── default.json       # Tauri permissions (dialog, asset-protocol)
│   ├── rustfmt.toml           # Rust formatting config
│   ├── Cargo.toml
│   └── tauri.conf.json        # App config, CSP, file associations, asset scope
├── ui/                         # React frontend
│   ├── index.html
│   ├── App.tsx                # Root component
│   ├── main.tsx               # React entry point
│   ├── components/
│   │   ├── Editor.tsx         # Milkdown Crepe editor wrapper
│   │   ├── TitleBar.tsx       # File name + modified indicator
│   │   └── ErrorBanner.tsx    # Error display banner
│   ├── hooks/
│   │   ├── useFile.ts         # File read/write/watch via Tauri commands
│   │   └── useKeyboardShortcuts.ts
│   └── theme/
│       └── skriv.css          # Custom Typora-like theme overrides
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js           # ESLint flat config
├── .prettierrc                # Prettier config
├── .mise.toml                 # Dev dependency versions (Node, Rust)
├── LICENSE                    # MIT license
├── THIRD-PARTY-NOTICES        # Bundled dependency attribution
└── docs/
    └── plans/
```

## Testing Strategy

- **Rust:** Unit tests for `ValidatedPath` and file I/O commands (in each module)
- **Frontend:** Manual testing for MVP; add Vitest for hooks in post-MVP
- **E2E:** Manual testing for the full flow; consider Tauri WebDriver post-MVP
