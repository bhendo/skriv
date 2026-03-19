# Cursor-Aware Typora-Style Inline Syntax Toggling

**Issue:** [#8](https://github.com/bhendo/skriv/issues/8)
**Date:** 2026-03-19

## Summary

When the cursor enters a formatted inline element (bold, italic, strikethrough, inline code), reveal the raw markdown syntax inline and make it editable. When the cursor leaves, parse the raw text back into proper marks. This is Typora's signature UX and the key differentiator for Skriv.

## Scope

### v1 — Inline Marks

- **Bold** (`**text**`)
- **Italic** (`*text*`)
- **Strikethrough** (`~~text~~`)
- **Inline code** (`` `text` ``)
- Nested marks with same boundaries only (e.g., `***bold italic***`)

### Future Phases

- Muted marker styling (opaque nodeView with `.syntax-marker` spans)
- Links — `[text](url)` reveal/edit
- Headings — `##` prefix reveal/edit
- List markers — `-`, `1.` reveal/edit
- Fenced code blocks — ` ``` ` reveal/edit
- Overlapping marks with different boundaries (e.g., `**bold *and italic* only**`)
- Selection spanning multiple marks

## Approach: Inline Source Node with NodeView

When the cursor enters a marked span, replace it with a transient `inline_source` ProseMirror node containing the raw markdown (e.g., `**bold**`). The node uses ProseMirror's `contentDOM` so the raw text is natively editable. When the cursor leaves, parse the raw text back into properly marked content.

### Why This Approach

Other approaches were considered:

- **Widget decorations** — read-only; markers can't be edited or deleted by the user. Doesn't match Typora's behavior where deleting `**` removes bold.
- **Document transform (mark ↔ raw text)** — no new node types, but disruptive to undo history and harder to scope re-parse boundaries.
- **Plugin view + direct DOM manipulation** — fragile; ProseMirror can re-render DOM at any time.

The `inline_source` node gives us full editability, clean state management, and leverages an established ProseMirror pattern (similar to how code blocks work, but inline).

## Design

### Schema: `inline_source` Node

```ts
inline_source: {
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",           // disallow marks inside raw source
  attrs: {
    syntax: { default: "" }  // mark type(s) this replaced, e.g. "strong", "em"
  },
  toDOM: () => ["span", { class: "inline-source" }, 0],
  parseDOM: [],        // transient — never parsed from HTML/markdown
}
```

Key properties:

- `marks: ""` prevents formatted content from being pasted into the node.
- The `syntax` attribute records which mark type was replaced for restoration on leave.
- The node is transient — it only exists while the cursor is inside it and is never serialized to markdown.
- Registered as a Milkdown plugin via `$node()` **before** `crepe.create()`, since ProseMirror schemas are immutable after initialization.

### State Machine: `appendTransaction`

The core logic lives in `appendTransaction`, not `view.update()`, to avoid re-entrancy issues. ProseMirror's `appendTransaction` runs in the transaction pipeline before the view updates, with a built-in 500-iteration loop guard.

**Enter (Rendered → Raw):**

1. On selection change, check if cursor is inside or adjacent to a marked span
2. If a supported mark is found and no `inline_source` node exists:
   - Find the full extent of the mark span (walk `nodeBefore`/`nodeAfter` on the `ResolvedPos`)
   - Build raw text by prepending/appending syntax characters to the text content
   - For nested same-boundary marks, flatten into a single raw string (e.g., `***bold italic***`)
   - Dispatch a transaction (`addToHistory: false`) that replaces the marked span with an `inline_source` node
   - Manually compute and set cursor position inside the new node (accounting for syntax prefix length)

**Leave (Raw → Rendered):**

1. On selection change, check if cursor has moved outside any existing `inline_source` node
2. If yes:
   - Read raw text content from the node
   - Parse for inline markdown syntax (lightweight regex-based parser)
   - Replace the `inline_source` node with resulting marked text nodes
   - Incomplete syntax (e.g., `**bol`) becomes plain unmarked text
   - Empty content removes the node entirely
   - Transaction uses `addToHistory: false`

**Invariant:** At most one `inline_source` node exists in the document at any time. Entering a new mark span triggers leave on the previous one first.

### Cursor Detection

Detection uses `ResolvedPos` API — the idiomatic ProseMirror approach:

```ts
const $pos = state.selection.$cursor;
const nodeBefore = $pos.nodeBefore;  // text node before cursor
const nodeAfter = $pos.nodeAfter;    // text node after cursor
const marksBefore = nodeBefore?.marks ?? [];
const marksAfter = nodeAfter?.marks ?? [];
```

**Boundary behavior:** Markers are visible when the cursor touches the mark boundary (not just strictly inside). This gives a forgiving feel — markers appear as the user arrows into/out of the formatted range.

**Adjacent marks:** When cursor is between two different marked spans, left-bias (expand `nodeBefore`'s mark). This is a v1 limitation.

**Mark span boundaries:** Walk backward/forward through the parent node's children, collecting adjacent text nodes that share the target mark type.

### Cursor Position Mapping

`tr.mapping.map()` does not correctly map interior positions when swapping marked text for raw text. Positions must be computed manually:

**Enter:** Offset in the raw text = offset in the mark span + syntax prefix length (e.g., +2 for `**`).

**Leave:** Offset in the marked text = offset in the raw text − syntax prefix length.

Selection is set explicitly via `tr.setSelection(TextSelection.create(tr.doc, computedPos))`.

### NodeView

Uses the `contentDOM` approach — ProseMirror manages text content directly:

- Outer wrapper: `<span class="inline-source">`
- ProseMirror handles all text editing (typing, backspace, selection, clipboard) natively
- v1 does not sub-wrap marker characters — the full raw text renders uniformly with a subtle background tint
- Future iteration: switch to opaque nodeView for per-character marker styling (muted color)

### Inline Parsing (Raw → Marks on Leave)

Lightweight regex-based parser, scoped to v1 mark types only:

1. `***text***` → `strong` + `em` marks
2. `**text**` or `__text__` → `strong` mark
3. `*text*` or `_text_` → `em` mark
4. `~~text~~` → `strikethrough` mark
5. `` `text` `` → `code_inline` mark
6. No match → plain unmarked text

No dependency on remark. Only handles wrapping syntax patterns with same boundaries.

### Serialization Safety

A remark node serializer is registered alongside the `inline_source` node spec. If `getMarkdown()` is called while an `inline_source` node is active, the serializer converts it back to the appropriate marked markdown — ensuring saves never produce broken output.

### IME / Composition Guard

All enter/leave transitions are skipped during IME composition to avoid breaking CJK input. Composing state is tracked via `compositionstart`/`compositionend` events in the plugin's `view()` method and stored in plugin state for `appendTransaction` to read.

### Undo/Redo

- Enter/leave transitions use `addToHistory: false` — they are presentation changes, not user edits.
- Text edits within the `inline_source` node go into history normally.
- If undo restores content to invalid syntax, the leave transition handles it gracefully (converts to plain text).

## Styling

```css
.inline-source {
  font-family: inherit;
  border-radius: 2px;
  background: var(--crepe-color-inline-area);
}
```

v1 uses a subtle background tint. No per-character marker styling.

## Files

- **New:** `ui/plugins/inlineSource.ts` — ProseMirror plugin, nodeView, inline parser, node spec + serializer
- **Modified:** `ui/components/Editor.tsx` — register plugin with `crepe.editor.use()` before create
- **Modified:** `ui/theme/skriv.css` — `.inline-source` styles
