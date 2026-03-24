# Link Syntax Toggling

**Issue:** [#27](https://github.com/bhendo/skriv/issues/27)
**Date:** 2026-03-23

## Summary

When the cursor enters a link, reveal the full `[text](url)` markdown syntax inline and allow editing. When the cursor leaves, parse the raw text back into a link mark. Follows Typora's link UX exactly: click enters edit mode, Cmd+click follows the link, Cmd+K inserts raw syntax inline, and typing `[text](url)` creates a link.

## Scope

### In Scope

- Cursor-enter reveals `[text](url)` for existing links
- Cursor-leave parses raw text back into a link mark
- Cmd+K creates links inline (no dialog)
- Typing `[text](url)` converts to a link mark (input rule)
- Cmd+click follows links (opens in system browser)
- Same-boundary inner marks within link text (e.g., `[**bold**](url)`)
- Coexist with Crepe's LinkTooltip (tooltip for hover preview, source mode for editing)
- Link titles: `[text](url "title")`
- Serialization safety

### Out of Scope (deferred)

- Different-boundary inner marks within link text (e.g., `[normal **bold**](url)`) — blocked by #31
- Autolinks (`<https://example.com>`)
- Reference links (`[text][ref]`)
- Image syntax (`![alt](url)`)

## Approach: Dedicated `link_source` Node

A new `link_source` ProseMirror node, following the same transient node pattern as `inline_source` but with link-specific parsing and behavior. Reuses shared infrastructure (`makeDecorationPlugin`, `findAncestorOfType`, IME guard pattern) but keeps the state machine and parsing separate.

### Why Not Reuse `inline_source`

Link syntax is structurally different from wrapping marks — it has `[text](url)` with an attribute (`href`) rather than symmetric prefix/suffix markers. Mixing the two models in one node would complicate both the parser and the state machine. The project's established pattern gives each syntax type its own plugin directory (inline-source, heading-source, code-block-source, list-source).

## Design

### Schema: `link_source` Node

```ts
link_source: {
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",           // disallow marks inside raw source
  attrs: {
    href: { default: "" },
    title: { default: "" },
  },
  toDOM: () => ["span", { class: "link-source" }, 0],
  parseDOM: [],        // transient — never parsed from HTML/markdown
}
```

Key properties:

- Same transient inline node pattern as `inline_source` — only exists while cursor is inside.
- `marks: ""` prevents formatted content inside the raw text.
- `href` and `title` attrs store the original link data for serialization safety — if `getMarkdown()` is called mid-edit, the serializer can reconstruct a valid link even if the raw text is in a partial state.
- The node content is the full raw syntax string: `[display text](url)`.

### State Machine: `appendTransaction`

Same enter/leave pattern as `inline_source`, with link-specific detection.

**Enter (Rendered → Raw):**

1. On selection-only change (no doc change), check if cursor is adjacent to a `link` mark.
2. Detect the link mark via `$cursor.nodeBefore`/`$cursor.nodeAfter` marks, looking for the `link` mark type specifically.
3. Find the full extent of the link mark span — walk siblings sharing the same `link` mark with the same `href`.
4. **Same-boundary inner mark check:** Only enter if all text nodes in the link span share the same set of non-link marks. If mark sets differ across text nodes, don't enter (deferred to #31).
5. Read the `href` (and `title` if present) from the mark's attrs.
6. Build raw text: `[textContent](href)` (or `[textContent](href "title")` if title exists). If same-boundary inner marks are present, the text portion is first wrapped with mark syntax via `buildRawText`.
7. Replace the mark span with a `link_source` node, storing `href`/`title` in node attrs.
8. Map cursor position: offset in rendered text → offset in raw text (accounting for the `[` prefix, plus inner mark prefix length if applicable).
9. Transaction uses `addToHistory: false`.

**Leave (Raw → Rendered):**

1. On selection change, check if cursor has moved outside any existing `link_source` node.
2. Parse raw text content via `parseLinkSyntax` for `[text](url)` (and optionally `[text](url "title")`).
3. If valid: replace node with text node carrying a `link` mark with `href`/`title` attrs. Inner text is run through `parseInlineSyntax` to recover same-boundary marks.
4. If invalid (incomplete syntax): replace with plain unmarked text.
5. If empty: delete the node.
6. Transaction uses `addToHistory: false`.

**Invariant:** At most one inline source node (`inline_source` OR `link_source`) exists in the document at any time. These are both inline-level nodes and are mutually exclusive. (Note: `heading_source` is a block-level container and can coexist — a `link_source` can be active inside an active `heading_source`, same as `inline_source` can today.)

**Cross-node leave coordination:** Both plugins are responsible for leaving the other:

- **Link-source enter path:** Before creating a `link_source` node, calls `findFirstNodeOfType(doc, "inline_source")` and dispatches `leaveInlineSource` (imported from `inline-source/plugin.ts`, already exported) if found.
- **Inline-source enter path:** Before creating an `inline_source` node, calls `findFirstNodeOfType(doc, "link_source")` and dispatches `leaveLinkSource` (exported from `link-source/plugin.ts`) if found. This check goes after the `docChanged` guard and before mark detection in `handleInlineSourceTransition`.
- **Inline-source enter guard for link marks:** Additionally, the inline-source plugin's enter path must skip enter entirely when the cursor is adjacent to a node carrying a `link` mark — this yields to the link-source plugin regardless of plugin registration order. Added before the `SUPPORTED_MARKS` iteration.

Both leave operations happen within the same `appendTransaction` pass as the enter — leave the other node, then enter the new one, all in a single transaction.

### Cursor Detection

Link marks carry attrs, so span detection uses a dedicated `findLinkSpan` function (separate from the existing `findMarkSpan` used by inline-source). Two adjacent links with different `href` values are different spans.

**`findLinkSpan`:** Similar to `findMarkSpan` but additionally compares the `href` attr when walking siblings. Only includes nodes whose `link` mark has the same `href` as the mark at the cursor position.

**Priority with inline marks:** When the cursor is adjacent to text that carries both a `link` mark and other marks, the `link` mark takes priority for enter detection. This is enforced by the check logic in each plugin's `appendTransaction` — the link-source plugin checks for the `link` mark first, and the inline-source plugin skips enter when the cursor is on a `link` mark. This works regardless of plugin registration order.

### Cursor Position Mapping

**Enter:** `[` prefix is 1 char, plus any inner mark prefix length. Offset in raw = offset in rendered + 1 + innerPrefixLength.

**Leave:** Inverse of enter. Offset in rendered = offset in raw − 1 − innerPrefixLength.

Selection is set explicitly via `tr.setSelection(TextSelection.create(tr.doc, computedPos))`.

### Cmd+K: Inline Link Creation

Follows Typora's model:

**Cmd+K with selected text:**

1. Wrap selection as `[selected text]()`.
2. Replace the selection with a `link_source` node containing that raw string.
3. Place cursor inside the parens, ready for URL input.
4. **Clipboard URL auto-fill:** Read the clipboard via `navigator.clipboard.readText()` (async). If the text passes `URL.canParse()` with `http:` or `https:` protocol, auto-fill: `[selected text](clipboard-url)` with cursor at end of URL. If clipboard read fails (permission denied, empty, not a valid URL), fall back to empty parens.

**Cmd+K with no selection:**

1. Insert a `link_source` node containing `[]()`.
2. Place cursor inside the brackets, ready for text input.

**Cmd+K when cursor is already inside a `link_source`:** No-op.

**Cmd+K when cursor is on an existing rendered link:** Triggers enter (same as cursor-enter).

Intercepted in the plugin's `handleKeyDown`, same pattern as Cmd+B/I shortcuts in `inline_source`.

### Input Rule: Typed Link Syntax

When the user types `[text](url)` as plain text, it converts to a link mark.

**Trigger:** An input rule matching `\[([^\]]+)\]\(([^)]+)\)` at the cursor position. Fires when the closing `)` is typed. The character classes exclude `]` and `)` respectively to prevent greedy over-matching across multiple links (e.g., `[foo](bar) and [baz](qux)` must not match as a single link). Nested brackets in the text portion (e.g., `[text [with] brackets](url)`) are not supported in v1.

**Behavior:**

1. On match, replace the raw text with a text node carrying a `link` mark with `href` set to the captured URL.
2. Inner text is parsed through `parseInlineSyntax` for same-boundary marks (so typing `[**bold**](url)` produces a bold link).
3. This is a real document edit — goes into history (unlike enter/leave transitions).

The input rule must NOT fire inside a `link_source` node. The plugin's `handleTextInput` bypass intercepts all text input inside `link_source` and dispatches it directly, which prevents both Milkdown's built-in input rules AND this spec's own link input rule from triggering on `)` typed while already editing a link.

### Cmd+Click: Follow Link

When `syntaxToggling` is on:

- Regular click on a link → cursor enters, reveals raw syntax.
- Cmd+click on a link → open the URL in the system browser via Tauri's shell API. Returns `true` to prevent cursor placement.

When `syntaxToggling` is off:

- LinkTooltip is active, handles link interaction as it does today.

Implemented in the plugin's `handleClick` prop, checking `event.metaKey` (or `event.ctrlKey` on non-Mac).

### LinkTooltip Coexistence

Crepe's `LinkTooltip` remains enabled regardless of `syntaxToggling`. The two features cannot conflict because they target different states — the tooltip attaches to a rendered `link` mark, which is replaced by a `link_source` node when source mode activates. The tooltip naturally disappears when its target is gone.

- **Hover** → tooltip shows URL + edit/remove buttons
- **Click tooltip edit** → cursor enters link → source mode activates → tooltip disappears
- **Click tooltip remove** → link mark removed, plain text remains (no source mode involved)
- **Click link text directly** → cursor enters → source mode activates → tooltip disappears

No changes to `Editor.tsx` feature configuration needed for LinkTooltip.

### Parsing & Serialization

**`parseLinkSyntax(raw: string)`:**

```ts
parseLinkSyntax("[**bold**](https://example.com)")
// → { text: "**bold**", href: "https://example.com", title: "", innerMarks: ["strong"] }

parseLinkSyntax("[text](url \"My Title\")")
// → { text: "text", href: "url", title: "My Title", innerMarks: [] }

parseLinkSyntax("[incomplete")
// → null (invalid — degrades to plain text)
```

Rules:

- Must have `[`, `]`, `(`, `)` in the correct structure.
- Text between `[` and `]` must be non-empty.
- URL between `(` and `)` must be non-empty.
- Both parts non-empty = valid link. Either part empty = plain text (including `[text]()` and `[](url)`).
- Title is optional, parsed from `"title"` after the URL inside parens. Milkdown's commonmark `link` mark schema includes a `title` attribute. v1 simplification: only double-quoted titles are supported; escaped quotes inside titles and single-quote delimiters are not handled.
- Inner text is run through existing `parseInlineSyntax` to recover same-boundary marks.

**`buildLinkRawText(text: string, href: string, title?: string)`:**

```ts
buildLinkRawText("bold", "https://example.com")
// → "[bold](https://example.com)"

buildLinkRawText("bold", "https://example.com", "My Title")
// → "[bold](https://example.com \"My Title\")"
```

When entering a link with same-boundary inner marks, the text portion is first run through `buildRawText` to wrap it with mark syntax before wrapping with link syntax.

**Serialization safety (toMarkdown):**

```ts
toMarkdown: {
  match: (node) => node.type.name === "link_source",
  runner: (state, node) => {
    const raw = node.textContent;
    const parsed = parseLinkSyntax(raw);
    if (parsed) {
      // Raw text is valid link syntax — serialize from parsed content
      state.openNode("link", { url: parsed.href, title: parsed.title || undefined });
      // Handle inner marks on the text portion
      const innerParsed = parseInlineSyntax(parsed.text);
      if (innerParsed.marks.length > 0) {
        for (const markName of innerParsed.marks) {
          const remarkType = MARK_SYNTAX[markName]?.remarkType ?? markName;
          state.openNode(remarkType);
        }
        state.addNode("text", undefined, innerParsed.text);
        for (let i = innerParsed.marks.length - 1; i >= 0; i--) {
          state.closeNode();
        }
      } else {
        state.addNode("text", undefined, parsed.text);
      }
      state.closeNode();
    } else if (node.attrs.href) {
      // Raw text is invalid but we have attrs — serialize from attrs
      state.openNode("link", { url: node.attrs.href, title: node.attrs.title || undefined });
      state.addNode("text", undefined, raw || node.attrs.href);
      state.closeNode();
    } else {
      // No valid link data — serialize as plain text
      state.addNode("text", undefined, raw);
    }
  },
}
```

### Trailing Split

A dedicated `findLinkTrailingSplit` function detects text trailing after closed link syntax. Unlike `inline_source`'s `findTrailingSplit` which scans for symmetric prefix/suffix markers, the link version scans for the `](...)` closing sequence followed by additional characters.

For example, `[text](url) and more`:
- Link portion: `[text](url)` → becomes a rendered link mark
- Trailing: ` and more` → becomes plain text

The function first checks if the full string is a valid closed link pattern via `parseLinkSyntax`. If so, no split needed. Otherwise, it scans for the last `)` that completes a valid `[...](...)` pattern with trailing text after it.

### Guards & Edge Cases

**IME composition guard:** Same as `inline_source` — track `compositionstart`/`compositionend`, skip all enter/leave transitions while composing.

**`suppressEnter` flag:** Same pattern as `inline_source` — set `true` when `docChanged` is detected in `appendTransaction`, reset to `false` on navigation keys (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `PageUp`, `PageDown`) via `handleKeyDown` and on `mousedown` via `handleDOMEvents`. While `true`, skip enter transitions for selection-only changes. Prevents source mode flashing after input rules fire.

**`handleTextInput` bypass:** Inside `link_source`, dispatch text insertion directly to prevent Milkdown input rules from firing.

**Backspace at node start:** Exit source mode first (restore link mark), then let the backspace proceed normally. Prevents raw syntax leaking into adjacent content.

**Undo/redo:** Enter/leave use `addToHistory: false`. Text edits within `link_source` go into history normally. Undo restoring invalid syntax degrades gracefully to plain text on leave.

### Decorations & Styling

Inline decorations for visual distinction of structural characters, built by `makeDecorationPlugin`:

| Region | CSS Class |
|--------|-----------|
| `[` | `.syntax-marker` |
| text | (unstyled) |
| `](` | `.syntax-marker` |
| url | `.link-url` |
| ` "title"` (if present) | `.link-url` |
| `)` | `.syntax-marker` |

```css
.milkdown .editor .link-source {
  font-family: inherit;
  border-radius: 2px;
  background: var(--crepe-color-inline-area, #f5f5f5);
  caret-color: var(--crepe-color-on-background, #333);
}

.milkdown .editor .link-source .link-url {
  opacity: 0.6;
}
```

Reuses existing `.syntax-marker` styling (muted opacity).

## Files

New files:

- `ui/plugins/link-source/syntax.ts` — `parseLinkSyntax`, `buildLinkRawText`, constants
- `ui/plugins/link-source/node.ts` — `link_source` node schema via `$node()` with remark serializer
- `ui/plugins/link-source/plugin.ts` — ProseMirror plugin: enter/leave state machine, Cmd+K handler, Cmd+click handler, decorations, IME guard, input rule bypass
- `ui/plugins/link-source/index.ts` — barrel exports

Modified files:

- `ui/components/Editor.tsx` — register `link_source` plugins
- `ui/plugins/inline-source/plugin.ts` — cross-node leave check (leave `link_source` when entering `inline_source` and vice versa)
- `ui/theme/skriv.css` — `.link-source` and `.link-url` styles
