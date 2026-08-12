import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { type ShortcutId } from "../../utils/shortcuts";
import { MAC_UA, WINDOWS_UA, makeShortcutHandlers, stubPlatform } from "../mocks/shortcuts";

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

type Handlers = ReturnType<typeof makeShortcutHandlers>;

/** Assert that exactly the named handler fired (or none, for null). */
function expectOnly(handlers: Handlers, id: ShortcutId | null) {
  for (const [name, fn] of Object.entries(handlers)) {
    if (name === id) {
      expect(fn, `${name} should have fired`).toHaveBeenCalledOnce();
    } else {
      expect(fn, `${name} should not have fired`).not.toHaveBeenCalled();
    }
  }
}

function renderShortcuts() {
  const handlers = makeShortcutHandlers();
  renderHook(() => useKeyboardShortcuts(handlers));
  return handlers;
}

describe("useKeyboardShortcuts", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does nothing without the primary modifier", () => {
    const handlers = renderShortcuts();

    fireKey("s");

    expectOnly(handlers, null);
  });

  it("Cmd+S fires save", () => {
    const handlers = renderShortcuts();

    fireKey("s", { metaKey: true });

    expectOnly(handlers, "save");
  });

  it("Cmd+Shift+S fires save-as", () => {
    const handlers = renderShortcuts();

    fireKey("s", { metaKey: true, shiftKey: true });

    expectOnly(handlers, "save-as");
  });

  it("Cmd+O fires open", () => {
    const handlers = renderShortcuts();

    fireKey("o", { metaKey: true });

    expectOnly(handlers, "open");
  });

  it("Cmd+N fires new-window", () => {
    const handlers = renderShortcuts();

    fireKey("n", { metaKey: true });

    expectOnly(handlers, "new-window");
  });

  it("Cmd+M fires toggle-source-mode", () => {
    const handlers = renderShortcuts();

    fireKey("m", { metaKey: true });

    expectOnly(handlers, "toggle-source-mode");
  });

  it("Cmd+F fires find", () => {
    const handlers = renderShortcuts();

    fireKey("f", { metaKey: true });

    expectOnly(handlers, "find");
  });

  it("Cmd+Alt+F fires replace", () => {
    const handlers = renderShortcuts();

    // Alt turns the key into "ƒ" on mac hardware; the binding matches on code
    fireKey("ƒ", { metaKey: true, altKey: true, code: "KeyF" });

    expectOnly(handlers, "replace");
  });

  it("Ctrl+H fires replace on non-mac platforms", () => {
    stubPlatform(WINDOWS_UA);
    const handlers = renderShortcuts();

    fireKey("h", { ctrlKey: true });

    expectOnly(handlers, "replace");
  });

  it("Cmd+H is left to macOS Hide", () => {
    stubPlatform(MAC_UA);
    const handlers = renderShortcuts();

    fireKey("h", { metaKey: true });

    expectOnly(handlers, null);
  });

  it("Cmd+G fires find-next, Cmd+Shift+G fires find-prev", () => {
    const handlers = renderShortcuts();

    fireKey("g", { metaKey: true });
    expect(handlers["find-next"]).toHaveBeenCalledOnce();
    expect(handlers["find-prev"]).not.toHaveBeenCalled();

    fireKey("G", { metaKey: true, shiftKey: true });
    expect(handlers["find-prev"]).toHaveBeenCalledOnce();
    expect(handlers["find-next"]).toHaveBeenCalledOnce();
  });

  it("Cmd+B fires toggle-sidebar", () => {
    const handlers = renderShortcuts();

    fireKey("b", { metaKey: true });

    expectOnly(handlers, "toggle-sidebar");
  });

  it("Cmd+/ fires keyboard-shortcuts", () => {
    const handlers = renderShortcuts();

    fireKey("/", { metaKey: true });

    expectOnly(handlers, "keyboard-shortcuts");
  });

  it("Cmd+Shift+L fires toggle-outline", () => {
    const handlers = renderShortcuts();

    fireKey("l", { metaKey: true, shiftKey: true });

    expectOnly(handlers, "toggle-outline");
  });

  it("Cmd+Shift+L fires toggle-outline when key reports uppercase", () => {
    const handlers = renderShortcuts();

    fireKey("L", { metaKey: true, shiftKey: true });

    expectOnly(handlers, "toggle-outline");
  });

  it("Cmd+L without Shift does nothing", () => {
    const handlers = renderShortcuts();

    fireKey("l", { metaKey: true });

    expectOnly(handlers, null);
  });
});
