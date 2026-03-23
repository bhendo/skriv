# E2E Testing with Playwright — Design

**Issue:** #7 (scoped to integration testing; visual regression deferred to separate ticket)

**Problem:** Unit tests pass but the app breaks in practice. Mocked Tauri commands and isolated ProseMirror plugin tests miss integration failures — especially around Milkdown Crepe, input rules, node views, and source mode toggling.

## Approach

Playwright tests running in a real Chromium browser against the Vite dev server. Tauri IPC is mocked at the `window.__TAURI_INTERNALS__.invoke` boundary so everything above that layer — React, Milkdown, ProseMirror, CodeMirror, mermaid, DOMPurify, CSS — runs for real.

## Tauri Mock Layer

Playwright injects a mock before page load that intercepts `window.__TAURI_INTERNALS__.invoke`. The real `@tauri-apps/api` module works unchanged — it talks to the mock instead of a Rust backend.

**Mocked commands:**
- `read_file` — returns configurable markdown content per test
- `write_file` — captures path + content for assertion
- `get_file_info` — returns fake file info
- `watch_file` / `unwatch_file` — no-ops
- `open_file_dialog` / `save_file_dialog` — return preconfigured paths

**Per-test control:** Tests configure mock responses before navigating (e.g., "load the editor with this markdown").

**What stays real:** React, Milkdown Crepe, ProseMirror, CodeMirror, DOMPurify, mermaid rendering, all CSS/theming.

## Test Scenarios (Initial Set)

1. Editor loads and renders markdown (headings, bold, italic, lists, code blocks)
2. Type text, apply formatting via keyboard shortcuts (Cmd+B, Cmd+I) — verify ProseMirror output
3. Toggle source mode (Cmd+/) — verify CodeMirror appears with raw markdown, toggle back preserves content
4. Mermaid fenced blocks render as diagrams (SVG present in DOM)
5. Keyboard shortcuts (Cmd+S triggers save invoke, Cmd+O triggers open invoke)

## File Structure

```
e2e/
  fixtures/              # shared mock setup, test utilities
  tests/
    editor.spec.ts       # load/render tests
    formatting.spec.ts   # keyboard shortcuts, inline formatting
    source-mode.spec.ts  # Cmd+/ toggle, content preservation
    mermaid.spec.ts      # diagram rendering
  playwright.config.ts
```

## Tooling & DX

- **Dependency:** `@playwright/test` (dev)
- **Makefile:** `make test-e2e` standalone target; `make test` runs all three suites (unit UI, Rust, e2e)
- **Server lifecycle:** Playwright's `webServer` config starts/stops Vite automatically
- **Headless by default**, `--headed` flag for debugging
- **CI:** Playwright GitHub Actions support available; can add from day one or as follow-up

## Out of Scope

- Visual regression / screenshot comparison testing (separate ticket)
- Tauri WebDriver / full binary testing
- File watcher integration (tested Rust-side)
