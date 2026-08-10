# Live-Preview Editor Core Spike Design

**Date:** 2026-08-10
**Feature:** CodeMirror 6 live-preview editor (ProseMark) behind a feature flag (#68)

## Problem

Skriv's core product goal is Typora-style editing: raw markdown syntax appears
when the cursor enters an element and renders away when it leaves. The current
implementation builds this on Milkdown Crepe (ProseMirror), and the cost is now
measurable:

- ~2,600 of ~5,300 frontend lines are the `*-source` plugins (inline, link,
  heading, list, code-block, block-source) that reconstruct markdown syntax
  inside a rich-text tree.
- Essentially every open bug traces to that machinery or the WYSIWYG/source
  mode split: #39 (cannot exit inline_source), #59 (doubled list markers),
  #31/#32 (overlapping marks), #50 (spurious dirty state from lossy
  markdown round-trips), #65 (cursor/scroll lost on mode switch), and the
  unresolved TOC navigation bug (heading-source interaction).
- ADR-001 records the design as fragile; CLAUDE.md records that ProseMirror
  is not well suited to this pattern.

The root cause is architectural. In ProseMirror the document is a rich-text
tree; the markdown source does not exist at runtime, so "revealing syntax"
means synthesizing source text into a special node and swapping it under the
cursor. Every feature that touches text must then interoperate with that
state machine.

## Approach

**Spike a CodeMirror 6 live-preview editor behind a feature flag, inside the
existing shell.** In this architecture the document *is* the markdown source,
and rendering is decorations over it: hiding `**` when the cursor is
elsewhere, folding a fence into a rendered block, and so on. Revealing syntax
on cursor entry is the default behavior, not a feature.

This is the architecture of Obsidian Live Preview and of writer-computer
(Tauri v2 + React + CodeMirror 6, ~1.3k stars), which demonstrates tables,
mermaid, and math all working as CM6 decorations. writer-computer is GPL-3.0,
so it serves as an architecture reference only; its editor core is a vendored
copy of **ProseMark** (`@prosemark/core`), which is published on npm under
MIT and is license-compatible with skriv.

### Why ProseMark instead of hand-rolling decorations

- `@prosemark/core` provides the hide-syntax-marks/fold-widgets machinery for
  inline styles, links, headings, lists (incl. task lists), images, block
  quotes, and code fences.
- Skriv already ships every CodeMirror 6 peer dependency (the source-mode
  editor uses them); only `@prosemark/core` and `@lezer/markdown` are new.
- It is young (0.0.x). That is acceptable for a spike; the fallback is
  writing our own decoration extensions on the same CM6 foundation, which is
  the writer-computer path.

### What a successful spike unlocks (and what it dissolves)

| Today | With a single CM6 buffer |
| --- | --- |
| #8 four-phase syntax-toggling project | Default behavior |
| #24/#50/#65 mode-switch bugs | No mode switch exists; source view = toggle decorations |
| #39, #59, #31, #32 node-swap bugs | Class of bug cannot occur |
| #37 editable fence language | Fence line is literal text |
| #46-style theme drift across 3+ editor surfaces | One surface to theme; #20 settings become tractable |

### What we give up (rebuild list if we commit)

Crepe currently provides for free: rendered tables, image blocks, the
floating toolbar, and slash commands. writer-computer demonstrates each is
feasible on CM6, but they are real work. The spike does not rebuild them;
it exists to judge the core editing feel before committing.

## Architecture

### New component: `LivePreviewEditor`

`ui/components/LivePreviewEditor.tsx` — standalone CodeMirror 6 instance,
mirroring `SourceEditor`'s structure.

**Props:** `defaultValue: string`, `onChange: () => void`
**Ref:** implements the existing `EditorHandle` (`getMarkdown()`,
`getCodeMirrorView()`), so save/open/reload in `App.tsx` work unchanged.

**Extensions:**

- `markdown({ codeLanguages: languages, extensions: [GFM, prosemarkMarkdownSyntaxExtensions] })`
- `prosemarkBasicSetup()` + `prosemarkBaseThemeSetup()` from `@prosemark/core`
- `history`, default/history keymaps, `EditorView.lineWrapping`
- `search()` without `searchKeymap` (Cmd+F stays with `SearchBar`)
- `updateListener` → `onChange` for dirty tracking

### Feature flag

`ui/flags.ts` — `isLivePreviewEnabled()`, true when either:

- `VITE_LIVE_PREVIEW=1` at build/dev time (`VITE_LIVE_PREVIEW=1 make dev`), or
- `localStorage["skriv:live-preview"] === "1"` (flip in DevTools, reload)

### App.tsx wiring

When the flag is on, the WYSIWYG slot renders `LivePreviewEditor` instead of
`MarkdownEditor`. Cmd+M still swaps to the raw `SourceEditor`. Search uses
the existing CodeMirror branch of `useSearch` (it branches on which view is
active, so live-preview mode reuses the `sourceMode` code path).

### Theming and width

`.live-preview-editor` gets `--skriv-editor-max-width`, `--skriv-editor-padding`,
and the skriv font variables so the spike is judged with the intended layout.
ProseMark's base theme handles syntax styling; light/dark follows the existing
`useTheme` hook via CSS.

## Evaluation criteria

Decide pivot vs stay after using the spike on real documents:

1. **Feel:** syntax reveal on headings, bold/italic, links, lists, and fences
   compared against Typora side by side.
2. **Fidelity:** open → edit → save produces no spurious diffs (`git diff`
   on a real repo of markdown files).
3. **Rebuild cost:** concrete list of Crepe features we would miss, checked
   against ProseMark/writer-computer equivalents.

If the spike wins, the migration is incremental: the flag becomes a setting,
tables/images/toolbar land as follow-up issues, and the `*-source` plugins
and Milkdown deps are removed last. The Rust side (ValidatedPath, scope,
watcher), e2e infrastructure, and theme variables carry over untouched.

## Out of scope

- Tables, image rendering, toolbar, slash commands (rebuild list, post-spike)
- Mermaid in live preview (portable later; mermaid rendering logic is
  editor-agnostic)
- Removing any Milkdown code or dependencies
