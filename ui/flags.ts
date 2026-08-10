/**
 * Feature flags for experimental functionality.
 *
 * Live preview (#68): CodeMirror 6 + ProseMark editor core spike.
 * Enable with `VITE_LIVE_PREVIEW=1 make dev` or, at runtime,
 * `localStorage.setItem("skriv:live-preview", "1")` and reload.
 */
export function isLivePreviewEnabled(): boolean {
  if (import.meta.env.VITE_LIVE_PREVIEW === "1") return true;
  try {
    return window.localStorage.getItem("skriv:live-preview") === "1";
  } catch {
    return false;
  }
}
