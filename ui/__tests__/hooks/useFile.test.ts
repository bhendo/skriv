import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { deferred } from "../mocks/async";
import { invoke, resetTauriMocks } from "../mocks/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useFile } from "../../hooks/useFile";

async function renderWithFile(path: string, content: string) {
  invoke.mockResolvedValueOnce(content); // open_document

  const hook = renderHook(() => useFile());
  await act(() => hook.result.current.openFile(path));
  return hook;
}

describe("useFile", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("starts with empty state", () => {
    const { result } = renderHook(() => useFile());

    expect(result.current.path).toBeNull();
    expect(result.current.content).toBe("");
    expect(result.current.isModified).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("opens a file and records it as recent", async () => {
    const { result } = await renderWithFile("/docs/hello.md", "# Hello");

    expect(invoke).toHaveBeenCalledWith("open_document", {
      path: "/docs/hello.md",
      recordRecent: true,
    });
    expect(result.current.path).toBe("/docs/hello.md");
    expect(result.current.content).toBe("# Hello");
    expect(result.current.isModified).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reloads a file without recording it as recent", async () => {
    const { result } = await renderWithFile("/docs/hello.md", "# Hello");

    invoke.mockResolvedValueOnce("# Changed");
    await act(() => result.current.reloadFile("/docs/hello.md"));

    expect(invoke).toHaveBeenLastCalledWith("open_document", {
      path: "/docs/hello.md",
      recordRecent: false,
    });
    expect(result.current.content).toBe("# Changed");
    expect(result.current.isModified).toBe(false);
  });

  it("sets error when openFile fails", async () => {
    invoke.mockRejectedValueOnce("permission denied");

    const { result } = renderHook(() => useFile());
    await act(() => result.current.openFile("/secret.md"));

    expect(result.current.error).toBe("Failed to open file: permission denied");
    expect(result.current.path).toBeNull();
  });

  it("saves file and clears isModified", async () => {
    const { result } = await renderWithFile("/docs/file.md", "old content");

    act(() => result.current.markModified());
    expect(result.current.isModified).toBe(true);

    invoke.mockResolvedValueOnce(undefined); // write_file
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveFile("new content");
    });

    expect(saved).toBe(true);
    expect(invoke).toHaveBeenCalledWith("write_file", {
      path: "/docs/file.md",
      content: "new content",
    });
    expect(result.current.isModified).toBe(false);
    expect(result.current.content).toBe("new content");
  });

  it("returns false from saveFile when no path is set", async () => {
    const { result } = renderHook(() => useFile());

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sets error when saveFile fails", async () => {
    const { result } = await renderWithFile("/docs/file.md", "content");

    invoke.mockRejectedValueOnce("disk full");
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveFile("content");
    });

    expect(saved).toBe(false);
    expect(result.current.error).toBe("Failed to save file: disk full");
  });

  it("saves new file and updates path", async () => {
    invoke.mockResolvedValueOnce(undefined); // write_new_file

    const { result } = renderHook(() => useFile());

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveNewFile("/docs/new.md", "# New");
    });

    expect(saved).toBe(true);
    expect(invoke).toHaveBeenCalledWith("write_new_file", {
      path: "/docs/new.md",
      content: "# New",
    });
    expect(result.current.path).toBe("/docs/new.md");
    expect(result.current.content).toBe("# New");
  });

  it("bumps docVersion on open and reload, never on save", async () => {
    const { result } = await renderWithFile("/docs/a.md", "A");
    const opened = result.current.docVersion;

    invoke.mockResolvedValueOnce(undefined); // write_file
    await act(async () => {
      await result.current.saveFile("B");
    });
    expect(result.current.docVersion).toBe(opened);

    invoke.mockResolvedValueOnce("C"); // open_document (reload)
    await act(() => result.current.reloadFile("/docs/a.md"));
    expect(result.current.docVersion).toBe(opened + 1);
  });

  it("keeps isModified when an edit lands while the save is in flight", async () => {
    const { result } = await renderWithFile("/docs/a.md", "A");
    act(() => result.current.markModified());

    const write = deferred();
    invoke.mockImplementationOnce(() => write.promise);
    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = result.current.saveFile("B");
    });

    // The keystroke outruns the write: it is not in the saved bytes.
    act(() => result.current.markModified());

    await act(async () => {
      write.resolve();
      await savePromise;
    });
    expect(result.current.isModified).toBe(true);
  });

  it("a save resolving after the document was replaced leaves state alone", async () => {
    const { result } = await renderWithFile("/docs/a.md", "A");
    act(() => result.current.markModified());

    const write = deferred();
    invoke.mockImplementationOnce(() => write.promise);
    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = result.current.saveFile("B");
    });

    invoke.mockResolvedValueOnce("NEW"); // open_document for the next file
    await act(() => result.current.openFile("/docs/b.md"));

    let saved: boolean | undefined;
    await act(async () => {
      write.resolve();
      saved = await savePromise;
    });

    expect(saved).toBe(true); // the write itself landed
    expect(result.current.path).toBe("/docs/b.md");
    expect(result.current.content).toBe("NEW");
    expect(result.current.isModified).toBe(false);
  });

  it("markModified is idempotent", () => {
    const { result } = renderHook(() => useFile());

    act(() => result.current.markModified());
    expect(result.current.isModified).toBe(true);

    act(() => result.current.markModified());
    expect(result.current.isModified).toBe(true);
  });

  it("clearError clears the error", async () => {
    invoke.mockRejectedValueOnce("fail");

    const { result } = renderHook(() => useFile());
    await act(() => result.current.openFile("/bad.md"));
    expect(result.current.error).not.toBeNull();

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
