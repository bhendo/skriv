# Cursor-Aware Syntax Toggling for Fenced Code Blocks

**Issue:** [#30](https://github.com/bhendo/skriv/issues/30)
**Date:** 2026-03-19

## Summary

When the cursor enters a fenced code block, reveal the opening and closing `` ``` `` fences as read-only widget decorations positioned before and after the `code_block` node. The opening fence displays the language identifier (if set). When the cursor leaves, the fences disappear. This reveals the markdown structure to the user without interfering with Crepe's CodeMirror integration.

## Scope

- Opening fence: `` ```language `` displayed above the code block
- Closing fence: `` ``` `` displayed below the code block
- Muted syntax marker styling consistent with inline source
- Read-only fences in v1 — language editing via Crepe's existing language picker
- Conditional registration behind the `syntaxToggling` prop and Cmd+Shift+E toggle

### Out of Scope (V2)

- Editable language identifier in the fence line
- Fence deletion gesture to convert code block to paragraph (existing Backspace-on-empty behavior is sufficient)

## Approach: Widget Decorations

When the cursor is inside a code block, the plugin adds two ProseMirror widget decorations at the block boundaries — one before and one after the `code_block` node. These render as block-level DOM elements showing the fence syntax.

### Why This Approach

Other approaches were considered:

- **Transient block node** (like `inline_source` / `heading_source`) — code block content lives in CodeMirror, not ProseMirror. A transient node would need to replicate all of Crepe's CodeMirror integration (language picker, copy button, syntax highlighting, focus management). Impractical.
- **Custom/extended NodeView** — Crepe's `CodeMirrorBlock` NodeView embeds CodeMirror 6, a Vue 3 language picker, copy button, and preview panel. Replacing or extending it would require reimplementing all of this functionality.
- **Node decorations + CSS pseudo-elements** — lightweight, but `::before`/`::after` content is not interactive and can't display dynamic attribute values without inline styles.
- **Direct DOM manipulation** — fragile; conflicts with ProseMirror's and Vue's DOM management inside the NodeView.

Widget decorations are the right choice because **fences are structural delimiters, not editing controls**. Unlike heading prefixes (where `##` IS the control for heading level), the triple backtick is just a delimiter. The language identifier — the only semantically meaningful part — is already editable via Crepe's searchable language picker dropdown (100+ languages). The fences serve to **reveal markdown structure**, not to be the editing interface.

This differs from inline marks, where widget decorations were rejected because markers needed to be editable (deleting `**` removes bold). For code blocks, read-only fence display is sufficient.

## Design

### Schema Changes

None. The `code_block` node schema remains unchanged:

```ts
code_block: {
  content: "text*",
  group: "block",
  attrs: { language: { default: "" } },
  marks: "",
  code: true,
  defining: true,
}
```

The fences are purely visual decorations, never part of the document content.

### Cursor Detection

Detection must handle how Crepe's `CodeMirrorBlock` NodeView manages the ProseMirror-CodeMirror focus bridge.

**Key finding:** The `CodeMirrorBlock` NodeView has `stopEvent() { return true }`, which means ProseMirror does not process click events inside the code block DOM. Instead, the NodeView's `forwardUpdate()` method bridges the gap — when CodeMirror receives focus and its selection changes, `forwardUpdate` creates a `TextSelection` inside the `code_block` content and dispatches it to ProseMirror.

ProseMirror selection states when a code block has focus:

| User action | ProseMirror selection |
|-------------|----------------------|
| Click into CodeMirror | `TextSelection` inside `code_block` (via `forwardUpdate`) |
| Arrow into block from ProseMirror | Briefly `NodeSelection`, then `TextSelection` inside (via `selectNode` → CM focus → `forwardUpdate`) |
| Typing in CodeMirror | `TextSelection` inside `code_block` (via `forwardUpdate`) |
| Arrow out of CodeMirror | `TextSelection` outside `code_block` (via `maybeEscape`) |

The detection function checks both selection types:

```ts
function getActiveCodeBlock(state: EditorState): { pos: number; node: Node } | null {
  const sel = state.selection;

  // Case 1: NodeSelection on code_block (brief state during arrow-key entry)
  if (sel instanceof NodeSelection && sel.node.type.name === 'code_block') {
    return { pos: sel.from, node: sel.node };
  }

  // Case 2: TextSelection inside code_block (primary state — click or steady-state)
  const $from = sel.$from;
  if ($from.parent.type.name === 'code_block') {
    return { pos: $from.before(), node: $from.parent };
  }

  return null;
}
```

**Timing:** There is a brief gap between a click landing on CodeMirror and `forwardUpdate` dispatching the `TextSelection` to ProseMirror. This is imperceptible — it resolves within the same event loop. The fences appear on the next state update, which is immediate.

### State Machine

The state machine is simpler than inline source because it uses decorations (not document transforms):

```
IDLE ──[cursor enters code_block]──→ ACTIVE (show fences)
ACTIVE ──[cursor leaves code_block]──→ IDLE (hide fences)
ACTIVE ──[cursor moves to different code_block]──→ ACTIVE (move fences)
```

No `appendTransaction` is needed. The decoration lifecycle is fully managed by the plugin's `state.apply()` and `decorations` prop.

**Plugin state:**

```ts
interface CodeBlockFenceState {
  activePos: number | null;  // position of the selected code_block, or null
  language: string;          // language attribute of the selected code_block
}
```

- `state.init`: `{ activePos: null, language: "" }`
- `state.apply(tr)`: Calls `getActiveCodeBlock()` on the new state. If a code block is active, records its position and language. Otherwise, clears to null.
- `decorations(state)`: If `activePos !== null`, returns a `DecorationSet` with two widget decorations. Otherwise, returns `DecorationSet.empty`.

**Invariant:** At most one code block has visible fences at any time. ProseMirror's selection model ensures only one `NodeSelection` or one cursor position exists, so this is enforced by the selection system itself.

### Widget Decorations

Two widget decorations are created when a code block is active:

**Opening fence** — widget at position `activePos` (before the code_block node):

```html
<div class="code-fence code-fence-open">
  <span class="syntax-marker">```</span><span class="fence-language">javascript</span>
</div>
```

**Closing fence** — widget at position `activePos + node.nodeSize` (after the code_block node):

```html
<div class="code-fence code-fence-close">
  <span class="syntax-marker">```</span>
</div>
```

If the `language` attribute is empty, the `.fence-language` span is omitted from the opening fence.

Widget positioning uses `side: -1` for the opening fence (before the node) and `side: 1` for the closing fence (after the node). These render as block-level DOM elements in the document flow, appearing above and below the code block's NodeView DOM.

### CodeMirror Integration

No changes to CodeMirror or the `CodeMirrorBlock` NodeView. The widget decorations are positioned at document positions *outside* the `code_block` node, so they render as sibling DOM elements of the NodeView's root `div.milkdown-code-block`. They do not interfere with:

- CodeMirror's editor instance or syntax highlighting
- The CodeMirror-ProseMirror content synchronization (`forwardUpdate` / `update`)
- The language picker dropdown (Vue component)
- Focus management (`selectNode` / `deselectNode`)
- The `updating` flag that prevents circular updates
- Copy button, preview panel, or toolbar features

### Language Editing

In v1, the fence displays the language read-only. The user edits the language via Crepe's existing language picker dropdown, which appears in the code block's toolbar on hover/selection. The fence automatically reflects the current `language` attribute because the plugin rebuilds decorations on every state change — when the picker dispatches a transaction updating the attribute, `state.apply` sees the new value and the decoration is rebuilt.

### Code Block to Paragraph Conversion

The existing `CodeMirrorBlock` NodeView already handles this: pressing Backspace when the CodeMirror content is empty and on a single line deletes the `code_block` and replaces it with a paragraph. This behavior is unchanged. The fences simply disappear because the node is no longer a `code_block`.

### Undo/Redo

Fences are decorations, not document content. Undo/redo does not affect them. If undo restores a deleted `code_block`, re-selecting it re-shows the fences.

### IME / Composition Guard

Not needed. The fences are read-only decorations with no editable content. CodeMirror handles its own IME composition independently.

### Toggling

The fence plugin is registered conditionally alongside inline source:

- **`syntaxToggling` prop** on `MarkdownEditor` — when `false`, the fence plugin is not registered.
- **Cmd+Shift+E** keyboard shortcut — runtime toggle that recreates the editor with/without all syntax toggling plugins.

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Empty code block | Fences still show. Opening fence displays `` ``` `` or `` ```lang `` based on attribute. |
| Code block at start of document | Widget at position 0 — ProseMirror inserts it before the NodeView DOM correctly. |
| Code block at end of document | Widget after the code block renders correctly after the NodeView DOM. |
| Adjacent code blocks | Only the selected block shows fences. No visual conflict. |
| Very long code content | No impact — fences are fixed-size DOM elements outside CodeMirror content. |
| Language change via picker | Transaction updates `language` attr → `state.apply` sees new value → decorations rebuild → fence reflects new language. |
| Multiple code blocks | ProseMirror's selection ensures at most one cursor position → at most one block has fences. |

## Composition with Other Features

Code blocks have `marks: ""` and `code: true`. No inline marks exist inside them. The inline source plugin (#8) and overlapping marks (#31) have zero interaction with code block fences.

When a code block is inside a list item, both the list marker (#29) and code block fences can be active simultaneously. Each plugin independently detects its own active state and manages its own decorations/NodeView. This is correct — multiple syntax markers should be visible at the same time, not competing for a single "active" slot.

Active-block detection uses **shared utility functions** (not a centralized plugin). Each plugin imports detection helpers from `ui/plugins/block-source/cursor.ts` but independently manages its own decorations and state. This avoids coupling between features with different mechanisms (decorations vs. `appendTransaction` vs. NodeView swaps).

The shared cursor detection module exports:

```ts
// ui/plugins/block-source/cursor.ts

/** Walk the resolved position's depth stack and return the innermost ancestor of the given type. */
function findAncestorOfType(
  state: EditorState,
  typeName: string
): { pos: number; node: Node; depth: number } | null;

/** Check if the selection (TextSelection or NodeSelection) is inside a node of the given type. */
function isInsideBlockType(state: EditorState, typeName: string): boolean;
```

The code block plugin uses `findAncestorOfType(state, 'code_block')` internally, but also checks for `NodeSelection` on the code block directly (since `findAncestorOfType` only handles `TextSelection` depth walks). The heading and list plugins use the same helpers for their respective node types.

## Styling

```css
.milkdown .editor .code-fence {
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  font-size: 0.85em;
  line-height: 1.6;
  padding: 2px 16px;
  color: var(--crepe-color-on-surface-variant, #666);
  user-select: none;
}

.milkdown .editor .code-fence .syntax-marker {
  opacity: 0.4;
}

.milkdown .editor .code-fence .fence-language {
  opacity: 0.6;
}
```

## Files

- `ui/plugins/code-block-source/plugin.ts` — ProseMirror plugin: `getActiveCodeBlock`, plugin state, widget decoration creation, fence DOM builders
- `ui/plugins/code-block-source/index.ts` — barrel exports
- `ui/plugins/block-source/cursor.ts` — shared cursor detection utilities (`isInsideBlockType`)
- `ui/components/Editor.tsx` — register plugin with `crepe.editor.use()`, conditional on `syntaxToggling`
- `ui/theme/skriv.css` — `.code-fence` and `.fence-language` styles

### Read-Only Mode

When the editor is in read-only mode (`editable: false`), fences should still appear on cursor entry. Since the fences are read-only decorations anyway, they provide value to readers by revealing document structure. The plugin does not need to check the editor's editable state — the decorations are purely informational. CodeMirror's own read-only mode (managed by the `CodeMirrorBlock` NodeView) is unaffected.

## V2: Editable Language in Fence

If user feedback shows that editing the language directly in the fence line is desired, the widget decoration's `.fence-language` span can be upgraded to a `contenteditable` element or `<input>` with DOM event listeners. Changes would dispatch ProseMirror transactions to update the `language` attribute. This adds focus management complexity (three regions: fence input, CodeMirror, ProseMirror) but the overall architecture is unchanged — still widget decorations, same plugin state, same detection logic.

**Language picker conflict:** If V2 adds an editable language input in the fence, it could show a conflicting value with Crepe's language picker dropdown during mid-edit (e.g., the user is typing "java" in the fence while the picker still shows "JavaScript"). To avoid this, the fence input and picker must be kept in sync — either the fence input dispatches `language` attribute updates on every keystroke (so the picker reflects partial input), or the language picker is hidden while the fence input is focused and vice versa. The simpler approach is to hide the picker toolbar when fences are visible, since the fence input supersedes it.
