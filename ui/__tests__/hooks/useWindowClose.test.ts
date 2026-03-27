import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { invoke, resetTauriMocks } from "../mocks/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// vi.hoisted ensures these are available when vi.mock factories run (hoisted above imports)
const { mockOnCloseRequested, mockMessage } = vi.hoisted(() => ({
  mockOnCloseRequested: vi.fn(() => Promise.resolve(vi.fn())),
  mockMessage: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: mockOnCloseRequested,
  }),
}));

import { listen } from "../mocks/tauri";
vi.mock("@tauri-apps/api/event", () => ({ listen }));

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
      })
    );

    expect(mockOnCloseRequested).toHaveBeenCalledTimes(1);
  });

  it("registers quit-requested listener on mount", () => {
    renderHook(() =>
      useWindowClose({
        isModified: false,
        onSave: vi.fn(),
      })
    );

    expect(listen).toHaveBeenCalledWith("quit-requested", expect.any(Function));
  });
});
