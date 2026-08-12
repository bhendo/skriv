# Key Facts

Project configuration and important reference information.
(ProseMirror/Milkdown internals notes were removed with the editor-core
pivot, ADR-003; see git history if archaeology is ever needed.)

## CodeMirror / ProseMark Internals

- **Fold driver guard**: ProseMark's `foldableSyntaxFacet` driver only calls a spec's `buildDecorations` while the selection is OUTSIDE the node, unless `keepDecorationOnUnfold` is set. No touch-guard needed inside specs.
- **Facet auto-enable**: `foldableSyntaxFacet` declares `enables: foldExtension`, so providing any spec installs the fold StateField automatically.
- **Syntax hiding**: marks are hidden with `.cm-hidden-token { font-size: 0px }` — the text stays in the DOM (assert on the class in tests, not textContent).
- **Block replace decorations** must cover full lines; expand with `fullLineRange` from `ui/live-preview/fold-widget.ts`.
- **Widget lifecycle**: CodeMirror reuses widget DOM when `eq()` matches; `destroy(dom)` fires for dropped tiles — pair module-level WeakMap cleanups with it.
- **ProseMark theming**: all colors flow through `--pm-*` CSS variables set on `.cm-content` (see `ui/theme/skriv.css`); `--font` is its prose font hook.
- **searchKeymap exclusion**: Cmd+F belongs to the shared SearchBar; the search() extension is installed without its keymap in both editors.
- **Keyboard shortcuts:** Source mode toggle is `Cmd+M`; Cmd+E / Cmd+Alt+X are aliases onto ProseMark's inline-code/strikethrough commands (`ui/live-preview/keymap.ts`); Cmd+Shift+L is the outline three-state toggle.
- **Height-map position lookup**: `view.lineBlockAtHeight(screenY - view.documentTop)` resolves scroll positions OUTSIDE the rendered viewport (CM height estimates); `coordsAtPos` returns null there. Used by the outline scroll-spy (`ui/hooks/useToc.ts`) and the mode-toggle position capture (`ui/utils/editorPosition.ts`). `.cm-scroller` (`view.scrollDOM`) is the real scroll container, not the wrapper div in App.tsx.
- **StrictMode remount discards parent-effect dispatches**: child effects run before parent effects, so an App-level effect does find a freshly mounted EditorView — but in dev, StrictMode then unmounts/remounts the new component, rebuilding the view AFTER parent effects ran. One-shot state applied from a parent effect (selection, scroll) is silently lost; persistent wiring (listeners that re-probe, like the outline scroll-spy) self-heals. Apply one-shot restores in the component's own mount effect (see `restorePosition` in the editor components, #65).

## Tauri Multi-Window Events

- **Per-window events need both halves**: Rust `emit_to(label, ...)` AND frontend `getCurrentWindow().listen(...)`. A global `listen()` from `@tauri-apps/api/event` registers target `Any` and receives every event regardless of the emit target; `win.emit(...)` broadcasts. See bugs.md 2026-08-11.
- **Menu accelerators are macOS-only** (`accel()` in `src-tauri/src/menu.rs`): on macOS the webview sees keydown FIRST and `preventDefault` suppresses the menu key equivalent (verified: Cmd+M toggles source mode, not the Window menu's Minimize), so `useKeyboardShortcuts` always wins and the accelerators are hints/fallbacks. Windows/Linux interception order differs per backend, so menu items carry no accelerators there.
- **Recents**: JSON array of canonical paths at `app_config_dir()/recents.json` (`~/Library/Application Support/com.skriv.editor/` on macOS), capped at 15, pruned of deleted files on read. Recording happens in `read_file`/`write_new_file` only — every open flow funnels through `read_file` — and runs on a blocking-task thread; the `recents-changed` broadcast carries the pruned list as payload.

## Debugging Frontend Code

- **Always instrument first**: add diagnostic logging showing the decision path before attempting fixes
- **Check the console output in the webview DevTools** (Cmd+Option+I in Tauri), not the terminal — `console.log` from frontend JS goes to the webview
- **Verify fixes are running**: After adding diagnostic logging, check that expected log lines appear. Vite may serve stale cached code if a previous build had errors.
- **Playwright `hasText` strings are case-insensitive substrings**: `{ hasText: "Section 5" }` also matches "…of section 5…" body lines. Anchor with a regex (`{ hasText: /^Section 5$/ }`) when text can collide.
