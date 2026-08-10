import mermaid from "mermaid";
import {
  ensureMermaidInit,
  fixViewBox,
  nextDiagramId,
  registerThemeRerender,
  unregisterThemeRerender,
  getCachedSvg,
  cacheSvg,
} from "./renderer";
import {
  openOverlay,
  computeDiagramCenter,
  computeTransformForContainer,
  computeFitToView,
  createPanZoomWithTransform,
} from "./overlay";
import type { OverlayHandle, Transform } from "./overlay";

export interface MermaidSurface {
  /** Root element (.mermaid-block) — append to the host editor. */
  dom: HTMLElement;
  /** The diagram container; exposed for host hit-testing (e.g. wheel events). */
  svgContainer: HTMLElement;
  /** Render a diagram source. Keeps the previous SVG when the source errors. */
  render(source: string): Promise<void>;
  /** Hide the diagram (host is showing a source editor in its place). */
  hide(): void;
  show(): void;
  /** Close the expand overlay without firing its restore callback. */
  closeOverlay(): void;
  dispose(): void;
}

export interface MermaidSurfaceOptions {
  /**
   * Called when the user clicks the diagram (outside the toolbar) to start
   * editing. Hosts decide what "editing" means: the Milkdown NodeView swaps
   * in an embedded editor; the live-preview widget moves the cursor into
   * the fence so the fold extension reveals the source.
   */
  onActivate: () => void;
}

/**
 * The editor-agnostic mermaid diagram surface: rendered SVG with pan/zoom,
 * an inline fit/zoom/expand toolbar, the expand overlay round-trip, error
 * fallback to the last good render, and theme-change re-rendering.
 */
