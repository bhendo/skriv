# Skriv

A Typora-style live-preview markdown editor for macOS, built with Tauri, React, and CodeMirror 6.

## Features

- **Live preview editing** — the document is the markdown source; syntax appears when the cursor enters an element and renders away when it leaves, and saves are always byte-faithful
- **Mermaid diagrams** — rendered with pan/zoom, an inline toolbar, and a fullscreen overlay
- **Tables, task lists, images** — GFM rendered in place; click a table to edit its source
- **Syntax-highlighted code blocks** — powered by CodeMirror 6
- **Raw source mode** — `Cmd+M` toggles a plain CodeMirror view with line numbers
- **In-place file editing** — open a `.md` file, edit it, save back to disk
- **File watching** — detects external changes and prompts to reload
- **Keyboard shortcuts** — `Cmd+S` save, `Cmd+Shift+S` save as, `Cmd+O` open, `Cmd+F` search, `Cmd+B/I/E/K` formatting

## Prerequisites

- [mise](https://mise.jdx.dev/) — manages Node and Rust versions
- macOS (Windows/Linux support is planned)

## Quick Start

```bash
git clone https://github.com/bhendo/skriv.git
cd markdown
make setup
make dev
```

## Development

```bash
make dev       # Run the app with hot reload
make build     # Create a distributable binary
make test      # Run Rust unit tests
make lint      # Check frontend (ESLint) + backend (clippy)
make format    # Auto-format all code
make check     # Full CI-style check (lint + format + build)
make clean     # Remove build artifacts
```

## Project Structure

```
src-tauri/     Rust/Tauri desktop shell
ui/            React frontend (CodeMirror live-preview editor)
docs/plans/    Design document and implementation plan
```

## Tech Stack

- **Tauri v2** — desktop shell
- **React 18+** with TypeScript — frontend
- **CodeMirror 6 + ProseMark** — live-preview markdown editor
- **Vite** — frontend build tool
- **Rust** — backend (notify v8 for file watching, tauri-plugin-dialog for native dialogs)

## License

[MIT](LICENSE)
