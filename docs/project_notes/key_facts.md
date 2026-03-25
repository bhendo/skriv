# Key Facts

Project configuration and important reference information.

## ProseMirror / Milkdown Internals

- **appendTransaction timing**: Called after EACH dispatch cycle. Receives accumulated transactions. ProseMirror's DOM observer fires SEPARATE selection-only dispatches after input rules settle — these have `docChanged=false` even though they're artifacts of the input-rule conversion.
- **Input rules**: Fire on text input regardless of parent node's `marks` constraint. A node with `marks:""` still has its text content matched by input rules — marks are applied then stripped by schema enforcement.
- **handleTextInput vs handleKeyDown**: `handleTextInput` intercepts character insertion (bypasses input rules if returns true). `handleKeyDown` intercepts key events before the keymap. Returning false from handleKeyDown lets the keymap proceed.
- **Node positions**: For inline node at pos P with nodeSize N: P is BEFORE the opening token (outside), P+1 to P+N-1 is inside, P+N is AFTER the closing token (outside). Use strict inequality (`>` / `<`) for "inside" checks.
- **Milkdown custom input rules**: Tagged with `MILKDOWN_CUSTOM_INPUTRULES$` meta on their transactions.

## Milkdown / CodeMirror Editor Reference

See `milkdown-editor-reference` skill for plugin registration patterns, context access, basicSetup contents, CodeMirror search API, theming, and transaction gotchas.

Additional notes not in the skill:
- **Crepe's CodeMirrorBlock:** Uses `basicSetup` + `drawSelection()` + `keymap.of(defaultKeymap.concat(indentWithTab))` + config extensions. Source at `@milkdown/components/src/code-block/view/node-view.ts`.
- **`$node()` return type:** Returns `$Node` directly (has `.type(ctx)` method and `.id`). Pass directly to `$view()`, not `.node`.
- **`$view()` first argument:** Expects `$Node | $Mark`, not a slice or node type.
- **Keyboard shortcuts:** Source mode toggle is `Cmd+M`. `Cmd+/` is free for CodeMirror's `toggleComment`.

## E2E Style Testing

When adding or modifying custom components that should visually match library-provided ones (code blocks, editors, etc.), **write Playwright e2e tests that compare computed styles** against the reference component. This catches styling drift that unit tests can't detect.

- **Helpers in `e2e/fixtures/index.ts`:** `getComputedStyles(locator, props)` extracts computed CSS values; `dumpStyleDiagnostics(locator, props)` dumps classes, styles, and ancestor chain for debugging.
- **Test both light and dark mode** using `page.emulateMedia({ colorScheme })`.
- **Compare against the working component** rather than hardcoding expected values — this way tests stay valid when Crepe's theme changes.
- See `e2e/tests/mermaid.spec.ts` "Mermaid editor style consistency" and `e2e/tests/source-mode.spec.ts` "Source editor style consistency" for examples.

## Debugging ProseMirror Plugins

- **Always instrument first**: Add console.log to appendTransaction showing decision path, sel positions, docChanged, and transaction metas before attempting fixes
- **Check the console output in the webview DevTools** (Cmd+Option+I in Tauri), not the terminal — `console.log` from frontend JS goes to the webview
- **Verify fixes are running**: After adding diagnostic logging, check that expected log lines appear. Vite may serve stale cached code if a previous build had errors.
