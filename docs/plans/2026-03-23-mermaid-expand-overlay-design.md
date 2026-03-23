# Mermaid Diagram Expand Overlay

## Problem

Mermaid diagrams in Skriv render inside an inline container capped at 80vh. For large diagrams (complex flowcharts, state machines, etc.), this viewport is too small — users must constantly pan and zoom to navigate, which is a chore. The fixed-width document column further constrains the available space.

## Solution

A fullscreen overlay that expands the diagram to ~95% of the viewport, with zoom controls and panzoom transform sync between inline and expanded views.

## Architecture: Portal Overlay (Vanilla DOM)

The mermaid NodeView is 100% vanilla DOM (no React). The overlay follows the same pattern: a `<div>` appended directly to `<body>`, containing a cloned SVG and a fresh panzoom instance. This avoids CSS stacking context conflicts with ProseMirror and keeps the implementation consistent with the existing NodeView architecture.

### DOM Structure

```
body
  └── div.mermaid-overlay-backdrop     (fixed, full viewport, semi-transparent)
        └── div.mermaid-overlay          (95vw × 95vh, centered)
              ├── div.mermaid-overlay-toolbar  (top-right: close, fit, zoom)
              └── div.mermaid-overlay-content  (cloned SVG + panzoom)
```

### File Structure

The overlay logic lives in a separate module `ui/plugins/mermaid-block/overlay.ts` with a clean interface:

```ts
interface OverlayOptions {
  svgHtml: string;
  initialTransform: { x: number; y: number; scale: number };
  inlineContainerDimensions: { width: number; height: number };
}

function openOverlay(options: OverlayOptions): {
  close: () => void;
  getTransform: () => { x: number; y: number; scale: number };
}
```

The NodeView in `view.ts` calls `openOverlay()` from the expand button click handler (inside the closure, where `pzInstance` is accessible). On close, the returned `getTransform()` provides the overlay's final transform for syncing back.

### Entry

- An expand button (⤢) appears in the top-right corner of `.mermaid-svg-container` on hover
- Button is `position: absolute; top: 8px; right: 8px`, opacity 0 by default, fades in on hover
- Hidden when editing (CodeMirror is active), but **visible in read-only mode** (`view.editable === false`) — expanding is primarily a reading affordance
- The expand button click handler must call `event.stopPropagation()` to prevent panzoom's `onClick` from triggering `enterEditing()`
- On click: the handler (inside the NodeView closure) reads `pzInstance.getTransform()`, then calls `openOverlay()` with the SVG HTML, transform snapshot, and container dimensions

### Exit

- Close button (✕) in the toolbar
- Esc key
- Clicking the backdrop (outside the overlay content area)
- On close: read overlay transform via the returned `getTransform()`, destroy and recreate the inline panzoom (via existing `attachPanZoom()` pattern) with the synced transform as `initialX`/`initialY`/`initialZoom` constructor options. Remove overlay DOM.
- If the underlying ProseMirror node content changes while the overlay is open (external edit, file reload), close the overlay automatically

## Panzoom Transform Sync

The inline and overlay views share the same diagram but render in differently-sized containers. To preserve the user's viewport position:

**Assumption:** The transform sync math assumes `transform-origin: 0 0` on the panzoom wrapper (set in `skriv.css` on `.mermaid-svg-wrapper`). The overlay content wrapper must use the same transform origin.

### On expand (inline → overlay)

1. Read inline panzoom transform via `getTransform()` → `{x, y, scale}`
2. Compute the diagram point at the center of the inline viewport:
   ```
   diagramCenterX = (inlineWidth/2 - x) / scale
   diagramCenterY = (inlineHeight/2 - y) / scale
   ```
3. Set exact transform on the overlay panzoom instance using `zoomAbs(0, 0, scale)` + `moveTo(x, y)`:
   ```
   x = overlayWidth/2 - diagramCenterX * scale
   y = overlayHeight/2 - diagramCenterY * scale
   ```
   **Important:** Do NOT use panzoom constructor options (`initialX`/`initialY`/`initialZoom`) — they internally call `zoomAbs(initialX, initialY, initialZoom)` which zooms *around* that point, producing incorrect x/y for DOM elements. The `zoomAbs(0, 0, scale)` + `moveTo(x, y)` sequence is safe because zooming around the origin doesn't displace x/y.
4. If the inline panzoom is at its default (initial) state, start the overlay with fit-to-view instead

