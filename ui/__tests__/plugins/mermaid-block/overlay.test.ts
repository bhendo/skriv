import { describe, it, expect } from "vitest";
import {
  computeDiagramCenter,
  computeTransformForContainer,
  computeFitToView,
  openOverlay,
  type Transform,
  type Dimensions,
} from "../../../plugins/mermaid-block/overlay";

describe("computeDiagramCenter", () => {
  it("computes center point of visible area in diagram coordinates", () => {
    const center = computeDiagramCenter({ x: 100, y: 50, scale: 0.5 }, { width: 800, height: 400 });
    expect(center).toEqual({ x: 600, y: 300 });
  });

  it("handles scale of 1 (no zoom)", () => {
    const center = computeDiagramCenter({ x: 0, y: 0, scale: 1 }, { width: 800, height: 400 });
    expect(center).toEqual({ x: 400, y: 200 });
  });
});

describe("computeTransformForContainer", () => {
  it("computes panzoom transform to center a diagram point in a container", () => {
    const transform = computeTransformForContainer(
      { x: 600, y: 300 },
      { width: 1600, height: 900 },
      0.5
    );
    expect(transform).toEqual({ x: 500, y: 300, scale: 0.5 });
  });
});

describe("round-trip transform sync", () => {
  it("inline→overlay→inline preserves diagram center", () => {
    const inlineTransform = { x: 100, y: 50, scale: 0.5 };
    const inlineDims = { width: 800, height: 400 };
    const overlayDims = { width: 1600, height: 900 };

    const center = computeDiagramCenter(inlineTransform, inlineDims);
    const overlayTransform = computeTransformForContainer(
      center,
      overlayDims,
      inlineTransform.scale
    );
    const centerBack = computeDiagramCenter(overlayTransform, overlayDims);
    const inlineBack = computeTransformForContainer(centerBack, inlineDims, inlineTransform.scale);

    expect(inlineBack.x).toBeCloseTo(inlineTransform.x, 10);
    expect(inlineBack.y).toBeCloseTo(inlineTransform.y, 10);
    expect(inlineBack.scale).toBeCloseTo(inlineTransform.scale, 10);
  });
});

describe("computeFitToView", () => {
  it("fits diagram to overlay using both dimensions without upscaling", () => {
    const result = computeFitToView({ width: 3200, height: 1000 }, { width: 1600, height: 900 });
    expect(result.scale).toBeCloseTo(0.5);
    expect(result.x).toBeCloseTo(0);
  });

  it("fits diagram to overlay height when taller than wide", () => {
    const result = computeFitToView({ width: 800, height: 1800 }, { width: 1600, height: 900 });
    expect(result.scale).toBeCloseTo(0.5);
  });

  it("does not upscale small diagrams", () => {
    const result = computeFitToView({ width: 400, height: 200 }, { width: 1600, height: 900 });
    expect(result.scale).toBe(1);
  });
});

describe("openOverlay", () => {
  it("appends overlay backdrop to document.body", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const backdrop = document.querySelector(".mermaid-overlay-backdrop");
    expect(backdrop).not.toBeNull();
    expect(document.body.contains(backdrop)).toBe(true);
    handle.close();
  });

  it("removes overlay from DOM on close", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    handle.close();
    expect(document.querySelector(".mermaid-overlay-backdrop")).toBeNull();
  });

  it("clones SVG into overlay content", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const content = document.querySelector(".mermaid-overlay-content");
    expect(content?.innerHTML).toContain("<svg");
    handle.close();
  });

  it("sets aria attributes for accessibility", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const overlay = document.querySelector(".mermaid-overlay");
    expect(overlay?.getAttribute("role")).toBe("dialog");
    expect(overlay?.getAttribute("aria-modal")).toBe("true");
    handle.close();
  });

  it("sets overflow hidden on body while open", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    expect(document.body.style.overflow).toBe("hidden");
    handle.close();
    expect(document.body.style.overflow).toBe("");
  });

  it("enforces singleton — opening a second closes the first", () => {
    openOverlay({
      svgHtml: '<svg id="first"><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const handle2 = openOverlay({
      svgHtml: '<svg id="second"><rect width="200" height="200"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const backdrops = document.querySelectorAll(".mermaid-overlay-backdrop");
    expect(backdrops.length).toBe(1);
    const content = document.querySelector(".mermaid-overlay-content");
    expect(content?.innerHTML).toContain("second");
    handle2.close();
  });

  it("calls onClose callback with transform and overlay dimensions", () => {
    let closedWith: { transform: Transform; dims: Dimensions } | null = null;
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 10, y: 20, scale: 0.5 },
      inlineContainerDimensions: { width: 800, height: 400 },
      onClose: (finalTransform, overlayDimensions) => {
        closedWith = { transform: finalTransform, dims: overlayDimensions };
      },
    });
    handle.close();
    expect(closedWith).not.toBeNull();
    expect(closedWith!.transform).toHaveProperty("scale");
    expect(closedWith!.dims).toHaveProperty("width");
  });
});

describe("overlay toolbar", () => {
  it("renders close, fit, zoom-in, zoom-out buttons with aria-labels", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const toolbar = document.querySelector(".mermaid-overlay-toolbar");
    const buttons = toolbar?.querySelectorAll("button");
    expect(buttons?.length).toBe(4);
    const labels = Array.from(buttons!).map((b) => b.getAttribute("aria-label"));
    expect(labels).toContain("Fit to view");
    expect(labels).toContain("Zoom in");
    expect(labels).toContain("Zoom out");
    expect(labels).toContain("Close");
    handle.close();
  });

  it("close button removes overlay", () => {
    openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const closeBtn = document.querySelector(
      '.mermaid-overlay-toolbar button[aria-label="Close"]'
    ) as HTMLButtonElement;
    closeBtn.click();
    expect(document.querySelector(".mermaid-overlay-backdrop")).toBeNull();
  });
});

describe("overlay keyboard shortcuts", () => {
  it("Esc closes overlay", () => {
    openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".mermaid-overlay-backdrop")).toBeNull();
  });

  it("keyboard listener is removed after close", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    handle.close();
    const handle2 = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".mermaid-overlay-backdrop")).toBeNull();
    handle2.close();
  });

  it("Esc works even when target is an input element", () => {
    openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".mermaid-overlay-backdrop")).toBeNull();
    input.remove();
  });

  it("zoom keys skip when target is an input element", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true }));
    expect(document.querySelector(".mermaid-overlay-backdrop")).not.toBeNull();
    input.remove();
    handle.close();
  });
});

describe("overlay focus management", () => {
  it("focuses the overlay on open", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const overlay = document.querySelector(".mermaid-overlay");
    expect(document.activeElement).toBe(overlay);
    handle.close();
  });
});

describe("overlay backdrop click", () => {
  it("clicking backdrop closes overlay", () => {
    openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const backdrop = document.querySelector(".mermaid-overlay-backdrop") as HTMLElement;
    backdrop.click();
    expect(document.querySelector(".mermaid-overlay-backdrop")).toBeNull();
  });

  it("clicking overlay content does NOT close", () => {
    const handle = openOverlay({
      svgHtml: '<svg><rect width="100" height="100"/></svg>',
      initialTransform: { x: 0, y: 0, scale: 1 },
      inlineContainerDimensions: { width: 800, height: 400 },
    });
    const overlay = document.querySelector(".mermaid-overlay") as HTMLElement;
    overlay.click();
    expect(document.querySelector(".mermaid-overlay-backdrop")).not.toBeNull();
    handle.close();
  });
});
