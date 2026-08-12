import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke, listen, fireListeners, resetTauriMocks } from "../mocks/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { Sidebar, type DirEntryInfo } from "../../components/Sidebar";
import type { TocHeading } from "../../types/toc";

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

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      currentPath="/notes/current.md"
      onFileSelect={vi.fn()}
      activeTab="files"
      onTabChange={vi.fn()}
      headings={[]}
      activeHeadingIndex={-1}
      onHeadingSelect={vi.fn()}
      {...overrides}
    />
  );
}

describe("Sidebar", () => {
  beforeEach(resetTauriMocks);
  afterEach(cleanup);

  it("lists folder files with the current file highlighted", async () => {
    mockCommands();
    renderSidebar();

    const current = await screen.findByRole("button", { name: "current.md" });
    const sibling = await screen.findByRole("button", { name: "alpha.md" });

    expect(current.className).toContain("active");
    expect(sibling.className).not.toContain("active");
  });

  it("hides the folder section when no file is open", async () => {
    mockCommands({ recentFiles: ["/notes/old.md"] });
    renderSidebar({ currentPath: null });

    await screen.findByRole("button", { name: "old.md" });

    expect(invoke).not.toHaveBeenCalledWith("list_markdown_files", expect.anything());
    expect(screen.queryByText("alpha.md")).toBeNull();
  });

  it("calls onFileSelect with the clicked file's path", async () => {
    mockCommands();
    const onFileSelect = vi.fn();
    renderSidebar({ onFileSelect });

    await userEvent.click(await screen.findByRole("button", { name: "alpha.md" }));

    expect(onFileSelect).toHaveBeenCalledWith("/notes/alpha.md");
  });

  it("shows recents without the current file and selects on click", async () => {
    mockCommands({ recentFiles: ["/notes/current.md", "/elsewhere/history.md"] });
    const onFileSelect = vi.fn();
    renderSidebar({ onFileSelect });

    const recent = await screen.findByRole("button", { name: "history.md" });
    // current.md appears once (folder section) — not repeated under Recent
    expect(screen.getAllByRole("button", { name: "current.md" })).toHaveLength(1);

    await userEvent.click(recent);
    expect(onFileSelect).toHaveBeenCalledWith("/elsewhere/history.md");
  });

  it("shows an empty state when there are no recents", async () => {
    mockCommands({ recentFiles: [] });
    renderSidebar();

    expect(await screen.findByText("No recent files")).not.toBeNull();
  });

  it("updates recents from the recents-changed payload", async () => {
    mockCommands({ recentFiles: [] });
    renderSidebar({ currentPath: null });
    await screen.findByText("No recent files");

    await act(async () => {
      await fireListeners("recents-changed", ["/notes/new.md"]);
    });

    expect(await screen.findByRole("button", { name: "new.md" })).not.toBeNull();
  });

  it("tolerates null command results (e2e mock default)", async () => {
    invoke.mockResolvedValue(null);
    renderSidebar();

    expect(await screen.findByText("No recent files")).not.toBeNull();
  });

  it("renders Files and Outline tabs with the active tab selected", async () => {
    mockCommands();
    renderSidebar();

    const filesTab = screen.getByRole("tab", { name: "Files" });
    const outlineTab = screen.getByRole("tab", { name: "Outline" });

    expect(filesTab.getAttribute("aria-selected")).toBe("true");
    expect(outlineTab.getAttribute("aria-selected")).toBe("false");
    await screen.findByText("No recent files");
  });

  it("fires onTabChange when a tab is clicked", async () => {
    mockCommands();
    const onTabChange = vi.fn();
    renderSidebar({ onTabChange });

    await userEvent.click(screen.getByRole("tab", { name: "Outline" }));

    expect(onTabChange).toHaveBeenCalledWith("outline");
  });

  it("shows the outline panel instead of file sections on the outline tab", async () => {
    mockCommands({ recentFiles: ["/notes/old.md"] });
    const headings: TocHeading[] = [{ level: 1, text: "Intro", pos: 0 }];
    const onHeadingSelect = vi.fn();
    renderSidebar({ activeTab: "outline", headings, onHeadingSelect });

    expect(screen.queryByText("Recent")).toBeNull();
    expect(screen.queryByText("current.md")).toBeNull();
    // The directory scan is gated on the Files tab
    expect(invoke).not.toHaveBeenCalledWith("list_markdown_files", expect.anything());

    await userEvent.click(screen.getByRole("button", { name: "Intro" }));
    expect(onHeadingSelect).toHaveBeenCalledWith(headings[0]);
  });
});
