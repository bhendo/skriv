# Mermaid Diagram Support

**Issue:** #41
**Date:** 2026-03-22

## Summary

Render mermaid fenced code blocks as visual diagrams in WYSIWYG mode. Clicking a diagram enters source editing mode; blurring re-renders.

## Node Schema

A new `mermaid_block` ProseMirror node defined via Milkdown's `$node()`:

- **Content:** `text*` (raw mermaid source text)
- **Group:** `block`
- **Code:** `true` (preserves whitespace, disables marks)
- **Attrs:** `{ language: { default: "mermaid" } }`
- **parseMarkdown:** matches remark `code` nodes where `lang === "mermaid"`, intercepts before the default `code_block` handler
- **toMarkdown:** serializes back to a standard `` ```mermaid `` fenced code block

Markdown round-trip is lossless — the file always contains standard fenced code.

## NodeView (Rendering & Editing)

The `mermaid_block` gets a custom NodeView with two visual states:

**Rendered state (default / blurred):**
- Calls `mermaid.render()` with the node's text content to produce SVG
- Displays the SVG in a container div
- Clicking the SVG transitions to editing state

**Editing state (focused):**
- Shows a CodeMirror instance (or textarea) with raw mermaid source
- On blur: re-renders the SVG and transitions back to rendered state
- On blur: syncs the edited text back to the ProseMirror node via `tr.replaceWith()`

The NodeView manages its own DOM (no `contentDOM`), similar to Crepe's CodeMirrorBlock.

## Theme Integration

Uses mermaid's `themeVariables` API with the `base` theme to map from existing `--crepe-color-*` CSS variables:

```ts
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    primaryColor: getComputedStyle(root).getPropertyValue('--crepe-color-primary'),
    primaryTextColor: '...',
    lineColor: '...',
    // mapped from --crepe-color-* vars
  }
});
```

Diagrams use the exact same palette as the editor in both light and dark mode. On system theme switch (detected via `prefers-color-scheme` media query change), mermaid is re-initialized and visible diagrams re-render.

## Error Handling

- Show last successfully rendered SVG if available when source becomes invalid
- If no previous render exists, show inline error message (mermaid provides parse error details)
- Errors are contained to individual blocks — never crash the editor

## File Structure

New plugin in `ui/plugins/mermaid-block/`:
- `node.ts` — `$node()` definition with parseMarkdown/toMarkdown
- `view.ts` — NodeView constructor (render/edit toggle, mermaid rendering)
- `index.ts` — re-exports for registration in Editor.tsx

New dependency: `mermaid` npm package.
