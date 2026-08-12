# Architectural Decisions

## Entries

### ADR-004: React search bar over the @codemirror/search panel (2026-08-12)

**Context:**

- #23 (find and replace) built on the existing custom React `SearchBar`, which drives CodeMirror through the query API (`setSearchQuery`, `findNext`, `replaceNext`, `replaceAll`) with `searchKeymap` deliberately excluded from both editors
- `@codemirror/search` ships a complete find/replace panel, but it renders its own DOM inside the editor and its match highlighter only draws while that panel is open — so a custom bar gets no highlighting for free
- All other Skriv chrome (sidebar, banners, prompts) is React; a CM panel would be the one non-React surface and would need CM-theme styling to match

**Decision:**

- Keep the React `SearchBar` as the only search UI; CodeMirror state holds the authoritative query, the bar owns transient UI state (query text, replace text, row visibility), `useSearch` mediates commands and match counts
- Ship a custom `searchHighlight` ViewPlugin for viewport match highlighting, bundled with `search()` as the single `searchExtensions` export (`ui/utils/searchHighlight.ts`) so an editor cannot wire one without the other
- Use custom `.skriv-search-match` classes rather than reusing `.cm-searchMatch`: CM injects its base theme at runtime, so restyling the stock classes is a specificity contest; the one interaction rule that matters (no selection-match tint inside a search match) is mirrored in skriv.css

**Consequences:**

- Match semantics changes (regex, whole-word) must touch both `countMatches` in `useSearch` and `searchHighlight` — they walk the same query API but independently
- The counter's `activeIndex` means "next match from the cursor", so navigation recounts the document; fine at Skriv document sizes, revisit only if it ever shows up in profiling
- Search shortcuts live in `useKeyboardShortcuts` (platform seam in `ui/utils/platform.ts`); menu accelerators remain macOS-only hints. The tooltip/menu/hook chord triplication this ADR noted was resolved by the #78 shared registry (`ui/utils/shortcuts.ts`)

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
