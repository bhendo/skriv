import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { listen, fireListeners, resetTauriMocks } from "../mocks/tauri";

// Menu events use a window-scoped listener; route it through the shared
// listen mock so tests can fire events from the listeners map.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ listen }),
}));

import { useMenuEvents } from "../../hooks/useMenuEvents";

function makeHandlers() {
  return {
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onToggleSidebar: vi.fn(),
  };
}

describe("useMenuEvents", () => {
  beforeEach(resetTauriMocks);
  afterEach(cleanup);

  it("registers a listener for each menu event", () => {
    renderHook(() => useMenuEvents(makeHandlers()));

    for (const event of ["menu-open", "menu-save", "menu-save-as", "menu-toggle-sidebar"]) {
      expect(listen).toHaveBeenCalledWith(event, expect.any(Function));
    }
  });

  it.each([
    ["menu-open", "onOpen"],
    ["menu-save", "onSave"],
    ["menu-save-as", "onSaveAs"],
    ["menu-toggle-sidebar", "onToggleSidebar"],
  ] as const)("%s dispatches to %s only", async (event, handlerName) => {
    const handlers = makeHandlers();
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
    const first = makeHandlers();
    const second = makeHandlers();
    const { rerender } = renderHook(({ handlers }) => useMenuEvents(handlers), {
      initialProps: { handlers: first },
    });

    rerender({ handlers: second });
    await fireListeners("menu-save");

    expect(first.onSave).not.toHaveBeenCalled();
    expect(second.onSave).toHaveBeenCalledOnce();
  });
});
