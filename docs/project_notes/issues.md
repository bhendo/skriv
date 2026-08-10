# Issues / Work Log

## Entries

### 2026-08-10 - #68: Milkdown removal — live preview becomes the editor

- **Status**: Completed
- **Description**: Deleted the Milkdown/Crepe editor, all five `*-source` plugins, the PM search plugin, and the `@milkdown/*` + `codemirror` dependencies (~4,700 lines). Live preview is now the only WYSIWYG editor; Cmd+M raw source mode remains. Crepe's palette vendored to `ui/theme/colors.css` as `--skriv-color-*`; `useSearch` is CodeMirror-only; e2e suite rewritten against the live-preview editor. Added CM `placeholder()` ghost text (the old `?? PLACEHOLDER` fallback was dead code — `content` initializes to `""`).
- **URL**: https://github.com/bhendo/skriv/issues/68
- **Notes**: Behavior differences vs Crepe are recorded in ADR-003. Closed as resolved/obsolete: #8, #24, #31, #32, #37, #39, #50, #53, #59, #60.

### 2026-08-10 - #68: Live-preview feature migration

- **Status**: Completed (merged in PR #71)
- **Description**: Feature parity for the live-preview editor after the spike merged: mermaid diagrams (fold widget reusing the shared renderer/overlay), GFM table previews (pure source → DOM renderer via @lezer/markdown), Cmd+K clipboard link auto-fill (#56 parity), Cmd+E / Cmd+Alt+X shortcut aliases (#25 parity). Task lists and image folding come free from ProseMark defaults (relates #60). E2E suite for live-preview mode added.
- **URL**: https://github.com/bhendo/skriv/issues/68
- **Notes**: Not migrated (intentional, pending verdict): Crepe floating toolbar, slash commands, structured table editing. Local-file image resolution is not present in either editor; belongs with #3.

### 2026-08-10 - #68: Spike: CodeMirror 6 live-preview editor core (ProseMark)

- **Status**: Superseded — the spike passed evaluation; see the Milkdown-removal entry above
- **Description**: Flag-gated CodeMirror 6 + @prosemark/core live-preview editor mounted in the WYSIWYG slot (`VITE_LIVE_PREVIEW=1` or localStorage `skriv:live-preview=1`). Motivation: the ProseMirror `*-source` plugins fight the architecture (~half the frontend, most open bugs); CM6 live preview makes syntax reveal the default behavior. Evaluation criteria in `docs/plans/2026-08-10-live-preview-editor-spike-design.md`.
- **URL**: https://github.com/bhendo/skriv/issues/68
- **Notes**: `useSearch`'s `sourceMode` option renamed to `codeMirrorMode` (it selects the CodeMirror search path, now used by both source mode and live preview). ProseMark themes via `--pm-*` CSS variables, mapped to crepe variables in `skriv.css`.

### 2026-03-20 - #38: Bold text lost when unwrapping list item via marker deletion
- **Status**: Completed
- **Description**: Inline formatting lost during structural edits. Root cause was three interacting issues in the inline-source plugin (ENTER timing, input rule interference, backspace boundary handling).
- **URL**: https://github.com/bhendo/skriv/issues/38
- **Notes**: Fix in commit c23f547 on feature/phase-2-block-syntax-toggling

### 2026-03-22 - #41: Support mermaid diagrams
- **Status**: Completed
- **Description**: Render mermaid fenced code blocks as visual SVG diagrams in WYSIWYG mode. Custom `mermaid_block` ProseMirror node with NodeView toggling between rendered SVG and textarea editor. Theme mapped from `--crepe-color-*` CSS vars via mermaid's `themeVariables` API.
- **URL**: https://github.com/bhendo/skriv/issues/41
- **Notes**: Implemented on feature/41-mermaid-diagrams branch. Remark plugin intercepts mermaid code fences before Milkdown's code_block handler. New files in `ui/plugins/mermaid-block/`.

### 2026-03-20 - #39: Cannot exit source mode when inline_source is only content
- **Status**: Open
- **Description**: When inline_source fills the entire paragraph, there's no clickable area outside the node to trigger LEAVE. Enter key doesn't exit source mode.
- **URL**: https://github.com/bhendo/skriv/issues/39
