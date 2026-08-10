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
- **Keyboard shortcuts:** Source mode toggle is `Cmd+M`; Cmd+E / Cmd+Alt+X are aliases onto ProseMark's inline-code/strikethrough commands (`ui/live-preview/keymap.ts`).

## Debugging Frontend Code

- **Always instrument first**: add diagnostic logging showing the decision path before attempting fixes
- **Check the console output in the webview DevTools** (Cmd+Option+I in Tauri), not the terminal — `console.log` from frontend JS goes to the webview
- **Verify fixes are running**: After adding diagnostic logging, check that expected log lines appear. Vite may serve stale cached code if a previous build had errors.
