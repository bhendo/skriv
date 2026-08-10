import createPanZoom, { type PanZoom } from "panzoom";

// Intentionally defines its own Transform/Dimensions interfaces rather than
// importing panzoom's Transform — keeps overlay.ts decoupled from panzoom
// for testability. Structurally compatible via TypeScript's structural typing.
export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export function computeDiagramCenter(
  transform: Transform,
  container: Dimensions
): { x: number; y: number } {
  return {
    x: (container.width / 2 - transform.x) / transform.scale,
    y: (container.height / 2 - transform.y) / transform.scale,
  };
}

export function computeTransformForContainer(
  diagramCenter: { x: number; y: number },
  container: Dimensions,
  scale: number
): Transform {
  return {
    x: container.width / 2 - diagramCenter.x * scale,
    y: container.height / 2 - diagramCenter.y * scale,
    scale,
  };
}

export function computeFitToView(
  svgDimensions: Dimensions,
  containerDimensions: Dimensions
): Transform {
  const scale = Math.min(
    containerDimensions.width / svgDimensions.width,
    containerDimensions.height / svgDimensions.height,
    1
  );
  return {
    x: (containerDimensions.width - svgDimensions.width * scale) / 2,
    y: (containerDimensions.height - svgDimensions.height * scale) / 2,
    scale,
  };
}

export interface OverlayOptions {
  svgHtml: string;
  initialTransform: Transform;
  inlineContainerDimensions: Dimensions;
  /** Called when the overlay is closed by user interaction (Esc, close button,
   *  backdrop click). NOT called when closed programmatically due to content
   *  change — use closeWithoutCallback() for that case. */
  onClose?: (finalTransform: Transform, overlayDimensions: Dimensions) => void;
}

export interface OverlayHandle {
  /** Close overlay AND fire onClose callback (user-initiated close). */
  close: () => void;
  /** Close overlay WITHOUT firing onClose (content-change close). */
  closeWithoutCallback: () => void;
  getTransform: () => Transform;
}

const PANZOOM_OPTS = { maxZoom: 5, minZoom: 0.2, smoothScroll: false };

/** Create panzoom and set exact transform. Constructor options can't be used
 *  for this — they internally call zoomAbs which produces wrong x/y values
 *  for non-zero offsets on DOM elements. */
export function createPanZoomWithTransform(
  element: HTMLElement,
  target: Transform,
  extraOpts?: Record<string, unknown>
): PanZoom {
  const pz = createPanZoom(element, { ...PANZOOM_OPTS, ...extraOpts });
  pz.zoomAbs(0, 0, target.scale);
  pz.moveTo(target.x, target.y);
  return pz;
}

let activeOverlay: OverlayHandle | null = null;

export function openOverlay(options: OverlayOptions): OverlayHandle {
  if (activeOverlay) {
    activeOverlay.closeWithoutCallback();
  }

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "mermaid-overlay-backdrop";

  const overlay = document.createElement("div");
  overlay.className = "mermaid-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Expanded mermaid diagram");
  backdrop.appendChild(overlay);

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-overlay-toolbar";
  overlay.appendChild(toolbar);

  const content = document.createElement("div");
  content.className = "mermaid-overlay-content";
  overlay.appendChild(content);

  const wrapper = document.createElement("div");
  wrapper.className = "mermaid-overlay-wrapper";
  wrapper.style.transformOrigin = "0 0";
  wrapper.innerHTML = options.svgHtml;
  content.appendChild(wrapper);

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("visible"));

  // Measure SVG natural dimensions after appending to DOM (getBoundingClientRect
  // returns 0 for elements not in the DOM tree).
  const svgEl = wrapper.querySelector("svg");
  const svgRect = svgEl?.getBoundingClientRect();
  const svgNaturalWidth = svgRect?.width ?? 0;
  const svgNaturalHeight = svgRect?.height ?? 0;

  // Compute synced transform and initialize panzoom
  const diagramCenter = computeDiagramCenter(
    options.initialTransform,
    options.inlineContainerDimensions
  );
  const overlayTransform = computeTransformForContainer(
    diagramCenter,
    { width: content.clientWidth, height: content.clientHeight },
    options.initialTransform.scale
  );

  let pzInstance: PanZoom | null = createPanZoomWithTransform(wrapper, overlayTransform);

  function fitToView(): void {
    if (!pzInstance) return;
    const currentDims = { width: content.clientWidth, height: content.clientHeight };
    const fitTransform = computeFitToView(
      { width: svgNaturalWidth, height: svgNaturalHeight },
      currentDims
    );
    pzInstance.zoomAbs(0, 0, fitTransform.scale);
    pzInstance.moveTo(fitTransform.x, fitTransform.y);
  }

  function zoomIn(): void {
    if (!pzInstance) return;
    pzInstance.zoomTo(content.clientWidth / 2, content.clientHeight / 2, 1.5);
  }

  function zoomOut(): void {
    if (!pzInstance) return;
    pzInstance.zoomTo(content.clientWidth / 2, content.clientHeight / 2, 0.67);
  }

  function teardown(): void {
    if (pzInstance) {
      pzInstance.dispose();
      pzInstance = null;
    }
    document.removeEventListener("keydown", onKeyDown);
    document.body.style.overflow = previousOverflow;
    backdrop.remove();
    activeOverlay = null;
  }

  function getTransform(): Transform {
    if (pzInstance) return pzInstance.getTransform();
    return options.initialTransform;
  }

  function close(): void {
    const finalTransform = getTransform();
    const currentDims = { width: content.clientWidth, height: content.clientHeight };
    options.onClose?.(finalTransform, currentDims);
    teardown();
  }

  function closeWithoutCallback(): void {
    teardown();
  }

  function makeButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", onClick);
    return btn;
  }

  toolbar.appendChild(makeButton("⊞", "Fit to view", fitToView));
  toolbar.appendChild(makeButton("+", "Zoom in", zoomIn));
  toolbar.appendChild(makeButton("−", "Zoom out", zoomOut));
  toolbar.appendChild(makeButton("✕", "Close", close));

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (isEditableTarget(e.target)) return;
    if (e.key === "0") {
      fitToView();
    } else if (e.key === "+" || e.key === "=") {
      zoomIn();
    } else if (e.key === "-") {
      zoomOut();
    }
  }

  document.addEventListener("keydown", onKeyDown);

  overlay.setAttribute("tabindex", "-1");
  overlay.focus();

  const handle: OverlayHandle = { close, closeWithoutCallback, getTransform };
  activeOverlay = handle;
  return handle;
}