export function createMermaidSurface(opts: MermaidSurfaceOptions): MermaidSurface {
  ensureMermaidInit();

  const dom = document.createElement("div");
  dom.className = "mermaid-block";

  const svgContainer = document.createElement("div");
  svgContainer.className = "mermaid-svg-container";
  dom.appendChild(svgContainer);

  // Inner wrapper for panzoom — panzoom transforms this element
  const svgWrapper = document.createElement("div");
  svgWrapper.className = "mermaid-svg-wrapper";
  svgContainer.appendChild(svgWrapper);

  const inlineToolbar = document.createElement("div");
  inlineToolbar.className = "mermaid-inline-toolbar";

  function makeInlineButton(text: string, label: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.setAttribute("aria-label", label);
    return btn;
  }

  const fitBtn = makeInlineButton("⊞", "Fit to view");
  const zoomInBtn = makeInlineButton("+", "Zoom in");
  const zoomOutBtn = makeInlineButton("−", "Zoom out");
  const expandBtn = makeInlineButton("⤢", "Expand diagram");

  inlineToolbar.append(fitBtn, zoomInBtn, zoomOutBtn, expandBtn);
  svgContainer.appendChild(inlineToolbar);

  let pzInstance: ReturnType<typeof createPanZoomWithTransform> | null = null;
  let overlayHandle: OverlayHandle | null = null;
  let lastSvg = "";
  let lastRenderedContent = "";
  let disposed = false;

  function disposePanZoom(): void {
    if (pzInstance) {
      pzInstance.dispose();
      pzInstance = null;
    }
  }

  function attachPanZoom(overrideTransform?: Transform): void {
    disposePanZoom();
    // Clear stale CSS transform left by the previous panzoom instance so
    // getBoundingClientRect returns the SVG's natural dimensions.
    svgWrapper.style.transform = "";
    const svgEl = svgWrapper.querySelector("svg");
    if (!svgEl) return;

    const containerWidth = svgContainer.clientWidth;
    const svgRect = svgEl.getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    if (svgWidth === 0 || svgHeight === 0) return;

    const scale = overrideTransform?.scale ?? Math.min(containerWidth / svgWidth, 1);

    // Size container height to fit the scaled diagram (capped at 80vh)
    const fittedHeight = svgHeight * scale + 32;
    const maxHeight = window.innerHeight * 0.8;
    const containerH = Math.min(fittedHeight, maxHeight);
    svgContainer.style.height = `${containerH}px`;

    const offsetX = overrideTransform?.x ?? (containerWidth - svgWidth * scale) / 2;
    const offsetY = overrideTransform?.y ?? (containerH - svgHeight * scale) / 2;

    pzInstance = createPanZoomWithTransform(
      svgWrapper,
      { x: offsetX, y: offsetY, scale },
      {
        onClick: (e: Event) => {
          if (overlayHandle) return;
          if (e.target instanceof globalThis.Node && inlineToolbar.contains(e.target)) return;
          opts.onActivate();
        },
      }
    );
  }

  // The widget may not be attached/laid out yet when a render resolves
  // (CodeMirror mounts widget DOM after toDOM returns); retry once.
  function attachPanZoomWhenSized(overrideTransform?: Transform): void {
    if (svgContainer.clientWidth > 0) {
      attachPanZoom(overrideTransform);
      return;
    }
    requestAnimationFrame(() => {
      if (!disposed && svgContainer.clientWidth > 0) attachPanZoom(overrideTransform);
    });
  }

  fitBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!pzInstance) return;
    const svgEl = svgWrapper.querySelector("svg");
    if (!svgEl) return;
    const svgRect = svgEl.getBoundingClientRect();
    const t = pzInstance.getTransform();
    const naturalW = svgRect.width / t.scale;
    const naturalH = svgRect.height / t.scale;
    const fit = computeFitToView(
      { width: naturalW, height: naturalH },
      { width: svgContainer.clientWidth, height: svgContainer.clientHeight }
    );
    pzInstance.zoomAbs(0, 0, fit.scale);
    pzInstance.moveTo(fit.x, fit.y);
  });

  zoomInBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!pzInstance) return;
    pzInstance.zoomTo(svgContainer.clientWidth / 2, svgContainer.clientHeight / 2, 1.5);
  });

  zoomOutBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!pzInstance) return;
    pzInstance.zoomTo(svgContainer.clientWidth / 2, svgContainer.clientHeight / 2, 0.67);
  });

  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (!pzInstance || !lastSvg) return;

    const transform = pzInstance.getTransform();
    const inlineDims = {
      width: svgContainer.clientWidth,
      height: svgContainer.clientHeight,
    };

    overlayHandle = openOverlay({
      svgHtml: lastSvg,
      initialTransform: transform,
      inlineContainerDimensions: inlineDims,
      onClose: (overlayTransform, overlayDims) => {
        // Preserve the diagram center point from the overlay, but use the
        // inline's default scale (fit-to-width). Using the overlay's scale
        // would produce jarring height/zoom changes since the inline
        // container is much smaller than the overlay.
        const svgEl = svgWrapper.querySelector("svg");
        if (!svgEl) {
          attachPanZoom();
          overlayHandle = null;
          return;
        }
        const svgRect = svgEl.getBoundingClientRect();
        const currentScale = pzInstance?.getTransform().scale ?? 1;
        const naturalWidth = svgRect.width / currentScale;
        const inlineScale = Math.min(svgContainer.clientWidth / naturalWidth, 1);

        const center = computeDiagramCenter(overlayTransform, overlayDims);
        const inlineTransform = computeTransformForContainer(
          center,
          { width: svgContainer.clientWidth, height: svgContainer.clientHeight },
          inlineScale
        );
        attachPanZoom(inlineTransform);
        overlayHandle = null;
      },
    });
  });

  // Empty/error states have no panzoom; handle click directly.
  svgContainer.addEventListener("click", () => {
    if (pzInstance) return;
    opts.onActivate();
  });

  async function render(source: string): Promise<void> {
    if (disposed || source === lastRenderedContent) return;
    disposePanZoom();
    lastRenderedContent = source;

    if (!source.trim()) {
      svgWrapper.innerHTML = '<div class="mermaid-placeholder">Empty mermaid diagram</div>';
      return;
    }

    const cached = getCachedSvg(source);
    if (cached) {
      svgWrapper.innerHTML = cached;
      lastSvg = cached;
      attachPanZoomWhenSized();
      return;
    }

    const id = nextDiagramId();
    try {
      const { svg } = await mermaid.render(id, source);
      if (disposed || lastRenderedContent !== source) return; // superseded
      svgWrapper.innerHTML = svg;
      const svgEl = svgWrapper.querySelector("svg");
      if (svgEl) fixViewBox(svgEl);
      lastSvg = svgWrapper.innerHTML;
      cacheSvg(source, lastSvg);
      attachPanZoomWhenSized();
    } catch (err: unknown) {
      // mermaid leaves its temp render container in <body> when a diagram
      // fails to parse; remove it or invalid diagrams accumulate DOM forever
      document.getElementById(`d${id}`)?.remove();
      if (disposed) return;
      if (lastSvg) {
        svgWrapper.innerHTML = lastSvg;
        attachPanZoomWhenSized();
      } else {
        const msg = err instanceof Error ? err.message : "Invalid mermaid syntax";
        const errorDiv = document.createElement("div");
        errorDiv.className = "mermaid-error";
        errorDiv.textContent = msg;
        svgWrapper.replaceChildren(errorDiv);
      }
    }
  }

  const rerender = () => {
    if (svgContainer.style.display === "none") return; // host is editing
    const source = lastRenderedContent;
    lastRenderedContent = "";
    void render(source);
  };
  registerThemeRerender(rerender);

  return {
    dom,
    svgContainer,
    render,
    hide() {
      disposePanZoom();
      svgContainer.style.display = "none";
    },
    show() {
      svgContainer.style.display = "";
      // hide() disposed panzoom; if the SVG is unchanged render() will
      // skip, so reattach here.
      if (!pzInstance && svgWrapper.querySelector("svg")) attachPanZoomWhenSized();
    },
    closeOverlay() {
      if (overlayHandle) {
        overlayHandle.closeWithoutCallback();
        overlayHandle = null;
      }
    },
    dispose() {
      disposed = true;
      if (overlayHandle) {
        overlayHandle.closeWithoutCallback();
        overlayHandle = null;
      }
      disposePanZoom();
      unregisterThemeRerender(rerender);
    },
  };
}
