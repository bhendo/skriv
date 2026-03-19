# Skriv — Design Document

Skriv ("write" in Norwegian) — a Typora-style WYSIWYG markdown editor built with Tauri, React, and Milkdown Crepe.

## Goals

- WYSIWYG markdown editing with inline rendering
- In-place file editing — `open file.md` launches the editor, saves back to the same file
- macOS native app via Tauri, with a future web version using the same frontend
- MVP: headings, bold/italic, lists, links, code blocks, images, tables

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Tauri Shell                    │
│  ┌─────────────────────────────────────────────┐│
│  │              React Frontend                 ││
│  │  ┌───────────────────────────────────────┐  ││
│  │  │       Milkdown Crepe Editor           │  ││
│  │  │  (batteries-included layer on         │  ││
│  │  │   ProseMirror + remark)               │  ││
│  │  │                                       │  ││
│  │  │  Crepe Features:                      │  ││
│  │  │  - CodeMirror (code blocks)           │  ││
│  │  │  - Toolbar (floating format bar)      │  ││
│  │  │  - BlockEdit (slash commands)         │  ││
│  │  │  - Table, ImageBlock, LinkTooltip     │  ││
│  │  │  - Custom CSS theme override          │  ││
│  │  └───────────────────────────────────────┘  ││
│  │                                             ││
│  │  Title bar · Error banner                   ││
│  └──────────────────┬──────────────────────────┘│
│                     │ Tauri invoke/events        │
│  ┌──────────────────▼──────────────────────────┐│
│  │            Rust Backend                     ││
│  │  - File read/write (std::fs + ValidatedPath)││
│  │  - Path validation (ValidatedPath type)     ││
│  │  - File watcher (notify v8 crate)           ││
│  │  - CLI argument parsing (std::env::args)    ││
│  │  - Window management                        ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

## Data Flow

1. User runs `open file.md` (or the app opens with a file argument)
2. Rust validates the path via `ValidatedPath` (canonicalization + extension check), reads the file, sends markdown string to the frontend
3. Milkdown Crepe parses markdown into ProseMirror document, renders WYSIWYG
4. User edits — Crepe maintains the ProseMirror doc
5. On save (`Cmd+S`), frontend extracts markdown via `getMarkdown()` action, sends to Rust. If no file path (Untitled), triggers Save As dialog. `Cmd+Shift+S` always triggers Save As.
6. Rust validates the path, records a self-write (for watcher suppression), then writes the markdown string to disk

## Editor Behavior & UX

### WYSIWYG rendering

- Content renders fully styled (bold text looks bold, headings are large, etc.)
- Crepe provides built-in cursor and editing UX for all block types
- **Post-MVP:** Typora-style inline syntax toggling (show raw markdown when cursor enters an element). This requires deep ProseMirror customization beyond what Milkdown or Crepe provide out of the box.

### Document layout

- Clean, minimal single-pane view
- Floating format toolbar appears on text selection (bold, italic, code, link, strikethrough) — provided by Crepe's Toolbar feature
- Slash command menu (type `/` to insert blocks) — provided by Crepe's BlockEdit feature
- Link tooltips on hover — provided by Crepe's LinkTooltip feature
- Title bar shows filename and a dot indicator when there are unsaved changes
- Error banner at top of window for file operation failures (dismissible)
- Keyboard shortcuts for all formatting (`Cmd+B`, `Cmd+I`, `Cmd+K` for link, etc.)

### Images

- Rendered inline via Crepe's ImageBlock feature
- Images loaded via Tauri's asset protocol with dynamic scoping — when a file is opened, the file's parent directory is added to the allowed scope (non-recursive)
- Sensitive subdirectories (`.ssh`, `.gnupg`, `.aws`, etc.) are explicitly forbidden after each scope expansion
- **Post-MVP:** Drag-and-drop to insert images

### Tables (GFM)

- Rendered as actual table UI with tab-to-next-cell navigation
- Add/remove row/column via context menu or small `+` buttons on hover
- Powered by Crepe's Table feature (GFM-compatible)

### Code blocks

