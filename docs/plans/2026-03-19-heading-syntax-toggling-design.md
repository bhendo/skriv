# Cursor-Aware Heading Syntax Toggling

**Issue:** [#28](https://github.com/bhendo/skriv/issues/28)
**Date:** 2026-03-19

## Summary

When the cursor enters a heading, reveal the raw markdown prefix (`##` for h2, `###` for h3, etc.) and make it editable. The user can add or remove `#` characters to change the heading level. When the cursor leaves, parse the prefix to determine the new level, strip it, and restore a proper heading node. This extends Skriv's Typora-style syntax toggling from inline marks to block-level elements.

## Scope

- Heading levels 1-6 (`#` through `######`)
- Prefix shown as muted editable text with `.syntax-marker` styling
- Real-time heading level feedback as user edits the prefix
- Composition with `inline_source` (bold/italic inside headings)
- Forward-compatible with #31 (overlapping marks)
- Gated by existing `syntaxToggling` prop and Cmd+Shift+E toggle

## Bundled Fixes (inline_source)

The #28 PR will also fix two bugs in the existing `inline_source` plugin, since `heading_source` shares the same patterns and benefits from these fixes being in place first.

**#34 — Non-cursor selection never triggers leave.** The `$cursor` guard at the top of `handleInlineSourceTransition` (line 93) returns early for any non-cursor selection (`NodeSelection`, range `TextSelection`, `AllSelection`). This means `inline_source` nodes persist when the user triple-clicks, Shift-clicks, or otherwise creates a non-cursor selection outside the node. Fix: restructure the guard so the **leave** path runs for any selection type (only the **enter** path requires a collapsed cursor). The same restructured guard is used in `heading_source`'s `appendTransaction`. ~10 lines changed.

**#35 — Stale syntax marker decorations after Cmd+B/I toggle.** `toggleSyntaxInRawText` modifies the raw text (e.g., wrapping `*text*` with `**` to produce `***text***`) but does not update the `syntax` attr. `buildMarkerDecorations` reads `attrs.syntax` to compute prefix/suffix lengths, so the decoration range is stale after a toggle. Fix: derive prefix/suffix lengths from `textContent` via `parseInlineSyntax` instead of relying on `attrs.syntax`. This makes decorations self-correcting regardless of attr state. `heading_source` already uses this content-derived approach for its decorations. ~4 lines changed.

## Approach: Transient `heading_source` Block Node

When the cursor enters a heading, replace the `heading` node with a transient `heading_source` block node. The prefix (`## `) is prepended as real, editable text at the start of the node's content. The original inline content (bold, links, etc.) is preserved intact. When the cursor leaves, the prefix is parsed, stripped, and the node is restored to a proper `heading` with the appropriate level.

### Why This Approach

Other approaches were considered:

- **Widget decorations** — read-only; the user can't place the cursor inside `## ` and type/delete `#` characters. Doesn't match Typora's behavior where the prefix is truly cursor-navigable and editable.
- **Inject prefix text into the existing heading node** — pollutes the document model. Milkdown's built-in heading serializer (from `@milkdown/preset-commonmark`) would produce `## ## Heading` (double prefix) if `getMarkdown()` is called while the cursor is in the heading. Milkdown's preset serializer can't be easily overridden.
- **Widget decoration + keymap interception** — show `## ` as a read-only widget, intercept `#`/Backspace at position 0 to change level. Simpler, but the prefix isn't truly cursor-navigable or editable — a degraded Typora experience.
- **Custom nodeView with separate prefix DOM** — render an editable `<span>` outside `contentDOM` for the prefix. Fragile; fights ProseMirror's content management. Complex DOM event wiring with poor undo/redo integration.

The transient `heading_source` node wins because:

- It directly mirrors the proven `inline_source` pattern from issue #8.
- The prefix is real, editable text managed by ProseMirror — cursor placement, typing, deletion, and selection all work natively.
- Clean serialization safety via a dedicated `toMarkdown` handler.
- No modification to Milkdown's built-in heading schema.
- The heading's inline content (bold, links, etc.) is preserved intact — only a plain text prefix is prepended/stripped.

### Critical Difference from Inline Source

Unlike `inline_source` which flattens marked text into raw markdown (e.g., `**bold**`), `heading_source` **preserves all inline content as-is**. Only a plain text node (`## `) is prepended at the start. This avoids the need for a full markdown inline parser on leave — the inline marks, links, and other inline nodes pass through untouched.

## Design

### Schema: `heading_source` Node

```ts
heading_source: {
  group: "block",
  content: "inline*",       // same as heading — preserves inline marks
  defining: true,           // Enter key creates new block, doesn't split this type
  attrs: {
    level: { default: 1 },  // heading level (updated live as prefix is edited)
    id: { default: "" },    // preserved heading id
  },
  toDOM: (node) => [
    `h${node.attrs.level}`,
    { class: "heading-source", id: node.attrs.id },
    0
  ],
  parseDOM: [],              // transient — never parsed from HTML/markdown
}
```

Key properties:

- `content: "inline*"` matches the standard heading node, allowing all inline content (text, marks, links, images, inline code).
- The `marks` field is intentionally **omitted** — ProseMirror defaults to allowing all marks when `marks` is not specified. This is the same behavior as the standard `heading` node. (Contrast with `inline_source` which sets `marks: ""` to disallow marks, since it flattens content to raw text.)
- `toDOM` renders as the same `<hN>` tag as a regular heading. This eliminates any visual flash or reflow on transition — the only visible change is the `## ` prefix text appearing. The `heading-source` CSS class provides a hook for decoration styling.
- The node is transient — it only exists while the cursor is inside it and is never serialized to markdown.
- Registered as a Milkdown plugin via `$node()` before `crepe.create()`, since ProseMirror schemas are immutable after initialization.

### State Machine: `appendTransaction`

The core logic lives in `appendTransaction`, consistent with the `inline_source` plugin. ProseMirror's `appendTransaction` runs in the transaction pipeline before the view updates, with a built-in 500-iteration loop guard.

**Enter (Heading → Heading Source):**

1. On selection or doc change, check if cursor's parent block is a `heading` node
2. If yes and no `heading_source` node exists in the document:
   - Build prefix string: `"#".repeat(level) + " "` (e.g., `"## "` for h2)
   - Create a `heading_source` node with:
     - `attrs.level` = heading's level
     - `attrs.id` = heading's id
     - Content = `[text(prefix), ...heading.content]` — prefix prepended, inline content preserved
   - Replace the `heading` node with `heading_source`
   - Manually compute and set cursor position (shift right by prefix length: `level + 1` characters)
   - Transaction uses `addToHistory: false`

**Leave (Heading Source → Heading or Paragraph):**

1. On selection or doc change, check if cursor has moved outside any existing `heading_source` node
2. If yes:
   - Read text content from the start of the node
   - Parse prefix: count leading `#` characters (1-6), note trailing space
   - Strip the prefix from the node's content (character-offset slicing of the Fragment)
   - Determine result:
     - Valid prefix (`#{1,6}` + optional space) → create `heading` node with parsed level and remaining content
     - No `#` at start → convert to `paragraph` with remaining content (strip leading space if present)
     - Empty content with no prefix → create empty `paragraph`
     - Empty content with valid prefix → create empty `heading` at parsed level
   - Replace `heading_source` with the result
   - Transaction uses `addToHistory: false`

**Live Update (prefix edited while cursor is inside):**

For real-time visual feedback matching Typora's behavior, when the user edits the prefix:

1. Doc changes while cursor is in `heading_source`
2. Re-parse the prefix to determine current level
3. If level differs from `attrs.level`, dispatch `setNodeMarkup` to update `attrs.level`
4. This causes `toDOM` to re-render with the correct `<hN>` tag (e.g., `<h2>` → `<h3>`), giving immediate visual feedback of the font-size change
5. Level is clamped to 1-6; `#` characters beyond 6 do not change the tag
6. Transaction uses `addToHistory: false`

**Invariant:** At most one `heading_source` node exists in the document at any time. Entering a new heading triggers leave on the previous one first.

### Cursor Detection

Detection is simpler than inline marks — check the cursor's parent block directly:

```ts
const $cursor = sel.$cursor;
if (!$cursor) return null;

const parent = $cursor.parent;

// Already in source mode — no transition needed
if (parent.type === headingSourceType) return null;

// Cursor entered a heading — trigger enter transition
if (parent.type === headingType) { /* ... */ }
```

For leave, scan the document for any `heading_source` node where cursor is not inside (same pattern as `inline_source`):

```ts
let headingSourcePos: number | null = null;
let headingSourceNode: Node | null = null;
newState.doc.descendants((node, pos) => {
  if (node.type === headingSourceType) {
    headingSourcePos = pos;
    headingSourceNode = node;
    return false; // stop traversal — at most one exists
  }
  return true;
});
```

A shared utility `findInnermostBlock(state, nodeTypes)` in `ui/plugins/block-source/cursor.ts` encapsulates cursor-in-block detection for reuse across heading, list, and code block features:

```ts
function findInnermostBlock(
  state: EditorState,
  nodeTypes: NodeType[]
): { node: Node; pos: number; depth: number } | null {
  const sel = state.selection as TextSelection;
  const $cursor = sel.$cursor;
  if (!$cursor) return null;

  // Walk from innermost to outermost — first match wins
  for (let d = $cursor.depth; d > 0; d--) {
    const node = $cursor.node(d);
    if (nodeTypes.includes(node.type)) {
      return { node, pos: $cursor.before(d), depth: d };
    }
  }
  return null;
}
```

The `depth` field supports features (like lists) that need to know how deep in the nesting the match occurred. For headings, only the return value being non-null matters.

### NodeSelection Handling

The state machine relies on `sel.$cursor`, which returns `null` for non-cursor selections (`NodeSelection`, `AllSelection`, or range `TextSelection`). These cases need explicit handling:

**Triple-click (block-level selection):** Triple-clicking a heading creates a `TextSelection` spanning the entire heading content (not a `NodeSelection`). Since `$cursor` is null for range selections, the enter transition does not fire — the heading stays rendered without prefix. This is correct: revealing `## ` during a block-level selection would disrupt the selection range (content length changes).

**NodeSelection on heading_source:** If a `NodeSelection` is created on a `heading_source` node (e.g., via `Ctrl-A` within a block or programmatic selection), `$cursor` is null, so the leave transition does not fire immediately. The `heading_source` persists until the user creates a cursor selection elsewhere. This is acceptable — the node remains visually correct and serialization safety ensures markdown output is correct if a save occurs in this state.

**GapCursor:** Milkdown/Crepe enables gap cursors for navigating between block nodes. A gap cursor adjacent to a heading has `$cursor` available but its parent is the doc root, not the heading. The enter transition checks `parent.type === headingType`, which fails for gap cursors — correctly avoiding a transition.

**Guard in appendTransaction:**

```ts
const sel = newState.selection;
// Only handle collapsed cursor selections
if (!(sel instanceof TextSelection) || !sel.$cursor) return null;
```

This guard ensures all non-cursor selections are ignored, consistent with the `inline_source` plugin's behavior.

### Cursor Position Mapping

**Enter:** Cursor offset shifts right by the prefix length. If cursor was at offset `n` within the heading content, the new position is `contentStart + prefixLength + n`, where `contentStart` is `nodePos + 1` (after the block node's open token).

**Leave:** Cursor is outside the `heading_source`, so no position adjustment is needed for the cursor itself. The replacement node's content is shorter by the prefix length, but since the cursor is elsewhere, `tr.mapping` handles any affected positions automatically.

Selection is set explicitly via `tr.setSelection(TextSelection.create(tr.doc, computedPos))` on enter.

### Prefix Parsing

```ts
function parseHeadingPrefix(text: string): { level: number; contentStart: number } | null {
  const match = text.match(/^(#{1,6})(\s)?/);
  if (!match) return null;
  return {
    level: match[1].length,
    contentStart: match[0].length, // includes optional trailing space
  };
}
```

### Content Stripping (Prefix Removal on Leave)

The prefix occupies the first N characters of the `heading_source`'s content. Stripping must handle the case where the first text node has marks (e.g., user applied bold across the prefix boundary):

```ts
function stripPrefix(content: Fragment, prefixLen: number, schema: Schema): Fragment {
  if (prefixLen === 0) return content;
  let remaining = prefixLen;
  const children: Node[] = [];

  content.forEach((child) => {
    if (remaining <= 0) { children.push(child); return; }
    if (child.isText && child.text) {
      if (remaining >= child.text.length) {
        remaining -= child.text.length; // skip entire text node
      } else {
        // Partial: keep remainder with original marks preserved
        children.push(schema.text(child.text.slice(remaining), child.marks));
        remaining = 0;
      }
    } else {
      // Non-text inline node (image, etc.) in prefix area — skip if within range
      if (remaining >= child.nodeSize) {
        remaining -= child.nodeSize;
      } else {
        children.push(child);
        remaining = 0;
      }
    }
  });

  return Fragment.from(children);
}
```

In practice the prefix is always a plain, unmarked text node (injected on enter), so the first branch handles the common case. The mark-aware slicing is a defensive measure for edge cases.

### Decorations

Inline decorations apply the `.syntax-marker` CSS class (muted opacity) to the prefix characters inside `heading_source`:

```ts
function buildHeadingPrefixDecorations(state: EditorState): DecorationSet {
  const headingSourceType = state.schema.nodes.heading_source;
  if (!headingSourceType) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type === headingSourceType) {
      const text = node.textContent;
      const match = text.match(/^(#{1,6}\s?)/);
      if (match) {
        const prefixLen = match[1].length;
        const contentStart = pos + 1; // after block node open token
        decorations.push(
          Decoration.inline(contentStart, contentStart + prefixLen, {
            class: "syntax-marker",
          })
        );
      }
      return false; // don't descend into heading_source
    }
    return true;
  });

  return DecorationSet.create(state.doc, decorations);
}
```

Decorations are rebuilt on every doc change via the plugin's `state.apply` method (same pattern as `inline_source`), so they track prefix edits in real time.

### Serialization Safety

A remark node serializer is registered alongside the `heading_source` node spec. If `getMarkdown()` is called while a `heading_source` node is active, the serializer strips the prefix and produces correct heading markdown:

```ts
toMarkdown: {
  match: (node) => node.type.name === "heading_source",
  runner: (state, node) => {
    const text = node.textContent;
    const parsed = parseHeadingPrefix(text);
    const level = parsed?.level ?? node.attrs.level;
    state.openNode("heading", undefined, { depth: level });
    // Serialize inline children, skipping prefix characters
    state.closeNode();
  },
}
```

This ensures saves never produce double-prefixed output (`## ## Heading`) or lose heading level information.

### IME / Composition Guard

All enter/leave/live-update transitions are skipped during IME composition to avoid breaking CJK input. Composing state is tracked via `compositionstart`/`compositionend` events in the plugin's `props.handleDOMEvents` and read by `appendTransaction`. This is the same pattern as `inline_source`.

### Undo/Redo

- Enter/leave/live-update transitions use `addToHistory: false` — they are presentation changes, not user edits.
- Text edits within the `heading_source` node (typing/deleting `#` characters, editing heading text) go into history normally.
- If undo restores content to a state with no valid prefix, the leave transition handles it gracefully (converts to paragraph).

### Interaction with Existing Heading Keymap

Milkdown's heading preset registers:

- `Mod-Alt-{1-6}` → set heading level via `wrapInHeadingCommand`
- `Backspace`/`Delete` at position 0 → downgrade heading via `downgradeHeadingCommand`

When `heading_source` is active, these keymaps target the `heading_source` node, not a `heading` node. The `downgradeHeadingCommand` checks `node.type !== headingSchema.type(ctx)`, so it becomes a no-op on `heading_source`. This is acceptable — the user edits level by modifying `#` characters directly, which is the point of syntax toggling.

For `Mod-Alt-{1-6}`, the heading-source plugin could optionally intercept these shortcuts to update the prefix text (insert/remove `#` characters to match the requested level). This is a nice-to-have enhancement for a future iteration.

## Composition with `inline_source`

### Two Transient Nodes Active Simultaneously

When the cursor is on bold text inside a heading in source mode, both `heading_source` and `inline_source` are active:

```
heading_source [level=2]
  text("## ")
  inline_source [syntax="strong"]
    text("**bold**")
  text(" text")
```

This is correct, not a violation. The invariants are independent:

- "At most one `inline_source`" — satisfied (one exists)
- "At most one `heading_source`" — satisfied (one exists)

The user sees both the `## ` prefix and the `**` markers — which matches Typora's behavior.

### Why It Works Mechanically

**Schema compatibility:** `heading_source` has `content: "inline*"` and `inline_source` has `group: "inline"`. ProseMirror's schema validation permits `inline_source` inside `heading_source`.

**Guard checks don't conflict:** When cursor is inside `inline_source` (within `heading_source`), `$cursor.parent` is `inline_source`. The heading-source plugin checks `parent.type === headingSourceType` — false — so it does nothing. The inline-source plugin checks `parent.type === inlineSourceType` — true — so it also does nothing. No spurious transitions.

**Multi-step leave works regardless of plugin order:** If the cursor jumps completely out of both nodes:

- If inline-source runs first: converts `inline_source` back to marked text inside `heading_source`. Next pass: heading-source converts back to `heading`.
- If heading-source runs first: converts `heading_source` back to `heading`, keeping `inline_source` in the content (valid — it's `group: "inline"`). Next pass: inline-source converts back to marked text inside the heading.

Either way, ProseMirror's `appendTransaction` loop (up to 500 iterations) resolves both transitions cleanly.

### Forward-Compatibility with #31 (Overlapping Marks)

Issue #31 changes the internals of `inline_source` — expanded mark span detection, a proper inline parser, and overlapping mark boundary handling. These changes are fully encapsulated within the inline-source plugin.

From `heading_source`'s perspective, `inline_source` is just another inline node in its `content: "inline*"`. The heading container doesn't care how inline marks work internally. No changes to the heading-source design are needed for #31 compatibility.

The one edge case — marks crossing the prefix boundary (user selects `## bold` and applies bold) — is handled defensively by `stripPrefix`, which slices by character offset regardless of marks on the text nodes. The prefix is also injected as a separate unmarked text node on enter, so mark boundaries don't naturally cross into it.

## Edge Cases

| Edge case | Behavior |
|---|---|
| **Empty heading** | Shows `## ` (prefix only). Cursor placed after prefix. On leave: empty heading at original level. |
| **Heading at doc start/end** | No special handling — ProseMirror manages block boundaries. |
| **Delete all `#` characters** | Content becomes `" text"` or `"text"`. On leave: converts to `paragraph` (strip leading space if present). |
| **More than 6 `#` characters** | Level clamped to 6. Extra `#` characters remain as part of heading text content. |
| **Paste into prefix area** | Treated as regular text editing. Prefix re-parsed on leave. |
| **Marks crossing prefix boundary** | See detailed analysis below. |
| **Enter key inside heading_source** | Intercept via `handleKeyDown`: force leave transition (convert back to heading), then let ProseMirror create a new paragraph after it. Do not let ProseMirror split the `heading_source`. |
| **Backspace at absolute start** | Standard ProseMirror block-join behavior. The `heading_source` content starts with `#`, so Backspace at the very start of the block attempts to join with the previous block — standard behavior. |
| **inline_source active inside heading_source** | Both transient nodes coexist. Leave ordering handled by `appendTransaction` loop. See Composition section above. |
| **IME composition** | All transitions skipped during composition. Same guard as `inline_source`. |
| **Undo restores invalid prefix** | Handled gracefully on leave — no `#` prefix converts to paragraph. |
| **Save while cursor is in heading** | Serialization safety handler strips prefix and produces correct markdown. |

### Marks Crossing the Prefix Boundary

If the user selects text spanning the `## ` prefix and the heading content (e.g., selects `## bold`) and applies bold (Cmd+B), the `#` characters receive the bold mark. This creates a document state like:

```
heading_source [level=2]
  strong("## bold")
  text(" text")
```

**Visual behavior during editing:** The `#` characters render bold. The `.syntax-marker` decoration (opacity 0.4) still applies to the prefix range because it's computed by character offset on `textContent`, not by mark boundaries. So the `#` characters appear bold but muted — slightly unusual but not broken. The bold styling is subtle at the reduced opacity.

**On leave:** `stripPrefix` handles this correctly. It slices the first `prefixLen` characters from the Fragment regardless of marks. The bold mark on `"## bold"` is preserved on the remaining `"bold"` text after stripping. The resulting heading contains `strong("bold") + text(" text")` — correct.

**Prevention (optional):** The plugin could intercept mark-application shortcuts (Cmd+B/I) via `handleKeyDown` when the selection overlaps the prefix range. If the selection start is within the prefix (offset < prefixLen), either:
- Prevent the mark command entirely, or
- Clamp the selection to start after the prefix before applying

This is a polish concern, not a correctness issue. For v1, the defensive `stripPrefix` handling is sufficient. Prevention can be added in a follow-up if the visual artifact bothers users.

## Read-Only Mode

When the editor is in read-only mode (`editable: false`), `heading_source` transitions must be suppressed. The `appendTransaction` handler checks `newState.doc` editability or plugin meta to skip all transitions:

```ts
if (!view.editable) return null;
```

Since `appendTransaction` does not receive the view directly, the composing/editable state is tracked via the plugin's `props.handleDOMEvents` or a shared plugin state field, similar to the IME composition guard. Alternatively, the `heading_source` plugins are simply not registered when `syntaxToggling` is false (which already gates read-only scenarios where syntax toggling is unwanted).

The `syntaxToggling` prop on `MarkdownEditor` already conditionally registers both `inline_source` and `heading_source` plugins. In a future read-only viewer mode, the prop would be set to `false`, preventing plugin registration entirely.

## Styling

```css
.milkdown .editor .heading-source .syntax-marker {
  opacity: 0.4;
}
```

No additional heading-size CSS is needed. Because `heading_source` renders as the same `<hN>` tag via `toDOM`, the existing heading styles from `skriv.css` (`h1`, `h2`, `h3` font-size, font-weight, margin, border-bottom) apply automatically.

## Files

- `ui/plugins/heading-source/syntax.ts` — pure functions: `parseHeadingPrefix`, `buildHeadingPrefix`, `stripPrefix`, constants
- `ui/plugins/heading-source/node.ts` — `heading_source` node schema via `$node()` with remark serializer
- `ui/plugins/heading-source/plugin.ts` — ProseMirror plugin: `handleHeadingSourceTransition` (appendTransaction), `buildHeadingPrefixDecorations`, Enter key intercept, IME guard
- `ui/plugins/heading-source/index.ts` — barrel exports
- `ui/plugins/block-source/cursor.ts` — shared `findInnermostBlock()` utility for block-level cursor detection
- `ui/components/Editor.tsx` — register plugins with `crepe.editor.use()`, gated by `syntaxToggling` prop
- `ui/theme/skriv.css` — `.heading-source .syntax-marker` styles (reuses existing `.syntax-marker` class)