### On collapse (overlay → inline)

Same math in reverse: read overlay transform via `getTransform()`, compute diagram center, then destroy and recreate the inline panzoom with the synced transform using `zoomAbs(0, 0, scale)` + `moveTo(x, y)`.

**Note:** The existing `attachPanZoom()` in `view.ts` takes no parameters and always computes a fresh fit-to-container transform. It will need to be modified to optionally accept transform overrides for the sync-back path. The existing code also uses `initialX`/`initialY`/`initialZoom` constructor options, which is a pre-existing centering bug for small diagrams — fixed as part of this work.

**Note:** Only one overlay may be open at a time. Opening a new overlay while one exists should close the existing one first.

**Note:** Overlay dimensions for the transform math (`overlayWidth`, `overlayHeight`) are measured from the rendered `.mermaid-overlay-content` element after mount via `clientWidth`/`clientHeight`, not calculated from `95vw`/`95vh`.

**Note:** The inline fit-to-view uses width-only fitting (`Math.min(containerWidth / svgWidth, 1)`) because the inline container's height is dynamic. The overlay fit-to-view uses both dimensions because the overlay has a fixed size. This difference is intentional.

## Toolbar & Zoom Controls

Floating toolbar positioned absolute, top-right of the overlay content area.

| Button | Icon | Action |
|--------|------|--------|
| Fit to view | ⊞ | Reset panzoom to fit diagram within overlay, centered |
| Zoom in | + | Zoom 1.5× around viewport center |
| Zoom out | − | Zoom 0.67× around viewport center |
| Close | ✕ | Dismiss overlay |

### Keyboard shortcuts (active while overlay is open)

| Key | Action |
|-----|--------|
| `Esc` | Close overlay |
| `0` | Fit to view |
| `+` / `=` | Zoom in |
| `-` | Zoom out |

Shortcuts are handled via a global `keydown` listener added when the overlay opens and removed on close. These are unmodified keys (no Cmd/Ctrl) so they don't conflict with browser zoom. `Esc` always closes regardless of focus target. Zoom/fit keys (`0`, `+`, `=`, `-`) skip if `event.target` is an `<input>`, `<textarea>`, or `[contenteditable]` element to avoid intercepting future text inputs.

### Fit-to-view behavior

"Fit to view" calculates the scale to fit the diagram within the overlay without upscaling — `Math.min(overlayWidth / svgWidth, overlayHeight / svgHeight, 1)` — matching the existing `attachPanZoom()` logic. The diagram is centered within the overlay.

## Styling & Theming

All styling reuses existing theme variables (`--crepe-color-*`). No new design language.

- **Backdrop:** `position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999`. Works in both light and dark themes. Apply `overflow: hidden` to `<body>` while overlay is open to prevent background scroll, restore on close.
- **Overlay content area:** `95vw × 95vh`, centered via flexbox on the backdrop. Same `background` and `border` as `.mermaid-svg-container`. `border-radius: 8px`.
- **Toolbar buttons:** Small, semi-transparent background. Consistent with editor aesthetic.
- **Inline expand button:** Same semi-transparent pill style. Fades in on `.mermaid-svg-container:hover` (~150ms transition).
- **Backdrop transition:** `opacity 0→1`, ~150ms. No slide/scale animations — keep it snappy.
- **Accessibility:** `role="dialog"` and `aria-modal="true"` on the overlay. `aria-label` on toolbar buttons. Focus is trapped within the overlay while open. On close, focus returns to the expand button (or the diagram block).

## Testing

### Unit tests (Vitest + jsdom)

- Overlay DOM creation and destruction — appends to body, removes cleanly
- Transform sync math — given inline transform + dimensions, verify correct overlay transform calculation and vice versa
- Keyboard shortcuts — Esc closes, 0 fits, +/- zoom
- Expand button visibility — hidden when CodeMirror editing is active

### E2E tests (Playwright)

- Click expand button → overlay appears with diagram visible
- Close via Esc / close button / backdrop click → overlay removed, inline diagram intact
- Zoom controls functional (fit-to-view, zoom in, zoom out)
- Expand button shows on hover only, hidden in edit mode

### Not tested

- No visual regression tests for overlay styling — manual verification sufficient for a single overlay component

## Future Work (Separate Tickets)

- **Minimap:** Small overview in overlay corner showing current viewport position within the full diagram
- **Editing in overlay:** Access to CodeMirror editor from the expanded view
