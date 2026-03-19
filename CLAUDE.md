# Skriv

Typora-style WYSIWYG markdown editor built with Tauri, React, and Milkdown Crepe.

## Tech Stack

- **Tauri v2** — desktop shell (Rust backend)
- **React 18+** with TypeScript — frontend
- **Milkdown Crepe v7** (`@milkdown/crepe`, `@milkdown/react`) — WYSIWYG editor with CodeMirror, toolbar, tables, image blocks, DOMPurify
- **Vite** — frontend build tool
- **Rust stable** — backend (notify v8, tauri-plugin-dialog)
- **sccache** — Rust compilation cache (configured in `src-tauri/.cargo/config.toml`)
- **pnpm** — fast, disk-efficient package manager (content-addressable store, hard-linked `node_modules`)
- **mise** — dev dependency management (Node, Rust, pnpm versions pinned in `.mise.toml`)

## Directory Structure

```
src-tauri/          # Rust/Tauri desktop shell (Tauri desktop shell (Rust backend))
ui/               # React frontend source (was src/)
docs/plans/       # Design doc and implementation plan
```

- `src-tauri/` contains all Rust code, `tauri.conf.json`, and `capabilities/`
- `ui/` contains all React components, hooks, theme CSS, and `index.html`
- Frontend config (`package.json`, `vite.config.ts`, `tsconfig.json`) stays at root

## Key Architecture Decisions

- **Milkdown Crepe** (not raw Milkdown Kit) — provides CodeMirror code blocks, floating toolbar, slash commands, tables, image blocks, and DOMPurify sanitization out of the box
- **ValidatedPath** (`src-tauri/src/validated_path.rs`) — all file I/O commands validate and canonicalize paths, restricting to `.md`/`.markdown` files only
- **Dynamic asset scoping** (`src-tauri/src/scope.rs`) — asset protocol scope starts empty; directories are added when files are opened, with sensitive dirs (`.ssh`, `.gnupg`, etc.) explicitly forbidden
- **Self-write suppression** in file watcher — prevents save from triggering spurious "reload?" prompts
- **Cursor-aware Typora-style syntax toggling is post-MVP** — ProseMirror is not well-suited for this pattern

## Commands

```bash
make setup          # install all dependencies (run once after clone)
make dev            # run the app with hot reload
make build          # create a distributable binary

make check          # run all checks (format, lint, test)
make test           # run all tests
make lint           # run all linters
make format         # auto-format all code

# Granular targets (also used by CI)
make test-ui  # npm test (Vitest)
make test-tauri        # cargo test
make lint-ui  # ESLint
make lint-tauri        # cargo clippy
make format-ui # Prettier
make format-tauri      # cargo fmt
```

## Formatting & Linting

- **Rust:** `cargo fmt` + `clippy` (config in `src-tauri/rustfmt.toml`)
- **TypeScript:** ESLint (`eslint.config.js`) + Prettier (`.prettierrc`), managed by pnpm
- Run `make check` before committing

## Plans

- Design docs live in `docs/plans/` and should be committed
- **Never commit implementation plans** — they are ephemeral working documents, not permanent artifacts

## License

MIT. All dependencies are permissive (MIT, Apache-2.0, CC0, or MPL-2.0/Apache-2.0 dual).
