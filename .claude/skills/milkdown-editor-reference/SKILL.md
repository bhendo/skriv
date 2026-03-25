---
name: milkdown-editor-reference
description: Use when modifying Milkdown editor, ProseMirror plugins, CodeMirror integration, or editor handle wiring in ui/plugins/, ui/components/Editor.tsx, ui/components/SourceEditor.tsx, or ui/hooks/useSearch.ts
---

# Milkdown / ProseMirror / CodeMirror Reference

## Accessing ProseMirror from Milkdown

`editor.ctx.get(editorViewCtx)` returns the ProseMirror `EditorView`. Import `editorViewCtx` from `@milkdown/core`. Type the context as `Editor["ctx"]` — do NOT import `Ctx` from `@milkdown/ctx` (transitive dep, not installed directly).

## Plugin Registration

| Helper | From | Use for |
|--------|------|---------|
| `$prose(() => plugin)` | `@milkdown/utils` | Raw ProseMirror plugins |
| `$node(name, () => spec)` | `@milkdown/utils` | Custom nodes (returns `$Node` directly) |
| `$view(node, () => factory)` | `@milkdown/utils` | NodeView constructors (first arg is `$Node`) |
| `$remark(() => plugin)` | `@milkdown/utils` | Remark plugins |

Register with `crepe.editor.use(plugin)`. Do NOT use `remarkPluginsCtx` via `config()` — Crepe overwrites it.

## Plugin Conventions

- **`addToHistory: false`** on auto-reconciliation transactions — prevents garbage undo steps
- **IME composing guard** — track `compositionstart`/`compositionend` with a flag, suppress transitions while composing. Skipping breaks CJK input
- **`getPos()` returns `undefined`** when node is being removed — always null-check
- **CM↔PM sync guard** — NodeViews with embedded CodeMirror need a boolean `updating` flag to prevent dispatch loops. See `mermaid-block/view.ts`

## Shared Utilities

- **`makeDecorationPlugin(name, build, opts?)`** in `block-source/decoration.ts` — factory for decoration-only plugins. Options: `rebuildOnSelection`, `cacheKey`. Use instead of raw `Plugin` boilerplate
- **`findAncestorOfType(state, name)`** — "am I inside X?" (walks depth stack)
- **`findFirstNodeOfType(doc, name)`** — "does X exist?" (descends entire doc)
- Both in `block-source/cursor.ts`

## Transaction Gotchas

- **Selection changes trigger `docChanged`.** Milkdown reconciliation fires follow-up transactions with `tr.docChanged = true`. Plugin state that recomputes on doc change must preserve indexes when matches are unchanged
- **`tr.scrollIntoView()` doesn't scroll the outer container.** Use DOM `element.scrollIntoView()` inside `requestAnimationFrame` instead

## CodeMirror `basicSetup` Contents

Bundles: `lineNumbers`, `highlightActiveLineGutter`, `highlightSpecialChars`, `history`, `foldGutter`, `drawSelection`, `dropCursor`, `allowMultipleSelections`, `indentOnInput`, `syntaxHighlighting(defaultHighlightStyle)`, `bracketMatching`, `closeBrackets`, `autocompletion`, `rectangularSelection`, `crosshairCursor`, `highlightActiveLine`, `highlightSelectionMatches`, plus keymaps for closeBrackets, default, search, history, fold, completion, lint. `@codemirror/lint` is not installed in this project.

## CodeMirror Programmatic Search

From `@codemirror/search`: `search()` extension MUST be installed (even without panel). Exclude `searchKeymap` to suppress built-in Cmd+F. Use `SearchQuery` + `setSearchQuery.of(sq)` effect to set query, `findNext`/`findPrevious` to navigate, `getSearchQuery(state).getCursor(doc)` to iterate matches.

## EditorHandle

Both editors expose via `useImperativeHandle`: `getMarkdown()`, `getMilkdownCtx?()` (WYSIWYG), `getCodeMirrorView?()` (source). Defined in `ui/types/editor.ts`.

## CodeMirror Theming

Two layers: (1) `oneDark` extension for syntax colors, (2) CSS overrides via `--crepe-color-surface`. Inline editors: `oneDark` + `milkdown-code-block` class. Source mode: `oneDark` + CSS on `.source-editor .cm-editor`.

## Testing

**Vitest:** Mock CodeMirror/Milkdown modules with `vi.mock()` (jsdom doesn't support their DOM). See `SourceEditor.test.tsx` and `Editor.test.tsx`. Plugin tests use raw ProseMirror `Schema`/`EditorState` directly.

**Playwright:** `loadApp` fixture injects Tauri mocks before `page.goto()`. Use `MOD` for cross-platform Cmd/Ctrl. See `e2e/fixtures/tauri-mock.ts` for `TauriMockConfig`.
