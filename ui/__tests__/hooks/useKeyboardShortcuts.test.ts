import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    })
  );
}

describe("useKeyboardShortcuts", () => {
  const handlers = { onSave: vi.fn(), onSaveAs: vi.fn(), onOpen: vi.fn() };

  beforeEach(() => {
    handlers.onSave.mockClear();
    handlers.onSaveAs.mockClear();
    handlers.onOpen.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Cmd+S fires onSave", () => {
    renderHook(() => useKeyboardShortcuts(handlers));

    fireKey("s", { metaKey: true });

    expect(handlers.onSave).toHaveBeenCalledOnce();
    expect(handlers.onSaveAs).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+S fires onSaveAs", () => {
    renderHook(() => useKeyboardShortcuts(handlers));

    fireKey("s", { metaKey: true, shiftKey: true });

    expect(handlers.onSaveAs).toHaveBeenCalledOnce();
    expect(handlers.onSave).not.toHaveBeenCalled();
  });

  it("Cmd+O fires onOpen", () => {
    renderHook(() => useKeyboardShortcuts(handlers));

    fireKey("o", { metaKey: true });

    expect(handlers.onOpen).toHaveBeenCalledOnce();
  });

  it("Cmd+M fires onToggleSourceMode", () => {
    const onToggleSourceMode = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onToggleSourceMode }));

    fireKey("m", { metaKey: true });

    expect(onToggleSourceMode).toHaveBeenCalledOnce();
  });

  it("Cmd+M does nothing when handler not provided", () => {
    renderHook(() => useKeyboardShortcuts(handlers));

    // Should not throw
    fireKey("m", { metaKey: true });
  });

  it("Cmd+Alt+F fires onReplace", () => {
    const onReplace = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onReplace }));

    // Alt turns the key into "ƒ" on mac hardware; the hook matches on code
    fireKey("ƒ", { metaKey: true, altKey: true, code: "KeyF" });

    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("Ctrl+H fires onReplace on non-mac platforms", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    );
    const onReplace = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onReplace }));

    fireKey("h", { ctrlKey: true });

    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("Cmd+H is left to macOS Hide", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    );
    const onReplace = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onReplace }));

    fireKey("h", { metaKey: true });

    expect(onReplace).not.toHaveBeenCalled();
  });

  it("Cmd+G fires onFindNext, Cmd+Shift+G fires onFindPrev", () => {
    const onFindNext = vi.fn();
    const onFindPrev = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onFindNext, onFindPrev }));

    fireKey("g", { metaKey: true });
    expect(onFindNext).toHaveBeenCalledOnce();
    expect(onFindPrev).not.toHaveBeenCalled();

    fireKey("G", { metaKey: true, shiftKey: true });
    expect(onFindPrev).toHaveBeenCalledOnce();
    expect(onFindNext).toHaveBeenCalledOnce();
  });

  it("Cmd+B fires onToggleSidebar", () => {
    const onToggleSidebar = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onToggleSidebar }));

    fireKey("b", { metaKey: true });

    expect(onToggleSidebar).toHaveBeenCalledOnce();
    expect(handlers.onSave).not.toHaveBeenCalled();
  });

  it("Cmd+B does nothing when handler not provided", () => {
    renderHook(() => useKeyboardShortcuts(handlers));

    // Should not throw
    fireKey("b", { metaKey: true });
  });

  it("Cmd+Shift+L fires onToggleOutline", () => {
    const onToggleOutline = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onToggleOutline }));

    fireKey("l", { metaKey: true, shiftKey: true });

    expect(onToggleOutline).toHaveBeenCalledOnce();
  });

  it("Cmd+Shift+L fires onToggleOutline when key reports uppercase", () => {
    const onToggleOutline = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onToggleOutline }));

    fireKey("L", { metaKey: true, shiftKey: true });

    expect(onToggleOutline).toHaveBeenCalledOnce();
  });

  it("Cmd+L without Shift does nothing", () => {
    const onToggleOutline = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...handlers, onToggleOutline }));

    fireKey("l", { metaKey: true });

    expect(onToggleOutline).not.toHaveBeenCalled();
  });
});
