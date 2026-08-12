# Issues / Work Log

## Entries

### 2026-08-12 - #65: Preserve cursor/scroll position across source-mode toggle

- **Status**: Completed on branch `feature/65-preserve-editor-position`
- **Description**: The issue predates the #68 pivot (it describes mapping ProseMirror offsets to markdown offsets); post-pivot both modes are CodeMirror views over the identical string, so offsets transfer directly. New `ui/utils/editorPosition.ts`: `captureEditorPosition` grabs the selection (`EditorSelection` reused as-is; CM collapses multi-range selections itself when the target state disallows them) and the top visible line via `lineBlockAtHeight(scrollTop - documentPadding.top)`. App's `handleToggleSourceMode` stores `{markdown, position}` as one atomic `editorHandoff` state (a position can never pair with a document it wasn't captured from — this replaced a separate snapshot + a doc-length runtime guard after the polish review). Each editor applies its `restorePosition` prop at view construction: `selection` into `EditorState.create`, `EditorViewConfig.scrollTo` with `scrollIntoView(topPos, {y: "start"})` (clipped to the state, so range-safe), then `view.focus()` — no post-mount dispatch, so no wasted update/DOM pass.
- **URL**: https://github.com/bhendo/skriv/issues/65
- **Notes**: First attempt restored from an App-level `[sourceMode]` effect (the useToc child-before-parent pattern) and failed only in dev: StrictMode's simulated remount destroys and recreates the just-mounted view *after* parent effects run, discarding anything dispatched into view #1 (see key_facts.md). Scroll restore anchors the top visible line, not a pixel offset — the modes render at different line heights, so the viewport shows the same content at the top but fits a different number of lines below it (the e2e asserts that invariant, not bottom-line visibility). `longDoc`/`headingLine` e2e helpers hoisted to `e2e/fixtures` (were duplicated with outline.spec). Toggle no longer calls `getMarkdown()` (reads `view.state.doc.toString()` via `useEditorView`); LivePreviewEditor's `lastSyncedRef` reference-equality sync is unaffected because the mounting instance sets it from the handoff string it was given.

### 2026-08-12 - #19: Outline tab in sidebar (TOC v2)

- **Status**: Completed on branch `feature/19-toc-sidebar-v2` (not yet merged)
- **Description**: TOC reimplemented post-pivot, replacing closed PR #66 with the Typora model: a Files/Outline tab bar in the existing sidebar (tab state in App, session-lifetime, unpersisted like sidebar visibility). New `ui/toc/extract.ts` — pure lezer parse with the tables.ts parser config, so the outline agrees with editor rendering (setext, closing-hash ATX, fences nested in lists all correct, unlike the old branch's regex). New `ui/hooks/useToc.ts` — extraction gated on outline-enabled, 200 ms debounce on keystrokes (via `handleChange`), immediate on open/Cmd+M/tab-enable; click-to-navigate dispatches selection + `scrollIntoView` (y:start, yMargin 50); scroll-spy listens on `view.scrollDOM` and probes a reading line 20% down the viewport with `lineBlockAtHeight`, bottom-of-scroll pins the last heading. `OutlinePanel.tsx` renders `.sidebar-item` buttons with per-level indent and `aria-current`. Cmd+Shift+L three-state toggle (hidden→show outline, files→switch, outline→hide) + View ▸ Toggle Outline menu item.
- **URL**: https://github.com/bhendo/skriv/issues/19
- **Notes**: No editor-component changes were needed: child effects run before parent effects, so App-level `[enabled, sourceMode]`-keyed effects always find the freshly built EditorView after a Cmd+M swap, and `onChange` (docChanged) already reaches App. Salvaged from the old branch: `TocHeading` shape, `headingsEqual`, indent formula, rAF scroll throttle, extraction test cases. Follow-ups: strip inline emphasis markers from outline text; tab/visibility persistence (existing deferred item); from the polish review — move the prose max-width from the editor containers to the content layer so `.cm-scroller` spans the full pane (scrollbar and wheel at the pane edge instead of the column edge; needs an answer for the source editor's gutter), and consider extracting headings from the editor's incremental `syntaxTree` instead of a standalone full parse if large-document typing jank ever shows up (trade-off: `ensureSyntaxTree` completeness vs the pure-function unit tests).

### 2026-08-11 - Triage: closed stale pre-pivot PRs #55 and #66

- **Status**: Completed
- **Description**: Both PRs predated the #68 editor pivot and targeted deleted code. PR #55 (robinsandborg, task-list rendering/marker editing) improved `ui/plugins/list-source/`, removed with the Milkdown path; closed with a note inviting a fresh issue/PR against the live-preview core (its `test-results/` gitignore change had already landed separately; its CLAUDE.md→AGENTS.md rename did not). PR #66 (TOC sidebar) was built for the dual PM/CM architecture; closed, issue #19 stays open. `feature/19-toc-sidebar` branch kept — `extract-cm.ts` and `TocSidebar.tsx` are reusable references for a post-pivot implementation, which also needs a design call on how a TOC coexists with the new file sidebar.

### 2026-08-11 - Native File menu + left sidebar (folder files & recents)

- **Status**: Completed on branch `feature/file-menu-and-sidebar` (not yet merged)
- **Description**: First native menu (`src-tauri/src/menu.rs`): App/File/Edit/View/Window submenus; File has New Window, Open…, Save, Save As…, Close Window; menu events route to the focused window via `emit_to` + window-scoped listeners (`ui/hooks/useMenuEvents.ts`). Accelerators are macOS-only (see key_facts.md for the verified interception order). Left sidebar (`ui/components/Sidebar.tsx`, Cmd+B / View menu / on-screen button toggle): markdown siblings of the open file (new `list_markdown_files` command) plus persistent recents (new `RecentsStore` in `src-tauri/src/recents.rs`, JSON at `app_config_dir()/recents.json`, recorded in `read_file`/`write_new_file`, broadcast `recents-changed` with the pruned list as payload). Sidebar clicks open in place with a Save / Don't Save / Cancel prompt (shared `ui/utils/unsavedChanges.ts`); a file already open elsewhere focuses that window (`focus_existing_window` → shared `focus_window_for_path`).
- **Notes**: Fixed three latent bugs along the way: (1) `watch_file` never updated `WindowState.file_path`, so in-place opens broke `find_by_path` dedupe and `find_blank`; (2) `useWindowClose` destroyed the window even when the save it awaited was cancelled/failed (data loss) — save handlers now return booleans; (3) window-targeted events were broadcast to every window (see bugs.md 2026-08-11). Follow-ups deliberately out of scope: directory watcher for live folder refresh (v1 refetches on path change/window focus), Open Recent submenu, sidebar visibility/width persistence, drag-drop. Deferred from the polish review (real but architectural): consolidate the open flow into one atomic `open_document` command — today "open in window" is assembled from focus_existing_window + read_file + watch_file, so a failed read with a successful watch can leave the path→window mapping claiming a file the window doesn't show, and recents treat every `read_file` (including reload-after-external-change) as a user open; also a single frontend shortcut registry shared by useKeyboardShortcuts/useMenuEvents with a parity check against menu.rs accelerator strings.

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
