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

  afterEach(cleanup);

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
});
