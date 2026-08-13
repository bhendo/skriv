import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoSave, AUTO_SAVE_DEBOUNCE_MS } from "../../hooks/useAutoSave";
import { storeAutoSavePref } from "../../utils/autoSavePref";
import { deferred } from "../mocks/async";

interface Props {
  hasPath: boolean;
  isModified: boolean;
  onSave: () => Promise<boolean>;
}

function renderAutoSave(overrides: Partial<Props> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  const initial: Props = { hasPath: true, isModified: true, onSave, ...overrides };
  const hook = renderHook((props: Props) => useAutoSave(props), { initialProps: initial });
  return { ...hook, onSave: initial.onSave as ReturnType<typeof vi.fn>, initial };
}

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear(); // preference defaults to on
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves one debounce interval after a change", async () => {
    const { result, onSave } = renderAutoSave();

    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS - 1));
    expect(onSave).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("each change restarts the debounce clock", async () => {
    const { result, onSave } = renderAutoSave();

    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS - 100));
    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS - 100));
    expect(onSave).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("does not schedule when the preference is off", async () => {
    storeAutoSavePref(false);
    const { result, onSave } = renderAutoSave();

    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("turning the preference off defuses an already-pending save", async () => {
    const { result, onSave } = renderAutoSave();

    act(() => result.current.notifyChange());
    storeAutoSavePref(false);
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not schedule for untitled documents", async () => {
    const { result, onSave } = renderAutoSave({ hasPath: false });

    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("skips the save when the document is clean at fire time", async () => {
    const { result, onSave } = renderAutoSave({ isModified: false });

    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves immediately when the window loses focus", async () => {
    const { onSave } = renderAutoSave();

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("blur on a clean document does not save", async () => {
    const { onSave } = renderAutoSave({ isModified: false });

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("blur cancels the pending debounce instead of saving twice", async () => {
    const { result, onSave } = renderAutoSave();

    act(() => result.current.notifyChange());
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("never overlaps saves: a fire during an in-flight save retries after the interval", async () => {
    const first = deferred<boolean>();
    const onSave = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(true);
    const { result } = renderAutoSave({ onSave });

    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS));
    expect(onSave).toHaveBeenCalledOnce(); // in flight, unresolved

    // Next change fires while the first save is still writing.
    act(() => result.current.notifyChange());
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS));
    expect(onSave).toHaveBeenCalledOnce(); // deferred, not overlapped

    await act(async () => {
      first.resolve(true);
    });
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS));
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
