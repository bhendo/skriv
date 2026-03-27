# TOC Sidebar Design

**Issue:** #19 — Add expandable table-of-contents sidebar for heading navigation

## Overview

A collapsible left sidebar that displays a table of contents derived from the document's headings. Users can click headings to navigate, and scroll-spy highlights the currently visible heading. Works in both WYSIWYG and source mode.

## Component Architecture

### New Files

- `ui/components/TocSidebar.tsx` — sidebar shell (collapse toggle, header, heading list, active highlight)
- `ui/hooks/useToc.ts` — hook that bridges both editors, returns headings, active index, and scroll-to function

### Shared Types

```typescript
interface TocHeading {
  level: number;   // 1-6
  text: string;    // heading text content
  pos: number;     // editor offset (PM doc position or CM line offset)
}
```

Both extractors produce `TocHeading[]`. The sidebar component consumes this array and a `scrollToHeading(pos: number)` callback — it has no knowledge of which editor is active.

### Data Flow

```
App.tsx
├── TocSidebar (left column, collapsible)
│   └── Renders TocHeading[], highlights activeIndex
├── Editor column (flex: 1)
│   ├── SearchBar
│   └── MarkdownEditor / SourceEditor
```

`useToc` receives `editorRef` and `sourceMode`. It swaps between ProseMirror and CodeMirror extraction based on the active mode and exposes:

- `headings: TocHeading[]`
- `activeIndex: number`
- `scrollToHeading: (pos: number) => void`

## Layout

The current single-column flex layout in `App.tsx` becomes two columns:

```
┌──────────────────────────────────────────┐
│ Banner area (full width, unchanged)      │
├───────────┬──────────────────────────────┤
│ TOC       │ Editor container             │
│ Sidebar   │ (flex: 1, overflow: auto)    │
│ ~220px    │                              │
│           │ .milkdown / .source-editor   │
│ collapses │ max-width: 860px, centered   │
│ to 0px    │                              │
├───────────┴──────────────────────────────┤
```

- Banners remain full-width above both columns.
- A flex row wraps the sidebar and editor container.
- Sidebar has a fixed width (~220px) with CSS transition to 0 when collapsed.
- Editor column is `flex: 1` — takes remaining space.
- Editor's `max-width` and `margin: 0 auto` centering is unchanged.
- The editor column is a **CSS container** so that future responsive breakpoints (#11) can use container queries instead of media queries, making them independent of sidebar state.

## Heading Extraction

### WYSIWYG Mode (ProseMirror)

A ProseMirror plugin view listens to document updates. On each update, it walks the doc tree via `doc.descendants()`, collecting `heading` and `heading_source` nodes. For each, it extracts `{ level: node.attrs.level, text: node.textContent, pos }` and pushes the list to React state via a callback.

### Source Mode (CodeMirror)

A CodeMirror `ViewPlugin` re-evaluates on document changes. It scans lines for the ATX heading pattern (`/^(#{1,6})\s+(.+)/`), extracting `{ level, text, pos: lineStartOffset }` for each match. It pushes to the same React state via callback.

### Interface Boundary

Both extractors produce `TocHeading[]`. The `useToc` hook swaps the active extractor when `sourceMode` changes. The sidebar and scroll-spy logic are completely decoupled from the editor internals.

## Scroll-spy

Listens to the scroll event on the editor's scroll container (the `overflow: auto` div). On scroll, determines the active heading — the last heading whose top edge is at or above a threshold (~20% from viewport top). Updates `activeIndex` in `useToc`. The TOC sidebar highlights the active entry and auto-scrolls it into view if the heading list overflows.

## Click-to-Navigate

- **WYSIWYG:** Dispatches a ProseMirror transaction to set selection at `pos`, then `scrollIntoView`.
- **Source:** Uses CodeMirror `dispatch` to set cursor at `pos` and `scrollIntoView`.
- Both wrapped behind `scrollToHeading(pos: number)`.

## Toggle & Persistence

### Toggle Button

- When open: a collapse icon in the sidebar header.
- When closed: a small icon button fixed at the left edge of the editor area.
- Keyboard shortcut: `Cmd+Shift+L` (`Ctrl+Shift+L` on non-Mac).

### State Persistence

- Open/closed state saved to `localStorage`.
- Default: collapsed (writing-first experience).

### Animation

CSS transition on sidebar width (`220px` → `0`) with `overflow: hidden`. Editor column resizes smoothly via flexbox.

## Testing

### Unit Tests (Vitest)

- **ProseMirror heading extraction:** Given a PM doc with various heading levels, verify correct `TocHeading[]` output. Test `heading` and `heading_source` nodes, nested content, and empty documents.
- **CodeMirror heading extraction:** Given raw markdown text, verify correct `TocHeading[]` output. Test all heading levels, headings with inline formatting, lines that look like headings but aren't (e.g., inside code blocks).
- **TocSidebar component:** Renders heading list with correct indentation per level. Highlights active index. Shows empty state when no headings. Calls `scrollToHeading` on click.

### E2E Tests (Playwright)

- **Toggle sidebar:** Open sidebar via keyboard shortcut and toggle button, verify it appears/disappears.
- **Heading list populates:** Open a markdown file with headings, open sidebar, verify headings appear with correct hierarchy.
- **Click-to-navigate:** Click a TOC entry, verify the editor scrolls to that heading.
- **Real-time update:** Add a new heading in the editor, verify it appears in the TOC without manual refresh.
- **Source mode:** Switch to source mode, verify TOC still shows headings and click-to-navigate works.

## Edge Cases

- **No headings:** Sidebar shows subtle "No headings" empty state.
- **Heading at document bottom:** Scroll as far as possible, still mark active.
- **`heading_source` nodes:** Treated the same as `heading` for extraction (cursor is inside a heading in WYSIWYG mode).
- **Rapid editing:** Heading extraction is debounced or throttled to avoid excessive updates during fast typing.
