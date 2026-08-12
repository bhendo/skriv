import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { listen, fireListeners, resetTauriMocks } from "../mocks/tauri";

// Menu events use a window-scoped listener; route it through the shared
// listen mock so tests can fire events from the listeners map.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ listen }),
}));

import { useMenuEvents } from "../../hooks/useMenuEvents";
import { menuEventName } from "../../utils/shortcuts";
import { makeShortcutHandlers } from "../mocks/shortcuts";

describe("useMenuEvents", () => {
  beforeEach(resetTauriMocks);
  afterEach(cleanup);

  it("registers a listener for each menu event", () => {
    renderHook(() => useMenuEvents(makeShortcutHandlers()));

    for (const event of [
      "menu-open",
      "menu-save",
      "menu-save-as",
      "menu-toggle-sidebar",
      "menu-toggle-outline",
      "menu-find",
      "menu-replace",
    ]) {
      expect(listen).toHaveBeenCalledWith(event, expect.any(Function));
    }
  });

  it("does not listen for shortcuts without an event-emitting menu item", () => {
    renderHook(() => useMenuEvents(makeShortcutHandlers()));

    // new-window is handled natively in Rust; find-next has no menu item.
    expect(listen).not.toHaveBeenCalledWith(menuEventName("new-window"), expect.any(Function));
    expect(listen).not.toHaveBeenCalledWith(menuEventName("find-next"), expect.any(Function));
  });

  it.each([
    ["menu-open", "open"],
    ["menu-save", "save"],
    ["menu-save-as", "save-as"],
    ["menu-toggle-sidebar", "toggle-sidebar"],
    ["menu-toggle-outline", "toggle-outline"],
    ["menu-find", "find"],
    ["menu-replace", "replace"],
  ] as const)("%s dispatches to %s only", async (event, handlerName) => {
    const handlers = makeShortcutHandlers();
    renderHook(() => useMenuEvents(handlers));

    await fireListeners(event);

    for (const [name, fn] of Object.entries(handlers)) {
      if (name === handlerName) {
        expect(fn).toHaveBeenCalledOnce();
      } else {
        expect(fn).not.toHaveBeenCalled();
      }
    }
  });

  it("uses the latest handlers after rerender", async () => {
    const first = makeShortcutHandlers();
    const second = makeShortcutHandlers();
    const { rerender } = renderHook(({ handlers }) => useMenuEvents(handlers), {
      initialProps: { handlers: first },
    });

    rerender({ handlers: second });
    await fireListeners("menu-save");

    expect(first.save).not.toHaveBeenCalled();
    expect(second.save).toHaveBeenCalledOnce();
  });
});
