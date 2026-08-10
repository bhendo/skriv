import mermaid from "mermaid";
import { buildMermaidThemeConfig } from "./theme";

/**
 * Editor-agnostic mermaid rendering core: initialization, theme re-render
 * registry, diagram ids, SVG cache, and viewBox correction.
 */

let mermaidIdCounter = 0;
export function nextDiagramId(): string {
  return `mermaid-diagram-${++mermaidIdCounter}`;
}

let mermaidInitialized = false;

/** Registry of active view re-render callbacks for theme changes. */
const activeViews = new Set<() => void>();

export function registerThemeRerender(cb: () => void): void {
  activeViews.add(cb);
}

export function unregisterThemeRerender(cb: () => void): void {
  activeViews.delete(cb);
}

export function ensureMermaidInit(): void {
  if (mermaidInitialized) return;
  const config = buildMermaidThemeConfig();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: true,
    theme: config.theme,
    themeVariables: config.themeVariables,
    // Render at natural size so panzoom handles scaling (not mermaid).
    flowchart: {
      useMaxWidth: false,
      padding: 20,
      nodeSpacing: 120,
      rankSpacing: 160,
      wrappingWidth: 180,
    },
    sequence: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false, padding: 15 },
    er: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    pie: { useMaxWidth: false },
  });
  mermaidInitialized = true;
}

/**
 * Rendered-SVG cache keyed by diagram source (post viewBox correction).
 * Bounded; cleared on theme re-init since colors are baked into the SVG.
 */
const svgCache = new Map<string, string>();
const SVG_CACHE_MAX = 30;

export function getCachedSvg(source: string): string | undefined {
  return svgCache.get(source);
}

export function cacheSvg(source: string, svg: string): void {
  if (svgCache.size >= SVG_CACHE_MAX) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
  svgCache.set(source, svg);
}

/** Re-initialize mermaid with fresh theme variables and re-render all diagrams. */
export function reinitMermaid(): void {
  mermaidInitialized = false;
  svgCache.clear();
  ensureMermaidInit();
  for (const rerender of activeViews) {
    rerender();
  }
}

/**
 * Re-render diagrams when the system light/dark preference flips — mermaid
 * bakes colors into its SVGs, so CSS variables alone can't retheme them.
 * Called once at app startup.
 */
export function watchSystemThemeForMermaid(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => reinitMermaid();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/**
 * Mermaid sometimes calculates a viewBox that doesn't encompass all
 * rendered content (especially with subgraphs). Measure the actual
 * bounding box of all SVG content and expand the viewBox if needed.
 */
export function fixViewBox(svgEl: SVGSVGElement): void {
  const bbox = svgEl.getBBox();
  const padding = 20;
  const x = bbox.x - padding;
  const y = bbox.y - padding;
  const w = bbox.width + padding * 2;
  const h = bbox.height + padding * 2;
  svgEl.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
}
