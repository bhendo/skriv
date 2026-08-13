import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { invoke, resetTauriMocks } from "../mocks/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// vi.hoisted ensures these are available when vi.mock factories run (hoisted above imports)
const { mockOnCloseRequested, mockMessage } = vi.hoisted(() => ({
  mockOnCloseRequested: vi.fn(() => Promise.resolve(vi.fn())),
  mockMessage: vi.fn(),
}));

import { listen, fireListeners } from "../mocks/tauri";

// quit-requested is delivered via a window-scoped listener; route it through
// the shared listen mock so tests can fire it from the listeners map.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: mockOnCloseRequested,
    listen,
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  message: mockMessage,
}));

import { useWindowClose } from "../../hooks/useWindowClose";

describe("useWindowClose", () => {
  beforeEach(() => {
    resetTauriMocks();
    mockOnCloseRequested.mockReset().mockReturnValue(Promise.resolve(vi.fn()));
    mockMessage.mockReset();
  });

  it("registers close_requested listener on mount", () => {
    renderHook(() =>
      useWindowClose({
        isModified: false,
        onSave: vi.fn(),
        shouldAutoSave: () => false,
      })
    );

    expect(mockOnCloseRequested).toHaveBeenCalledTimes(1);
  });

  it("registers quit-requested listener on mount", () => {
    renderHook(() =>
      useWindowClose({
        isModified: false,
        onSave: vi.fn(),
        shouldAutoSave: () => false,
      })
    );

    expect(listen).toHaveBeenCalledWith("quit-requested", expect.any(Function));
  });

  const fireQuitRequested = () => fireListeners("quit-requested");

  it("closes without prompting when not modified", async () => {
    renderHook(() =>
      useWindowClose({ isModified: false, onSave: vi.fn(), shouldAutoSave: () => false })
    );

    await fireQuitRequested();

    expect(mockMessage).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("close_window");
  });

  it("closes after a successful save", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    mockMessage.mockResolvedValue("Save");
    renderHook(() => useWindowClose({ isModified: true, onSave, shouldAutoSave: () => false }));

    await fireQuitRequested();

    expect(onSave).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("close_window");
  });

  it("keeps the window open when the save fails or is cancelled", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    mockMessage.mockResolvedValue("Save");
    renderHook(() => useWindowClose({ isModified: true, onSave, shouldAutoSave: () => false }));

    await fireQuitRequested();

    expect(onSave).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalledWith("close_window");
  });

  it("closes without saving on Don't Save", async () => {
    const onSave = vi.fn();
    mockMessage.mockResolvedValue("Don't Save");
    renderHook(() => useWindowClose({ isModified: true, onSave, shouldAutoSave: () => false }));

    await fireQuitRequested();

    expect(onSave).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("close_window");
  });

  it("keeps the window open on Cancel", async () => {
    mockMessage.mockResolvedValue("Cancel");
    renderHook(() =>
      useWindowClose({ isModified: true, onSave: vi.fn(), shouldAutoSave: () => false })
    );

    await fireQuitRequested();

    expect(invoke).not.toHaveBeenCalledWith("close_window");
  });

  it("saves and closes silently when auto-save is active", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderHook(() => useWindowClose({ isModified: true, onSave, shouldAutoSave: () => true }));

    await fireQuitRequested();

    expect(onSave).toHaveBeenCalledOnce();
    expect(mockMessage).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("close_window");
  });

  it("falls back to the prompt when the auto-save close fails to save", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    mockMessage.mockResolvedValue("Cancel");
    renderHook(() => useWindowClose({ isModified: true, onSave, shouldAutoSave: () => true }));

    await fireQuitRequested();

    expect(onSave).toHaveBeenCalledOnce();
    expect(mockMessage).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalledWith("close_window");
  });
});
