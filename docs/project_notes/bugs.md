# Bug Log

Recurring bugs, root causes, and solutions. Focus on what was learned.

## Entries

### 2026-03-24 - Task list marker input clipped the closing bracket

- **Issue**: When the cursor entered a task list item (`- [ ]`), the editing-mode marker input was too narrow — the closing `]` was cut off, making it look like `- [  text` instead of `- [ ] text`.
- **Root Cause**: The input width was calculated as `value.length` in `ch` units, but `ch` measures the CSS "0" glyph advance width which doesn't account for the `<input>` element's built-in internal decoration (browser-added padding inside the content box). For a 5-character marker, `5ch` was ~12px too narrow.
- **Solution**: Add 1 extra `ch` of buffer to the width calculation (`value.length + 1`), which covers the internal decoration. The existing CSS right-padding (0.35ch) provides additional breathing room.
- **Prevention**: When sizing `<input>` elements using `ch` units, always add at least 1ch buffer for internal element decoration. Avoid `scrollWidth`-based measurement as it's unreliable across engines (WebKit vs Chromium) and requires the element to be in the document.

### 2026-03-24 - Custom list items showed duplicate bullets and loose block spacing

- **Issue**: Bulleted lists rendered with a stray native marker at the far left and the text sat lower than the custom marker, making lists look misaligned.
- **Root Cause**: The custom list item NodeView renders its own marker UI, but the browser was still allowed to apply native `li` marker styling and default first/last block margins inside the list item content.
- **Solution**: Explicitly reset the custom list item's native list styling (`list-style: none`, zeroed margin/padding), keep the flex layout local to the themed editor, and trim the first/last child block margins inside `.children`.
- **Prevention**: Any custom ProseMirror/Milkdown list item UI should explicitly neutralize native `li` marker behavior and add an e2e style assertion for the relevant computed list styles.

### 2026-03-24 - Task list source markers were hidden in list edit mode

- **Issue**: Entering list-marker edit mode on `- [ ]` / `- [x]` items only showed `-`, so the task checkbox syntax disappeared and longer prefixes were clipped.
- **Root Cause**: The custom list marker helper ignored the GFM `checked` attr added by Milkdown's task-list schema extension, and the marker input was hard-coded to `24px` wide.
- **Solution**: Include `checked` in marker parsing/rendering (`- [ ]`, `- [x]`, and ordered variants), sync the node's `checked` attr on commit, and size the marker input from its current text.
- **Prevention**: When custom editing UIs mirror markdown syntax, make sure they round-trip all schema attrs introduced by GFM extensions and avoid fixed-width inputs for variable-length prefixes.

### 2026-03-24 - Task checkbox clicks stopped working after custom list item view override

- **Issue**: Clicking a rendered task checkbox in WYSIWYG mode did nothing, even though Crepe normally lets users toggle task items directly.
- **Root Cause**: The custom list-item NodeView replaced Milkdown's built-in task-list component but did not carry over its `pointerdown` handler on the label wrapper, so the `checked` attr was never toggled.
- **Solution**: Restore checkbox interaction in the static label state by handling `pointerdown` on task-item labels, dispatching `setNodeMarkup` with the inverted `checked` value, and exposing checkbox semantics (`role="checkbox"`, `aria-checked`) on the wrapper.
- **Prevention**: When replacing library NodeViews, compare them against the upstream component for both visuals and interactions; custom renderers need parity for event handlers, not just DOM structure.

### 2026-03-20 - Inline formatting lost during structural edits (#38)

- **Issue**: Bold/italic/code text lost formatting when: (a) typing `**text**` triggered input rules that flashed source mode, (b) backspace joining paragraphs destroyed the inline_source node, (c) editing markers inside inline_source had asterisks stripped by Milkdown input rules
- **Root Cause**: Three interacting issues — ProseMirror DOM observer fires selection-only transactions after input rules (triggering ENTER), input rules pattern-match inside inline_source nodes (stripping markers), and backspace at node boundaries leaks raw syntax as plain text
- **Solution**: (1) `suppressEnter` flag set on doc changes, cleared on mousedown/nav keys; (2) `handleTextInput` bypasses input rules inside inline_source; (3) Backspace at start of inline_source exits source mode first, then lets join proceed; (4) Strict LEAVE boundary check (`>` / `<`)
- **Prevention**: When adding inline editing nodes, always handle text input to bypass input rules, intercept structural keys (Backspace/Delete/Enter) at node boundaries, and never trust that appendTransaction timing matches user intent

### 2026-03-20 - Milkdown input rules fire inside inline_source nodes

- **Issue**: Typing `*` inside an inline_source to restore `**bold**` caused Milkdown's input rules to match the pattern and apply marks. Since inline_source has `marks:""`, the marks were stripped, leaving just "bold" with all asterisks gone.
- **Root Cause**: ProseMirror input rules don't check the parent node's mark constraints — they pattern-match on text content regardless
- **Solution**: `handleTextInput` prop intercepts typing inside inline_source and dispatches `insertText` directly, bypassing input rules
- **Prevention**: Any node with `marks:""` that contains user-editable text resembling markdown syntax needs input rule bypass
