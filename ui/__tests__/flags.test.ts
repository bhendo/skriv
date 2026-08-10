import { describe, it, expect, afterEach, vi } from "vitest";
import { isLivePreviewEnabled } from "../flags";

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("isLivePreviewEnabled", () => {
  it("returns false by default", () => {
    expect(isLivePreviewEnabled()).toBe(false);
  });

  it("returns true when the localStorage flag is set", () => {
    window.localStorage.setItem("skriv:live-preview", "1");
    expect(isLivePreviewEnabled()).toBe(true);
  });

  it("returns true when VITE_LIVE_PREVIEW=1", () => {
    vi.stubEnv("VITE_LIVE_PREVIEW", "1");
    expect(isLivePreviewEnabled()).toBe(true);
  });
});
