# Cursor-Aware List Marker Syntax Toggling

**Issue:** [#29](https://github.com/bhendo/skriv/issues/29)
**Date:** 2026-03-19

## Summary

When the cursor enters a list item, reveal the raw markdown marker (`-`, `*`, `+`, `1.`, `2.`, etc.) in the label area and make it editable. When the cursor leaves, hide the marker and return to the rendered icon/number. Editing the marker can change the list type (bullet to ordered, or vice versa), unwrap the list item into a paragraph, or toggle task list checkboxes.

## Scope

### v1

- **Bullet list markers** (`-`, `*`, `+`) — reveal when cursor enters list item
- **Ordered list markers** (`1.`, `2.`, etc.) — reveal when cursor enters list item
- **List type conversion** — editing `-` to `1.` converts `bullet_list` to `ordered_list` (and vice versa)
- **Unwrap** — deleting the marker entirely lifts the list item to a plain paragraph
- Muted syntax marker styling on the editable input, consistent with `.syntax-marker`
- Show marker only for the cursor's list item (not all items in the list)
- Respects the existing `syntaxToggling` prop and Cmd+Shift+E toggle

### Future / Scope TBD

- Task list markers — `[ ]` / `[x]` reveal/edit (depends on GFM task list enablement)
- Click-on-label to enter marker editing mode (v1 requires cursor to be in content area)

## Approach: Custom NodeView with Editable Marker Input

Override Milkdown's `listItemBlockView` with a custom NodeView that conditionally renders an editable text input in the label area when the cursor is inside the list item. When the cursor leaves, the input is replaced with the static rendered icon/number.

### Why This Approach

This is fundamentally different from the `inline_source` node pattern used for inline marks. List markers are **not inline text content** — they are structural metadata rendered in a separate DOM region outside `contentDOM`. The approaches considered:

- **Transient node replacement** (like `inline_source`) — the marker is not part of the paragraph text content. Injecting `- ` into the paragraph would break the ProseMirror content model (`list_item` content is `paragraph block*`, not `text paragraph block*`). Multi-paragraph list items and nested lists make this even more problematic.
- **Widget decorations** — read-only; can't edit the marker to change list type. The inline source design doc already rejected this for the same reason.
- **Plugin view + direct DOM manipulation** — fragile; ProseMirror can re-render DOM at any time.

The custom NodeView approach works with Milkdown's existing architecture. The `listItemBlockView` already manages the label as a separate `<div class="label-wrapper">` element with `contenteditable={false}` outside the `contentDOM`. We extend this pattern by swapping the static label for an editable input when active — no document mutation required for enter/leave transitions.

## Design

### Schema

**No schema changes.** The existing `list_item` node already has the necessary attributes:

```ts
list_item: {
  content: 'paragraph block*',
  group: 'listItem',
  defining: true,
  attrs: {
    label: { default: '•' },       // display text: '•', '1.', '2.', etc.
    listType: { default: 'bullet' }, // 'bullet' or 'ordered'
    spread: { default: true },
  },
}
```

The parent wrapper nodes (`bullet_list`, `ordered_list`) are also unchanged. List type conversion changes the wrapper node type via `setNodeMarkup`.

### NodeView: `listItemBlockView` Override

The custom NodeView replaces Milkdown's default `listItemBlockView`. It renders the same DOM structure — `<div class="milkdown-list-item-block">` containing a label area and a `contentDOM` — but adds cursor-aware marker toggling.

**DOM structure (rendered state):**
```html
<div class="milkdown-list-item-block">
  <li class="list-item">
    <div class="label-wrapper" contenteditable="false">
      <!-- static icon (bullet) or number (ordered) -->
    </div>
    <div class="children" data-content-dom="true">
      <!-- ProseMirror contentDOM: paragraph content lives here -->
    </div>
  </li>
</div>
```

**DOM structure (editing state):**
```html
<div class="milkdown-list-item-block">
  <li class="list-item">
    <div class="label-wrapper">
      <input class="marker-input syntax-marker" value="-" />
    </div>
    <div class="children" data-content-dom="true">
      <!-- ProseMirror contentDOM: unchanged -->
    </div>
  </li>
</div>
```

The NodeView implements ProseMirror's `NodeView` interface:

- `dom` — outer wrapper `<div>`
- `contentDOM` — inner content area where ProseMirror manages paragraph content
- `update(node)` — called on every state change; checks cursor position to toggle between rendered/editing states
- `ignoreMutation(mutation)` — returns `true` for mutations in the label area (outside contentDOM) so ProseMirror ignores our marker input changes
- `destroy()` — cleanup event listeners

### State Machine

The state machine is simpler than `inline_source` because enter/leave transitions are purely DOM changes in the NodeView, not document mutations.

**States per list_item NodeView:**
- **Rendered** (default): Label area shows the static icon/number
- **Editing**: Label area shows an editable `<input>` with the raw marker text

**Enter (Rendered → Editing):**

1. On selection change, the NodeView's `update()` fires
2. Check if the cursor is inside this list item (see Cursor Detection below)
3. If yes and currently in rendered state:
   - Replace the static label DOM with an `<input>` element
   - Pre-fill with the raw markdown marker (`-` for bullet, `1.` for first ordered item, etc.)
   - Input is visible but NOT focused — the cursor stays in the paragraph content
   - Attach event listeners for key handling and commit

**Leave (Editing → Rendered):**

1. On selection change, the NodeView's `update()` fires
2. Check if the cursor has left this list item
3. If yes and currently in editing state:
   - Read the input value
   - If the value changed, commit the edit (see Marker Commit below)
   - Replace the input with the static rendered label
   - No document transaction for the DOM swap itself

**Key difference from `inline_source`:** Enter/leave transitions involve zero ProseMirror transactions. The document is unchanged — only the NodeView's DOM updates. Document changes happen only when the user actually edits the marker and the edit is committed.

### Cursor Detection

Detection answers: "Is the cursor inside this specific list_item?"

```ts
function isCursorInListItem(
  state: EditorState,
  listItemPos: number,
  listItemNode: Node
): boolean {
  const sel = state.selection;
  if (!sel.$cursor) return false;

  const cursorPos = sel.$cursor.pos;
  return cursorPos > listItemPos && cursorPos < listItemPos + listItemNode.nodeSize;
}
```

**Nested list handling:** A cursor inside a nested list item is positionally inside both the inner and outer items. Only the **innermost** list_item should show the editable marker. The NodeView detects this by walking the cursor's depth stack:

```ts
const $cursor = state.selection.$cursor;
for (let d = $cursor.depth; d > 0; d--) {
  if ($cursor.node(d).type.name === 'list_item') {
    // Innermost list_item — compare its position with this NodeView's getPos()
    const innermostPos = $cursor.before(d);
    return innermostPos === getPos();
  }
}
```

If this NodeView's position doesn't match the innermost list_item, it stays in rendered state even though the cursor is technically inside it.

**Multi-paragraph list items:** If a `list_item` contains `paragraph + blockquote + paragraph` and the cursor is in the second paragraph, it is still "in" that list_item. The depth walk finds the list_item regardless of which child block contains the cursor.

**Shared utility:** The cursor-in-block detection is extracted into `ui/plugins/block-source/cursor.ts` for reuse by heading (#28) and code block (#30) syntax toggling:

```ts
export function findInnermostBlock(
  state: EditorState,
  nodeTypeName: string
): { pos: number; node: Node; depth: number } | null {
  const sel = state.selection;
  const $pos = sel.$cursor ?? sel.$from;

  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === nodeTypeName) {
      return { pos: $pos.before(d), node: $pos.node(d), depth: d };
    }
  }
  return null;
}

export function isInsideBlockType(
  state: EditorState,
  nodeTypeName: string,
  targetPos: number
): boolean {
  const found = findInnermostBlock(state, nodeTypeName);
  return found !== null && found.pos === targetPos;
}
```

Each feature (heading, list, code block) calls these independently. Multiple block types can be active simultaneously — e.g., a list item containing bold text can have both the list marker revealed and an `inline_source` node active at the same time, because they operate in different DOM regions.

### Marker Commit: Atomic Edit Model

Marker edits are committed atomically — the `<input>` is a native HTML input outside ProseMirror's control, and edits only become ProseMirror transactions at commit time.

**Commit flow:**

1. User edits the marker text in the `<input>` (native browser editing)
2. User presses Enter, or cursor leaves the list item → **commit point**
3. Read input value, parse it (see Marker Parsing below)
4. If the parsed intent differs from the current state, dispatch a ProseMirror transaction
5. Return focus to ProseMirror view, restore cursor position

**Commit triggers:**
- **Enter** — commit and return focus to content
- **Escape** — revert to previous marker value, return focus to content
- **Blur** (cursor leaves list item) — commit if changed, revert if invalid
- **Tab** — commit, return focus, then dispatch sink/lift command

### Key Event Isolation

When the `<input>` has focus, ProseMirror's view does not have focus. This means ProseMirror's keymaps do not fire — Backspace won't trigger block-join, Enter won't split the list item, Tab won't sink/lift. The input is a clean, isolated editing context.

Custom key handling on the input:

```ts
input.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      commitMarkerEdit();
      returnFocusToContent();
      break;
    case 'Escape':
      e.preventDefault();
      revertMarkerEdit();
      returnFocusToContent();
      break;
    case 'Tab':
      e.preventDefault();
      commitMarkerEdit();
      returnFocusToContent();
      // Programmatically dispatch sink (Tab) or lift (Shift+Tab) command
      if (e.shiftKey) dispatchLiftCommand();
      else dispatchSinkCommand();
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      e.preventDefault();
      commitMarkerEdit();
      returnFocusToContent();
      // Let ProseMirror handle vertical navigation
      break;
  }
});
```

### Undo/Redo

- **Enter/leave transitions** use no ProseMirror transactions (pure DOM changes), so undo history is unaffected.
- **Marker edits** commit as standard ProseMirror transactions with `addToHistory: true` (default). The user can undo a list type conversion with Cmd+Z.
- **Cmd+Z while the input is focused** triggers native browser input undo (undo typing within the input). This is correct — the edit hasn't been committed to ProseMirror yet.
- **Cmd+Z after committing** undoes the ProseMirror transaction (e.g., reverts `ordered_list` back to `bullet_list`). The NodeView's `update()` fires, sees the node changed, and updates the label accordingly.

### Marker Parsing

The input value is parsed to determine the user's intent:

| Input | Interpretation | Action |
|---|---|---|
| `-` | Bullet list (dash) | If already bullet → no-op. If ordered → convert to `bullet_list` |
| `*` | Bullet list (asterisk) | Same as `-` |
| `+` | Bullet list (plus) | Same as `-` |
| `1.`, `2.`, `N.` | Ordered list | If already ordered → no-op. If bullet → convert to `ordered_list` |
| Empty (delete all) | Unwrap from list | Lift list item to plain paragraph |
| Invalid text | Reject | Revert to previous marker |

**Future (task lists):** `[ ]` → set `checked: false`, `[x]` → set `checked: true`. Deferred until GFM task list support is confirmed enabled.

```ts
interface ParsedMarker {
  type: 'bullet' | 'ordered' | 'unwrap' | 'invalid';
  startNumber?: number; // for ordered lists
}

function parseMarker(value: string): ParsedMarker {
  const trimmed = value.trim();
  if (!trimmed) return { type: 'unwrap' };
  if (/^[-*+]$/.test(trimmed)) return { type: 'bullet' };
  const orderedMatch = trimmed.match(/^(\d+)\.$/);
  if (orderedMatch) return { type: 'ordered', startNumber: Number(orderedMatch[1]) };
  return { type: 'invalid' };
}
```

### List Type Conversion

Converting between list types requires changing the parent wrapper node type. The existing `syncListOrderPlugin` handles updating all child `list_item` labels and `listType` attributes after the wrapper changes.

```ts
function convertListType(
  view: EditorView,
  listItemPos: number,
  targetWrapper: 'bullet_list' | 'ordered_list'
): void {
  const state = view.state;
  const $pos = state.doc.resolve(listItemPos);

  // Find parent list wrapper (one level up from list_item)
  const listDepth = $pos.depth - 1; // list_item is at $pos.depth, wrapper is one above
  const listNode = $pos.node(listDepth);
  const listPos = $pos.before(listDepth);

  if (listNode.type.name === targetWrapper) return; // already correct type

  const targetType = state.schema.nodes[targetWrapper];
  if (!targetType) return;

  const tr = state.tr;
  const attrs = {
    ...listNode.attrs,
    ...(targetWrapper === 'ordered_list' ? { order: 1 } : {}),
  };
  tr.setNodeMarkup(listPos, targetType, attrs);

  // syncListOrderPlugin's appendTransaction will update all child
  // list_item labels and listType attributes automatically
  view.dispatch(tr);
}
```

**Entire-list conversion:** When the user changes `-` to `1.` on one item in a multi-item bullet list, the **entire list converts** to ordered. This is:

1. **Structurally required** — ProseMirror's schema enforces `bullet_list > listItem+` and `ordered_list > listItem+`. A single list cannot contain mixed types.
2. **Expected UX** — Typora converts the entire list. The synchronized marker update (all items change from `•` to `1.`, `2.`, `3.`...) provides clear visual feedback.

**Nested list scoping:** Conversion only affects the immediate parent list wrapper. A nested bullet list inside an outer ordered list converts independently — the outer list is untouched.

**Unwrap:** Deleting the marker entirely triggers `liftListItem`, which lifts the list item out of its parent list and converts it to a plain paragraph. This aligns with existing Backspace-at-start-of-list-item behavior.

### Focus Management

When the marker input steals focus from ProseMirror, the cursor position must be saved and restored:

1. **Before input activation:** Record the cursor position relative to the list item's content start
2. **After commit:** Call `view.focus()`, then set selection to the saved position via `tr.setSelection(TextSelection.create(...))`

The content positions inside the list item are unchanged by type conversion — only the wrapper and attributes change. This makes position restoration straightforward.

### Composition with Inline Source

The list marker NodeView and `inline_source` operate at completely different levels of the document tree and compose naturally:

```
bullet_list (depth 0)
  list_item (depth 1)     ← NodeView manages label here
    paragraph (depth 2)
      text "some "        ← inline_source operates here
      text "bold" [strong]
      text " text"
```

- The marker label is in `<div class="label-wrapper">` (outside `contentDOM`)
- The `inline_source` node is inside the paragraph within `contentDOM`
- Cursor detection for each works at different depths: inline source inspects `$cursor.nodeBefore`/`nodeAfter` marks; list marker checks `$cursor.node(d).type.name === 'list_item'`
- Both can be active simultaneously without interference

**Focus interaction when both are active:** When the cursor is on bold text inside a list item, both the `inline_source` node (showing `**bold**`) and the list marker input (showing `-`) are visible. If the user clicks the marker `<input>`:

1. Browser moves focus from ProseMirror's contentDOM to the input.
2. ProseMirror's view loses DOM focus, but `state.selection` is unchanged — ProseMirror's selection is a document-level concept, not a DOM focus concept. No transaction is dispatched on blur.
3. The `inline_source` node persists because the cursor hasn't left it in ProseMirror's model. The user sees both raw `**bold**` in the content area and the editable `-` in the label area simultaneously. This is correct — they are in separate DOM regions.
4. User edits the marker and presses Enter → `commitMarkerEdit()` dispatches `setNodeMarkup` (list type conversion), then calls `view.focus()` and restores selection to the saved position (inside the inline_source node).
5. `inline_source`'s `appendTransaction` finds the cursor still inside the node → no leave transition. The inline_source stays.

**Critical rule:** The marker input's blur handler must NOT attempt to clean up `inline_source` state. It handles only its own concern (marker commit). `inline_source` manages its own leave transitions independently via `appendTransaction` based on cursor position.

**Click-elsewhere scenario:** If the user clicks the marker input, then clicks somewhere else in the document (not back into the inline_source):
1. Input blur fires → marker commit
2. ProseMirror gets the new click → new selection outside the inline_source
3. `inline_source`'s `appendTransaction` detects cursor left → triggers leave transition

Both systems resolve correctly without coordination.

### Forward-Compatibility with #31 (Overlapping Marks)

Issue #31 will extend `inline_source` to handle overlapping marks with different boundaries (e.g., `**bold *and italic* only**`). This does not affect the list marker design because:

- Mark expansion is confined to paragraph content — it never escapes up to the list_item level. Inline marks cannot cross block boundaries in ProseMirror.
- The list NodeView tracks list_item position via `getPos()`, not text offsets within the paragraph. Inline source swapping text content changes positions within the paragraph, but the list_item's position adjusts uniformly.
- Block-level and inline-level tracking remain independent concerns. No centralized coordination is needed.

### IME / Composition Guard

The `<input>` element handles IME composition natively. Since the input is outside ProseMirror's control, no special guard is needed — the browser manages composition state for the input, and ProseMirror manages composition state for the content area independently.

Commit is suppressed during composition by checking `input.composing` (via `compositionstart`/`compositionend` events on the input) before processing Enter/blur.

### Toggling

The feature respects the existing toggle mechanisms:

- **`syntaxToggling` prop** on `MarkdownEditor` — when `false`, the default `listItemBlockView` is used instead of the custom NodeView.
- **Cmd+Shift+E** keyboard shortcut — runtime toggle recreates the editor with/without the custom NodeView.

### Read-Only Mode

When the editor is in read-only mode (`editable: false`), the marker input must not appear. The NodeView checks `view.editable` in its `update()` method and skips the rendered-to-editing transition when false. The label area always shows the static rendered icon/number, matching the default `listItemBlockView` behavior. This also applies when the `syntaxToggling` prop is `false`.

### Accessibility

The marker input is outside ProseMirror's content model, so care is needed to avoid confusing assistive technology.

**Rendered state (static label):**
```html
<div class="label-wrapper" contenteditable="false" aria-hidden="true">
  <span class="label">•</span>
</div>
```

The static label is decorative — screen readers already announce "list item" from the `<li>` element semantics. `aria-hidden="true"` prevents redundant announcements.

**Editing state (input visible):**
```html
<div class="label-wrapper" contenteditable="false">
  <input
    class="marker-input"
    value="-"
    aria-label="List marker"
    aria-description="Edit to change list type. Dash or asterisk for bullet, number and period for ordered, empty to remove list."
    tabindex="-1"
  />
</div>
```

- **`aria-label`** gives screen readers context when the input receives focus.
- **`aria-description`** explains accepted values without cluttering the primary label.
- **`tabindex="-1"`** keeps the input out of the normal tab flow — users navigate document content via ProseMirror's keyboard navigation. The input is reachable by clicking but doesn't interrupt tabbing through the document.
- **No `aria-live` region.** The input appearing/disappearing on cursor movement should not be announced proactively — it would be noisy during normal list navigation.

Screen reader users can change list types via existing keyboard shortcuts (Cmd+Alt+7 for ordered, Cmd+Alt+8 for bullet). The marker input is an enhancement for visual users, not the primary list-type-switching affordance for assistive technology.

## Styling

```css
.milkdown .editor .milkdown-list-item-block .marker-input {
  font-family: var(--crepe-font-code, monospace);
  font-size: inherit;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.4;
  width: 24px;
  text-align: right;
  padding: 0;
  outline: none;
}

.milkdown .editor .milkdown-list-item-block .marker-input:focus {
  opacity: 0.7;
}
```

The muted opacity is consistent with the `.syntax-marker` styling used by inline source decorations. When the input receives focus (user clicks it to edit), opacity increases slightly to indicate editability.

## Edge Cases

### Empty List Items

An empty list item (cursor on blank line) should still show the editable marker. The NodeView activates based on cursor-in-list-item, not cursor-in-text.

### Multi-Paragraph List Items

```md
- First paragraph

  Second paragraph  <- cursor here
```

The marker is shown when the cursor is in any child block of the list item, not just the first paragraph. The depth walk finds the list_item regardless of which child contains the cursor.

### Nested Lists

```md
- Item 1
  - Nested item  <- cursor here
- Item 2
```

Only the innermost list_item shows the editable marker. Outer items remain in rendered state. The depth walk comparison (`innermostPos === getPos()`) handles this.

### Mixed Nested List Types

```md
- Bullet item
  1. Ordered nested  <- cursor here
  2. Another ordered
```

Converting the nested item's marker only affects the nested `ordered_list` wrapper. The parent `bullet_list` is untouched.

### Click on Label Area

In v1, clicking the label area does not enter marker editing mode (the input is not focused). The user must have their cursor in the content area for the marker to appear. The input only receives focus if the user explicitly clicks it while it's visible.

Future enhancement: clicking the label when the list item is not active could activate the marker and focus the input in one step.

### Rapid Cursor Movement

If the user arrows quickly through multiple list items, the NodeView `update()` fires for each. The leave transition on the previous item checks if the marker value changed and only commits if needed. No-op transitions (value unchanged) are free — just a DOM swap with no ProseMirror transaction.

## Files

- `ui/plugins/block-source/cursor.ts` — shared utility: `findInnermostBlock()`, `isInsideBlockType()` for cursor-in-block detection, reused by heading and code block syntax toggling
- `ui/plugins/list-source/view.ts` — custom `list_item` NodeView via `$view()`: cursor-aware label rendering, input management, commit/revert logic
- `ui/plugins/list-source/marker.ts` — pure functions: `parseMarker()`, `markerForListItem()` (derives raw marker text from node attrs)
- `ui/plugins/list-source/convert.ts` — list type conversion: `convertListType()`, `unwrapListItem()` (ProseMirror transaction builders)
- `ui/plugins/list-source/index.ts` — barrel exports
- `ui/components/Editor.tsx` — register custom NodeView with `crepe.editor.use()`, conditional on `syntaxToggling`
- `ui/theme/skriv.css` — `.marker-input` styles
