# Bug Log

Recurring bugs, root causes, and solutions. Focus on what was learned.

## Entries

### 2026-08-12 - Double scrollbar over the editor pane

- **Issue**: Two nested scrollbars on the content area (fullscreen or not, unrelated to the sidebar): the inner one scrolls the document, the outer one scrolls the editor box itself by ~40px
- **Root Cause**: `.source-editor`/`.live-preview-editor` had `height: 100%` plus `padding: 20px 60px` under default `content-box` sizing, so the editor box was exactly 40px (the vertical padding) taller than its pane; the wrapper div's `overflow: auto` then grew a second scrollbar over CodeMirror's own `.cm-scroller`. Pre-existing on main, surfaced during #19 testing. Measured before fixing: wrapper scrollHeight 760 vs clientHeight 720
- **Solution**: `box-sizing: border-box` on the editor containers, with `max-width: calc(var(--skriv-editor-max-width) + 2 * var(--skriv-editor-padding-x))` compensating so the prose column keeps its width (the padding var split into `-x`/`-y` components); the wrapper is now `overflow: hidden`
- **Prevention**: `.cm-scroller` is the only intended scroll container (key_facts.md). Any ancestor with `overflow: auto` that gains a few px of overflow will silently stack a second scrollbar — keep editor ancestors `overflow: hidden`, and remember `height: 100%` + padding needs `border-box`

### 2026-08-11 - Window-targeted Tauri events delivered to every window

- **Issue**: With multiple windows open, a file-association/CLI open loaded the file into every window, not just the blank one ("file-opened"); the same broadcast pattern would have made a File > Save menu item save all windows and quit-requested fire N times per window
- **Root Cause**: Two independent halves both broadcast. (1) `WebviewWindow::emit`/`AppHandle::emit` broadcast to all targets — per-window delivery needs `emit_to(label, ...)`. (2) A frontend global `listen()` from `@tauri-apps/api/event` registers with target `Any` and receives every event **regardless of the Rust-side emit target** — so `emit_to` alone changes nothing observable. The pre-existing `file-changed` flow (emit_to + global listen) only appeared correct because its handler re-opens the window's own path and ignores the payload
- **Solution**: Pair both halves for every window-targeted event (`file-opened`, `file-changed`, `quit-requested`, `menu-*`): Rust emits via `app.emit_to(label, ...)`, frontend listens via `getCurrentWindow().listen(...)`. Deliberately broadcast events (`recents-changed`) keep plain `emit` + global `listen`
- **Prevention**: In multi-window code, never use `win.emit(...)` expecting per-window delivery, and never use global `listen()` for an event that is per-window; verified end-to-end by opening files via CLI single-instance forwarding with three windows open

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
