# Architectural Decisions

## Entries

### ADR-003: Editor core pivot to CodeMirror 6 live preview (2026-08-10)

**Context:**

- The product goal is Typora-style editing: syntax appears when the cursor enters an element, renders away when it leaves
- The original Milkdown Crepe (ProseMirror) implementation required ~2,600 lines of `*-source` plugins that synthesized markdown syntax into special nodes and swapped them under the cursor (see ADR-001/002); essentially every open bug traced to that machinery or the WYSIWYG↔source mode split
- In a CodeMirror 6 architecture the buffer is the markdown source, so syntax reveal is decoration removal and saves are lossless by construction

**Decision:**

- Replace the editor core with CodeMirror 6 + `@prosemark/core` (MIT), the model used by Obsidian Live Preview and writer-computer
- Custom fold widgets (mermaid, GFM tables) via ProseMark's `foldableSyntaxFacet`; editor-agnostic mermaid core in `ui/mermaid/`
- Vendor the Crepe color palette into `ui/theme/colors.css` (`--skriv-color-*`) so theming survives the dependency removal
- Keep the raw source mode (Cmd+M) as a separate CodeMirror instance

**Consequences:**

- Issues #8, #24, #31, #32, #37, #39, #50, #53, #59, #60 are resolved or obsolete; ADR-001/002 describe deleted code
- Feature differences vs Crepe: no floating toolbar or slash commands (keyboard-first), no structured table editing (preview + raw pipe editing), emphasis toggles produce `_underscore_` style, no Cmd+/ commenting inside mermaid fences
- `@prosemark/core` is 0.0.x — pin-and-verify on upgrades; the keymap aliases fail loudly via unit test if upstream renames bindings

### ADR-001: Inline source mode via ProseMirror node replacement (2026-03-20)

**Context:**
- Need Typora-style inline syntax toggling: click on bold text, see `**bold**` with editable markers, click away to render
- ProseMirror doesn't natively support this pattern

**Decision:**
- Replace marked text with an `inline_source` node (inline, content: "text*", marks: "") on cursor entry
- Parse raw text back to marks on cursor exit
- At most one inline_source exists at a time

**Consequences:**
- The node is fragile — any document mutation (Enter, Backspace, input rules, structural lifts) can corrupt or destroy it
- Requires explicit handling for: text input (bypass input rules), backspace at boundaries (exit source mode first), Enter inside the node (#39)
- appendTransaction timing is tricky — ProseMirror's DOM observer fires selection-only transactions after doc changes that can falsely trigger ENTER

### ADR-002: suppressEnter flag for ENTER timing (2026-03-20)

**Context:**
- ENTER fires on any selection-only transaction where cursor is adjacent to a supported mark
- ProseMirror's DOM observer fires selection-only transactions after input-rule conversions
- `docChanged` guard alone doesn't work — the observer transactions are genuinely selection-only

**Decision:**
- Use a closure-level `suppressEnter` flag set on any doc change
- Clear only on deliberate user interaction: mousedown or navigation keys (arrows, Home/End, PageUp/Down)
- Pass to `handleInlineSourceTransition` as an additional parameter

**Alternatives Considered:**
- `docChanged` guard only → Rejected: DOM observer transactions have docChanged=false
- Transaction meta flags → Rejected: can't tag transactions from liftListItem or input rules
- Time-based debounce → Rejected: fragile and unreliable
- Plugin state tracking → Rejected: state clears too early in apply()

**Consequences:**
- Correctly prevents source mode flash after typing `**text**`
- Breaks ENTER-LEAVE cycles
- Requires mousedown/keydown handlers to clear the flag for intentional navigation
