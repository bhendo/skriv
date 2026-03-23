# Key Facts

Project configuration and important reference information.

## ProseMirror / Milkdown Internals

- **appendTransaction timing**: Called after EACH dispatch cycle. Receives accumulated transactions. ProseMirror's DOM observer fires SEPARATE selection-only dispatches after input rules settle — these have `docChanged=false` even though they're artifacts of the input-rule conversion.
- **Input rules**: Fire on text input regardless of parent node's `marks` constraint. A node with `marks:""` still has its text content matched by input rules — marks are applied then stripped by schema enforcement.
- **handleTextInput vs handleKeyDown**: `handleTextInput` intercepts character insertion (bypasses input rules if returns true). `handleKeyDown` intercepts key events before the keymap. Returning false from handleKeyDown lets the keymap proceed.
- **Node positions**: For inline node at pos P with nodeSize N: P is BEFORE the opening token (outside), P+1 to P+N-1 is inside, P+N is AFTER the closing token (outside). Use strict inequality (`>` / `<`) for "inside" checks.
- **Milkdown custom input rules**: Tagged with `MILKDOWN_CUSTOM_INPUTRULES$` meta on their transactions.

## Milkdown Plugin Registration

- **Remark plugins:** Use `$remark()` from `@milkdown/utils` and register with `.use()`. Do NOT manually update `remarkPluginsCtx` via `config()` — Crepe's initialization overwrites it.
- **`$node()` return type:** Returns `$Node` directly (has `.type(ctx)` method and `.id`). Pass directly to `$view()`, not `.node` — the `.node` pattern is from Milkdown preset schemas, not `$node()`.
- **`$view()` first argument:** Expects `$Node | $Mark`, not a slice or node type.
- **Crepe's CodeMirrorBlock:** Uses `basicSetup` from `codemirror` package + `drawSelection()` + `keymap.of(defaultKeymap.concat(indentWithTab))` + config extensions. Source at `@milkdown/components/src/code-block/view/node-view.ts`.

## Debugging ProseMirror Plugins

- **Always instrument first**: Add console.log to appendTransaction showing decision path, sel positions, docChanged, and transaction metas before attempting fixes
- **Check the console output in the webview DevTools** (Cmd+Option+I in Tauri), not the terminal — `console.log` from frontend JS goes to the webview
- **Verify fixes are running**: After adding diagnostic logging, check that expected log lines appear. Vite may serve stale cached code if a previous build had errors.
