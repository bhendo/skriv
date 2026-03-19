import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

let mediaChangeHandler: ((e: { matches: boolean }) => void) | null = null;
const addEventListenerSpy = vi.fn((_: string, handler: (e: { matches: boolean }) => void) => {
  mediaChangeHandler = handler;
});
const removeEventListenerSpy = vi.fn();

function mockMatchMedia(darkMode: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
      matches: darkMode,
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
    })),
  });
}

vi.mock("@milkdown/crepe/theme/classic.css?inline", () => ({
  default: ".milkdown { --color: white; }",
}));
vi.mock("@milkdown/crepe/theme/classic-dark.css?inline", () => ({
  default: ".milkdown { --color: black; }",
}));

describe("useTheme", () => {
  beforeEach(() => {
    mediaChangeHandler = null;
    addEventListenerSpy.mockClear();
    removeEventListenerSpy.mockClear();
    document.getElementById("crepe-theme")?.remove();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns classic theme when system prefers light", async () => {
    mockMatchMedia(false);
    const { useTheme } = await import("../../hooks/useTheme");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("classic");
  });

  it("returns classic-dark theme when system prefers dark", async () => {
    mockMatchMedia(true);
    const { useTheme } = await import("../../hooks/useTheme");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("classic-dark");
  });

  it("updates theme when system preference changes", async () => {
    mockMatchMedia(false);
    const { useTheme } = await import("../../hooks/useTheme");

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("classic");

    act(() => {
      mediaChangeHandler?.({ matches: true });
    });

    expect(result.current.theme).toBe("classic-dark");
  });

  it("injects style element into document head", async () => {
    mockMatchMedia(false);
    const { useTheme } = await import("../../hooks/useTheme");

    renderHook(() => useTheme());

    await vi.waitFor(() => {
      expect(document.getElementById("crepe-theme")).not.toBeNull();
    });

    const el = document.getElementById("crepe-theme")!;
    expect(el.textContent).toContain("--color: white");
  });
});
