# Source Mode Toggle Design

**Date:** 2026-03-20
**Feature:** Full document source mode toggle via Cmd+/

## Problem

Typora provides `Cmd+/` to switch the entire editor between WYSIWYG rendering and raw markdown source editing. Skriv currently has cursor-aware inline syntax toggling (`Cmd+Shift+E`), but no way to view or edit the full document as raw markdown. These are complementary features — one is document-level, the other is cursor-level.

## Approach

**Swap the entire editor.** When the user presses `Cmd+/`, unmount the active editor, capture its markdown content, and mount the other editor with that content as its initial value. This follows the existing snapshot pattern used by `Cmd+Shift+E`.

### Why swap instead of overlay?

- Clean separation: each editor fully owns its state
- No stale-state synchronization complexity
- Follows the existing `editorSnapshot` pattern in `App.tsx`
- Remount cost is negligible for a document editor

### Scroll position

Not preserved in v1. Can be added later by capturing the top-visible line/offset before toggle and scrolling the incoming editor to the equivalent position. CodeMirror and ProseMirror both have APIs to support this.

## Architecture

### Shared editor interface

Both `MarkdownEditor` and `SourceEditor` implement the same ref interface:

```typescript
interface EditorHandle {
  getMarkdown(): string;
}
```

This allows `App.tsx` to interact with whichever editor is mounted without branching logic. File operations (save, open, reload) all go through `editorRef.current.getMarkdown()` and continue to work unchanged.

### New component: `SourceEditor`

`ui/components/SourceEditor.tsx` — a React component wrapping a standalone CodeMirror 6 instance.

**Props:**
- `defaultValue: string` — initial markdown content
- `onChange: () => void` — callback to mark document as modified

**Ref:** Exposes `getMarkdown(): string` via `forwardRef`/`useImperativeHandle`.

**CodeMirror extensions:**
- `@codemirror/lang-markdown` + `@codemirror/language-data` — markdown syntax highlighting with embedded language support in fenced code blocks
- `lineWrapping` — wraps long lines
- `basicSetup` — bracket matching, line numbers, etc.
- Dark/light theming via a CodeMirror compartment, switched when system theme changes

### App.tsx changes

- New state: `sourceMode: boolean` (default `false`)
- `Cmd+/` handler: extracts markdown from active editor via `editorRef`, stores as `editorSnapshot`, flips `sourceMode`
- Conditional render: `sourceMode ? <SourceEditor /> : <MarkdownEditor />`
- Both editors receive the same `editorRef`

### Keyboard shortcuts

`Cmd+/` added to `useKeyboardShortcuts.ts` via a new `onToggleSourceMode` callback. When in source mode, WYSIWYG-specific shortcuts (`Cmd+Shift+E`) are no-ops since Milkdown isn't mounted. `Cmd+S` works unchanged.

### Styling

The `SourceEditor` fills the same container as `MarkdownEditor`. A `.source-editor` class in `skriv.css` handles container sizing. CodeMirror themes handle colors. Monospace font is appropriate for source mode.

### Theme support

`SourceEditor` receives the current dark/light mode and uses a CodeMirror theme compartment to switch between `oneDark` (dark) and the default light theme.

## File impact

- **New:** `ui/components/SourceEditor.tsx`
- **Modified:** `App.tsx`, `useKeyboardShortcuts.ts`, `ui/theme/skriv.css`, `ui/components/Editor.tsx` (extract `EditorHandle` type)
- **New dependencies:** `@codemirror/lang-markdown`, `@codemirror/language-data` (check if Crepe already pulls these in)
- **No Rust/Tauri changes**

## Out of scope

- Scroll position preservation across toggles (follow-up)
- Source mode toolbar or status indicator (follow-up)
- Split view / side-by-side mode
