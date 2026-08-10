import { createRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { LivePreviewEditor } from "../../components/LivePreviewEditor";
import type { EditorHandle } from "../../types/editor";

// Mock CodeMirror + ProseMark modules since jsdom doesn't support them
vi.mock("@codemirror/view", () => {
  class MockEditorView {
    state = { doc: { toString: () => "mock markdown" } };
    destroy = vi.fn();
    dispatch = vi.fn();
    setState = vi.fn();
    static lineWrapping = {};
    static theme = vi.fn(() => ({}));
    static updateListener = { of: vi.fn(() => ({})) };
  }
  return {
    EditorView: MockEditorView,
    keymap: { of: vi.fn(() => ({})) },
    dropCursor: vi.fn(() => ({})),
    highlightSpecialChars: vi.fn(() => ({})),
    placeholder: vi.fn(() => ({})),
  };
});

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: vi.fn(() => ({ doc: { toString: () => "mock markdown" } })),
  },
}));

vi.mock("@codemirror/lang-markdown", () => ({
  markdown: vi.fn(() => ({})),
}));

vi.mock("@codemirror/language-data", () => ({
  languages: [],
}));

vi.mock("@codemirror/language", () => ({
  indentOnInput: vi.fn(() => ({})),
  bracketMatching: vi.fn(() => ({})),
}));

vi.mock("@codemirror/commands", () => ({
  defaultKeymap: [],
  historyKeymap: [],
  history: vi.fn(() => ({})),
  indentWithTab: {},
}));

vi.mock("@codemirror/search", () => ({
  search: vi.fn(() => ({})),
}));

vi.mock("@codemirror/autocomplete", () => ({
  closeBracketsKeymap: [],
  closeBrackets: vi.fn(() => ({})),
  autocompletion: vi.fn(() => ({})),
  completionKeymap: [],
}));

vi.mock("@lezer/markdown", () => ({
  GFM: {},
}));

vi.mock("../../live-preview", () => ({
  mermaidPreviewExtension: {},
  tablePreviewExtension: {},
  livePreviewFormattingKeymap: [],
}));

vi.mock("@prosemark/core", () => ({
  defaultHideExtensions: [],
  defaultFoldableSyntaxExtensions: [],
  revealBlockOnArrowExtension: [],
  clickLinkExtension: {},
  defaultClickLinkHandler: {},
  fixedTabWidthExtension: {},
  softIndentExtension: {},
  codeBlockDecorationsExtension: {},
  prosemarkBaseThemeSetup: vi.fn(() => []),
  prosemarkMarkdownSyntaxExtensions: [],
}));

afterEach(cleanup);

describe("LivePreviewEditor", () => {
  it("renders without crashing", () => {
    const ref = createRef<EditorHandle>();
    const { container } = render(
      <LivePreviewEditor ref={ref} defaultValue="# Hello" onChange={vi.fn()} />
    );
    expect(container.querySelector(".live-preview-editor")).not.toBeNull();
  });

  it("getMarkdown returns editor content", () => {
    const ref = createRef<EditorHandle>();
    render(<LivePreviewEditor ref={ref} defaultValue="# Hello" onChange={vi.fn()} />);
    expect(ref.current!.getMarkdown()).toBe("mock markdown");
  });

  it("getCodeMirrorView returns the CodeMirror view", () => {
    const ref = createRef<EditorHandle>();
    render(<LivePreviewEditor ref={ref} defaultValue="# Hello" onChange={vi.fn()} />);
    expect(ref.current!.getCodeMirrorView!()).not.toBeNull();
  });
});
