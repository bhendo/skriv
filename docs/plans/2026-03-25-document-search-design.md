# Document Search (Cmd+F)

Find-in-document with match highlighting, next/prev navigation, and case sensitivity toggle. Works in both WYSIWYG and source editor modes with a single shared search bar UI.

## Goals

- Cmd+F opens a floating search bar in the top-right of the editor
- Live match highlighting as the user types
- Next/prev navigation with match count display
- Case-insensitive by default with an `Aa` toggle for case-sensitive mode
- Consistent UI across WYSIWYG (Milkdown/ProseMirror) and source (CodeMirror) modes
- Designed so find-and-replace can be added later without restructuring

## Architecture

Three new pieces:

### 1. ProseMirror Search Plugin (`ui/plugins/search/plugin.ts`)

Custom ProseMirror plugin for WYSIWYG mode. Follows existing plugin patterns (`$prose()` from `@milkdown/utils`).

**Plugin state:**
```typescript
interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: Array<{ from: number; to: number }>;
  activeIndex: number; // -1 when no matches
}
```

**Text extraction:** Walk `state.doc` using `doc.descendants()` to build a flat text string with a position map (text offset → ProseMirror document position). This searches visible/rendered text only — underlying markdown syntax is not searched.

**Match computation:** Run string matching against the flat text. Case-insensitive by default (lowercase both query and extracted text). Recompute on: doc change, query change, case-sensitivity toggle.

**Decorations:** Two CSS classes applied via `DecorationSet`:
- `.search-match` — all matches (subtle highlight)
- `.search-match-active` — current match (brighter highlight with outline)

**Commands exposed:**
- `setSearchQuery(query: string)` — update query, recompute matches
- `setCaseSensitive(caseSensitive: boolean)` — toggle, recompute matches
- `nextMatch()` — advance active index, scroll into view
- `prevMatch()` — move active index back, scroll into view
- `clearSearch()` — clear query and all decorations

### 2. Search Bar Component (`ui/components/SearchBar.tsx`)

Single React component used in both editor modes. Absolutely positioned top-right inside the editor container.

**Elements:**
- Text input (auto-focused on open)
- Match count display (`1/3` or `No results`)
- Previous / Next buttons
- Case sensitivity toggle button (`Aa`)
- Close button

**Behavior:**
- Dispatches to ProseMirror plugin or CodeMirror search API depending on active mode
- Escape closes the bar and returns focus to the editor

### 3. Search Hook (`ui/hooks/useSearch.ts`)

Manages search bar open/close state and mode-aware command dispatch.

**Keyboard shortcuts:**
- `Cmd+F` — open search bar (prevents browser default)
- `Escape` — close search bar, clear highlights, return focus to editor
- `Enter` / `Cmd+G` — next match
- `Shift+Enter` / `Cmd+Shift+G` — previous match

**State:**
- `isSearchOpen: boolean`
- `openSearch()` / `closeSearch()`
- Dispatches search commands to the correct editor engine based on current mode

**Editor access:** For WYSIWYG mode, the hook uses `useInstance()` from `@milkdown/react` to get the Milkdown editor, then accesses the ProseMirror `EditorView` via `ctx.get(editorViewCtx)` to dispatch plugin commands as transactions. For source mode, `SourceEditor` must expose its CodeMirror `EditorView` ref (extend the existing `EditorHandle` interface or add a dedicated ref). Search state (query, caseSensitive, isOpen) lives in the hook — above both editors — so it survives mode switches that destroy and recreate the editor instances.

### CodeMirror Integration (Source Mode)

Use `@codemirror/search` programmatic API (`SearchQuery`, `findNext`, `findPrevious`) without its built-in panel. The same `SearchBar.tsx` component drives CodeMirror search, so the UI is identical in both modes.

**Suppressing the built-in search panel:** `SourceEditor` currently uses `basicSetup` from `codemirror`, which bundles the search extension and its own Cmd+F keybinding. Replace `basicSetup` with `minimalSetup` plus the specific extensions needed (line numbers, bracket matching, etc.), excluding `search()`. Then add only the search *state* extension (for programmatic match highlighting) without the search panel or keymap, so Cmd+F is handled by our `useSearch` hook instead of CodeMirror's built-in panel.

## Interaction Details

- **Opening:** Cmd+F opens search bar, focuses input. If text is selected in the editor, pre-fills the input with the selection.
- **Typing:** Matches update live as the user types (~50ms debounce for performance).
- **Navigation:** Enter/Cmd+G goes to next match, Shift+Enter/Cmd+Shift+G goes to previous. Wraps around at ends. Active match scrolls into view.
- **Case toggle:** Clicking `Aa` toggles case sensitivity and immediately recomputes matches.
- **Closing:** Escape closes the bar, clears all highlights, returns focus to the editor.
- **Mode switching:** If search is open when switching between WYSIWYG and source mode, the search bar stays open, the query transfers, and matches recompute against the new mode's content.

## Visual Design

- **Placement:** Top-right floating overlay inside the editor container, matching Typora/VS Code convention
- **Match highlighting:** `.search-match` uses a subtle amber/yellow background; `.search-match-active` uses a brighter highlight with an outline
- **Styling:** Follows existing app theme CSS variables for colors, borders, and fonts

## Future: Find and Replace

The architecture supports adding replace by:
- Extending `SearchState` with `replaceText: string`
- Adding `replaceOne()` and `replaceAll()` commands to the plugin
- Expanding `SearchBar.tsx` with a replace input row (conditionally rendered)
- No structural changes needed

## Testing

### Unit Tests (Vitest)
- Text extraction from ProseMirror doc produces correct flat text and position map
- Match computation returns correct `{from, to}` positions for various queries
- Case-sensitive vs insensitive matching
- Next/prev navigation with wrap-around

### Component Tests (Vitest)
- SearchBar renders input, buttons, and match count
- Typing in input triggers search callback
- Keyboard shortcuts (Enter for next, Escape for close)
- Case sensitivity toggle updates state

### E2E Tests (Playwright)
- Cmd+F opens search bar, Escape closes it
- Typing a query highlights matches in the document (assert `.search-match` decorations and count)
- Next/prev navigation moves `.search-match-active` between matches
- Search with selected text pre-fills the input
- Search persists when switching from source mode to WYSIWYG mode
- Case sensitivity toggle changes match count
