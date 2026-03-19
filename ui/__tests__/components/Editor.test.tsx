import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorHandle } from "../../components/Editor";

// --- Milkdown mocks ---

const mockGetInstance = vi.fn();
const mockUseInstance = vi.fn(() => [false, mockGetInstance]);
const mockUseEditor = vi.fn();

vi.mock("@milkdown/react", () => ({
  Milkdown: () => null,
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => children,
  useEditor: (...args: unknown[]) => mockUseEditor(...args),
  useInstance: () => mockUseInstance(),
}));

vi.mock("@milkdown/crepe", () => ({
  Crepe: vi.fn(),
  CrepeFeature: {
    CodeMirror: "code-mirror",
    Toolbar: "toolbar",
    BlockEdit: "block-edit",
    LinkTooltip: "link-tooltip",
    ImageBlock: "image-block",
    Table: "table",
    ListItem: "list-item",
    Placeholder: "placeholder",
    Cursor: "cursor",
    Latex: "latex",
  },
}));

vi.mock("@milkdown/utils", () => ({
  getMarkdown: () => "getMarkdown-action",
  $node: () => ({}),
  $prose: () => ({}),
}));

vi.mock("@milkdown/crepe/theme/common/style.css", () => ({}));
vi.mock("../../theme/skriv.css", () => ({}));

// Import after mocks are set up
import { MarkdownEditor } from "../../components/Editor";
import { render } from "@testing-library/react";

describe("Editor ref.getMarkdown()", () => {
  beforeEach(() => {
    mockGetInstance.mockReset();
    mockUseInstance.mockReset();
    mockUseEditor.mockReset();
    mockUseInstance.mockReturnValue([false, mockGetInstance]);
  });

  it("returns markdown when editor instance is available", () => {
    const mockEditor = {
      action: vi.fn().mockReturnValue("# Hello"),
    };
    mockGetInstance.mockReturnValue(mockEditor);

    const ref = createRef<EditorHandle>();
    render(<MarkdownEditor ref={ref} defaultValue="" />);

    const result = ref.current!.getMarkdown();

    expect(result).toBe("# Hello");
    expect(mockEditor.action).toHaveBeenCalledWith("getMarkdown-action");
  });

  it("returns undefined when editor instance is not available", () => {
    mockGetInstance.mockReturnValue(undefined);

    const ref = createRef<EditorHandle>();
    render(<MarkdownEditor ref={ref} defaultValue="" />);

    const result = ref.current!.getMarkdown();

    expect(result).toBeUndefined();
  });

  it("reads getInstance at call time, not at render time", () => {
    // Start with no editor instance (simulates loading state)
    mockGetInstance.mockReturnValue(undefined);

    const ref = createRef<EditorHandle>();
    render(<MarkdownEditor ref={ref} defaultValue="" />);

    // First call: editor not ready
    expect(ref.current!.getMarkdown()).toBeUndefined();

    // Editor becomes available (getInstance reads from a ref internally)
    const mockEditor = {
      action: vi.fn().mockReturnValue("# Now ready"),
    };
    mockGetInstance.mockReturnValue(mockEditor);

    // Same ref handle, but getInstance now returns the editor
    expect(ref.current!.getMarkdown()).toBe("# Now ready");
  });
});
