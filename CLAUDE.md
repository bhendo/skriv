# Skriv

Typora-style WYSIWYG markdown editor built with Tauri, React, and Milkdown Crepe.

## Tech Stack

- **Tauri v2** — desktop shell (Rust backend)
- **React 18+** with TypeScript — frontend
- **Milkdown Crepe v7** (`@milkdown/crepe`, `@milkdown/react`) — WYSIWYG editor with CodeMirror, toolbar, tables, image blocks, DOMPurify
- **Vite** — frontend build tool
- **Rust stable** — backend (notify v8, tauri-plugin-dialog)
- **mise** — dev dependency management (Node, Rust versions pinned in `.mise.toml`)

## Directory Structure

```
desktop/          # Rust/Tauri desktop shell (was src-tauri — renamed for clarity)
ui/               # React frontend source (was src/)
docs/plans/       # Design doc and implementation plan
```

- `desktop/` contains all Rust code, `tauri.conf.json`, and `capabilities/`
- `ui/` contains all React components, hooks, theme CSS, and `index.html`
- Frontend config (`package.json`, `vite.config.ts`, `tsconfig.json`) stays at root

## Key Architecture Decisions

- **Milkdown Crepe** (not raw Milkdown Kit) — provides CodeMirror code blocks, floating toolbar, slash commands, tables, image blocks, and DOMPurify sanitization out of the box
- **ValidatedPath** (`desktop/src/validated_path.rs`) — all file I/O commands validate and canonicalize paths, restricting to `.md`/`.markdown` files only
- **Dynamic asset scoping** (`desktop/src/scope.rs`) — asset protocol scope starts empty; directories are added when files are opened, with sensitive dirs (`.ssh`, `.gnupg`, etc.) explicitly forbidden
- **Self-write suppression** in file watcher — prevents save from triggering spurious "reload?" prompts
- **Cursor-aware Typora-style syntax toggling is post-MVP** — ProseMirror is not well-suited for this pattern

## Commands

```bash
# Dev dependencies
mise install

# Run the app
npm run tauri dev

# Rust
cd desktop && cargo test
cd desktop && cargo fmt --check
cd desktop && cargo clippy -- -D warnings

# Frontend
npm run lint
npm run format:check
```

## Formatting & Linting

- **Rust:** `cargo fmt` + `clippy` (config in `desktop/rustfmt.toml`)
- **TypeScript:** ESLint (`eslint.config.js`) + Prettier (`.prettierrc`)
- Run both before committing

## Plans

- Design doc: `docs/plans/2026-03-18-skriv-design.md`
- Implementation plan: `docs/plans/2026-03-18-skriv-implementation.md`

## License

MIT. All dependencies are permissive (MIT, Apache-2.0, CC0, or MPL-2.0/Apache-2.0 dual).
