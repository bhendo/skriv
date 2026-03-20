import { createRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SourceEditor } from "../../components/SourceEditor";
import type { EditorHandle } from "../../types/editor";

// Mock CodeMirror modules since jsdom doesn't support them
vi.mock("@codemirror/view", () => {
  class MockEditorView {
    state = { doc: { toString: () => "mock markdown" } };
    destroy = vi.fn();
    dispatch = vi.fn();
    static lineWrapping = {};
    static theme = vi.fn(() => ({}));
    static updateListener = { of: vi.fn(() => ({})) };
  }
  return {
    EditorView: MockEditorView,
    keymap: { of: vi.fn(() => ({})) },
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
  syntaxHighlighting: vi.fn(() => ({})),
  defaultHighlightStyle: {},
}));

vi.mock("@codemirror/commands", () => ({
  defaultKeymap: [],
  historyKeymap: [],
  history: vi.fn(() => ({})),
}));

vi.mock("@codemirror/search", () => ({
  searchKeymap: [],
}));

vi.mock("@codemirror/autocomplete", () => ({
  closeBracketsKeymap: [],
  closeBrackets: vi.fn(() => ({})),
}));

afterEach(cleanup);

describe("SourceEditor", () => {
  it("renders without crashing", () => {
    const ref = createRef<EditorHandle>();
    const { container } = render(
      <SourceEditor ref={ref} defaultValue="# Hello" onChange={vi.fn()} />
    );
    expect(container.querySelector(".source-editor")).not.toBeNull();
  });

  it("exposes getMarkdown via ref", () => {
    const ref = createRef<EditorHandle>();
    render(<SourceEditor ref={ref} defaultValue="# Hello" onChange={vi.fn()} />);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current!.getMarkdown).toBe("function");
  });

  it("getMarkdown returns editor content", () => {
    const ref = createRef<EditorHandle>();
    render(<SourceEditor ref={ref} defaultValue="# Hello" onChange={vi.fn()} />);
    const result = ref.current!.getMarkdown();
    expect(result).toBe("mock markdown");
  });
});
