# Architectural Decisions

## Entries

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