- Full code editing via CodeMirror 6 (provided by Crepe's CodeMirror feature)
- Syntax highlighting, auto-indent, bracket matching
- Language selector dropdown appears in each code block

## Rust Backend & File Handling

### CLI integration

- Tauri app registers as a handler for `.md` files on macOS
- Running `skriv file.md` or `open file.md` opens the file in the app
- **Post-MVP:** Multi-window / single-instance support

### Tauri commands

| Command | Purpose |
|---------|---------|
| `read_file(path)` | Validate path via ValidatedPath, read markdown from disk |
| `write_file(path, content)` | Validate path, record self-write for watcher suppression, write to disk |
| `write_new_file(path, content)` | Validate path for new file (Save As), write to disk |
| `watch_file(path)` | Validate path, start watching for external changes |
| `unwatch_file()` | Stop watching |
| `get_file_info(path)` | Validate path, return metadata (name, dir, modified time) |
| `get_opened_file()` | Return file path passed via CLI args or macOS file association |

### File watching

- Uses the `notify` v8 crate to watch the open file
- On external change, emits a Tauri event to the frontend
- Frontend shows a prompt: "File changed on disk. Reload?"
- Self-write suppression: when the app saves a file (`Cmd+S`), the watcher ignores the resulting filesystem event (timestamp-based, 1-second window) to prevent spurious "Reload?" prompts

### Save As

- `Cmd+Shift+S` always triggers a native Save As dialog (via `tauri-plugin-dialog`)
- `Cmd+S` on an untitled document also triggers Save As
- Uses `write_new_file` command with `ValidatedPath::new_for_write` (validates extension and parent directory)

## Security Model

### Path validation

All file I/O commands use `ValidatedPath` — a Rust type that:
- Canonicalizes paths (resolves symlinks, `..`, relative paths)
- Restricts to `.md` and `.markdown` extensions only
- Prevents reading/writing arbitrary files from the webview

### Content Security Policy

Restrictive CSP configured in `tauri.conf.json`:
- `script-src 'self'` — no inline scripts
- `img-src 'self' asset: https:` — images from asset protocol and HTTPS
- `style-src 'self' 'unsafe-inline'` — allows Crepe's inline styles

### Asset protocol scoping

Dynamic scoping: when a markdown file is opened, its parent directory is added to the asset protocol's allowed scope (non-recursive). This ensures relative image paths work regardless of where the file lives. Sensitive directories (`.ssh`, `.gnupg`, `.aws`, `.config`, `.kube`) are explicitly forbidden after each expansion. The scope function is internal to the Rust backend — never exposed as a Tauri command. Scope accumulates per session (Tauri v2 has no revocation API); restarting the app resets it.

### HTML sanitization

Milkdown Crepe bundles DOMPurify for link URL and HTML content sanitization, providing defense-in-depth against XSS via malicious markdown.

## Error Handling

- All Tauri `invoke` calls are wrapped in try/catch
- Errors are stored in `useFile` hook state and displayed via a dismissible `ErrorBanner` component at the top of the window
- File operation failures (read, write, watch) show descriptive error messages from the Rust backend
- Save failures do not silently lose data — the modified indicator remains until a successful save

## Tech Stack

- **Tauri v2** — desktop shell
- **React 18+** with TypeScript — frontend
- **Milkdown Crepe v7** (`@milkdown/crepe`, `@milkdown/react`) — batteries-included WYSIWYG editor (CodeMirror, toolbar, block editing, tables, image blocks, DOMPurify)
- **Vite** — frontend build tool
- **Rust stable** — backend
- **notify v8** crate — file watching
- **tauri-plugin-dialog** — native file picker and Save As dialogs

## Project Structure

```
skriv/
├── src-tauri/                  # Rust/Tauri desktop shell
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
│       └── skriv.css          # Custom Typora-like theme overrides on Crepe
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js           # ESLint flat config
├── .prettierrc                # Prettier config
├── .mise.toml                 # Dev dependency versions (Node, Rust)
├── LICENSE                    # MIT license
└── THIRD-PARTY-NOTICES        # Bundled dependency attribution
```

## Testing Strategy

- **Rust:** Unit tests for `ValidatedPath` and file I/O commands (in each module)
- **Frontend:** Manual testing for MVP; Vitest for hooks in post-MVP
- **E2E:** Manual testing for the full flow; Tauri WebDriver in post-MVP

## Post-MVP

- Cursor-aware Typora-style inline syntax toggling
- Drag-and-drop image insertion
- Auto-save (optional, configurable debounce)
- Multi-window / single-instance support
- Dark mode theme
- Web version (same frontend, different file backend)
- Dynamic asset protocol scope expansion per opened file
