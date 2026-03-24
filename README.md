# Skriv

A Typora-style WYSIWYG markdown editor for macOS, built with Tauri, React, and Milkdown Crepe.

## Features

- **Inline WYSIWYG editing** — write markdown, see it rendered as you type
- **Syntax-highlighted code blocks** — powered by CodeMirror 6
- **Tables, images, lists** — full GFM support with interactive editing
- **Floating toolbar** — appears on text selection for quick formatting
- **Slash commands** — type `/` to insert blocks
- **In-place file editing** — open a `.md` file, edit it, save back to disk
- **File watching** — detects external changes and prompts to reload
- **Keyboard shortcuts** — `Cmd+S` save, `Cmd+Shift+S` save as, `Cmd+O` open

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
ui/            React frontend (Milkdown Crepe editor)
docs/plans/    Design document and implementation plan
```

## Tech Stack

- **Tauri v2** — desktop shell
- **React 18+** with TypeScript — frontend
- **Milkdown Crepe v7** — WYSIWYG editor (CodeMirror, toolbar, tables, image blocks)
- **Vite** — frontend build tool
- **Rust** — backend (notify v8 for file watching, tauri-plugin-dialog for native dialogs)

## License

[MIT](LICENSE)
