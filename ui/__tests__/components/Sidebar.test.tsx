import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke, listen, fireListeners, resetTauriMocks } from "../mocks/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { Sidebar, type DirEntryInfo } from "../../components/Sidebar";

const FOLDER_FILES: DirEntryInfo[] = [
  { name: "alpha.md", path: "/notes/alpha.md" },
  { name: "current.md", path: "/notes/current.md" },
];

function mockCommands({ folderFiles = FOLDER_FILES, recentFiles = [] as string[] } = {}) {
  invoke.mockImplementation((cmd: unknown) => {
    if (cmd === "list_markdown_files") return Promise.resolve(folderFiles);
    if (cmd === "get_recent_files") return Promise.resolve(recentFiles);
    return Promise.resolve(null);
  });
}

describe("Sidebar", () => {
  beforeEach(resetTauriMocks);
  afterEach(cleanup);

  it("lists folder files with the current file highlighted", async () => {
    mockCommands();
    render(<Sidebar currentPath="/notes/current.md" onFileSelect={vi.fn()} />);

    const current = await screen.findByRole("button", { name: "current.md" });
    const sibling = await screen.findByRole("button", { name: "alpha.md" });

    expect(current.className).toContain("active");
    expect(sibling.className).not.toContain("active");
  });

  it("hides the folder section when no file is open", async () => {
    mockCommands({ recentFiles: ["/notes/old.md"] });
    render(<Sidebar currentPath={null} onFileSelect={vi.fn()} />);

    await screen.findByRole("button", { name: "old.md" });

    expect(invoke).not.toHaveBeenCalledWith("list_markdown_files", expect.anything());
    expect(screen.queryByText("alpha.md")).toBeNull();
  });

  it("calls onFileSelect with the clicked file's path", async () => {
    mockCommands();
    const onFileSelect = vi.fn();
    render(<Sidebar currentPath="/notes/current.md" onFileSelect={onFileSelect} />);

    await userEvent.click(await screen.findByRole("button", { name: "alpha.md" }));

    expect(onFileSelect).toHaveBeenCalledWith("/notes/alpha.md");
  });

  it("shows recents without the current file and selects on click", async () => {
    mockCommands({ recentFiles: ["/notes/current.md", "/elsewhere/history.md"] });
    const onFileSelect = vi.fn();
    render(<Sidebar currentPath="/notes/current.md" onFileSelect={onFileSelect} />);

    const recent = await screen.findByRole("button", { name: "history.md" });
    // current.md appears once (folder section) — not repeated under Recent
    expect(screen.getAllByRole("button", { name: "current.md" })).toHaveLength(1);

    await userEvent.click(recent);
    expect(onFileSelect).toHaveBeenCalledWith("/elsewhere/history.md");
  });

  it("shows an empty state when there are no recents", async () => {
    mockCommands({ recentFiles: [] });
    render(<Sidebar currentPath="/notes/current.md" onFileSelect={vi.fn()} />);

    expect(await screen.findByText("No recent files")).not.toBeNull();
  });

  it("updates recents from the recents-changed payload", async () => {
    mockCommands({ recentFiles: [] });
    render(<Sidebar currentPath={null} onFileSelect={vi.fn()} />);
    await screen.findByText("No recent files");

    await act(async () => {
      await fireListeners("recents-changed", ["/notes/new.md"]);
    });

    expect(await screen.findByRole("button", { name: "new.md" })).not.toBeNull();
  });

  it("tolerates null command results (e2e mock default)", async () => {
    invoke.mockResolvedValue(null);
    render(<Sidebar currentPath="/notes/current.md" onFileSelect={vi.fn()} />);

    expect(await screen.findByText("No recent files")).not.toBeNull();
  });
});
