# Bug Log

Recurring bugs, root causes, and solutions. Focus on what was learned.

## Entries

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
