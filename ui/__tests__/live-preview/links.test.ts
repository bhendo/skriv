import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

vi.mock("../../plugins/link-source/clipboard", () => ({
  readClipboardUrl: vi.fn(),
}));

import { readClipboardUrl } from "../../plugins/link-source/clipboard";
import { insertLinkWithClipboard } from "../../live-preview/links";

const mockedClipboard = vi.mocked(readClipboardUrl);

function makeView(doc: string, anchor: number, head = anchor) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
  });
  return {
    get state() {
      return state;
    },
    dispatch: vi.fn((spec: TransactionSpec) => {
      state = state.update(spec).state;
    }),
    focus: vi.fn(),
  };
}

const asView = (view: ReturnType<typeof makeView>) => view as unknown as EditorView;

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockedClipboard.mockReset();
});

describe("insertLinkWithClipboard", () => {
  it("wraps the selection and auto-fills the clipboard URL", async () => {
    mockedClipboard.mockResolvedValue("https://example.com");
    const view = makeView("hello world", 6, 11);

    expect(insertLinkWithClipboard(asView(view))).toBe(true);
    await flush();

    expect(view.state.doc.toString()).toBe("hello [world](https://example.com)");
    // Cursor at the end of the URL so the auto-fill can be reviewed
    expect(view.state.selection.main.head).toBe(view.state.doc.length - 1);
  });

  it("inserts empty link syntax with cursor in brackets when clipboard has no URL", async () => {
    mockedClipboard.mockResolvedValue(null);
    const view = makeView("ab", 1);

    insertLinkWithClipboard(asView(view));
    await flush();

    expect(view.state.doc.toString()).toBe("a[]()b");
    expect(view.state.selection.main.head).toBe(2);
  });

  it("leaves selected text in parens position when clipboard has no URL", async () => {
    mockedClipboard.mockResolvedValue(null);
    const view = makeView("pick me", 5, 7);

    insertLinkWithClipboard(asView(view));
    await flush();

    expect(view.state.doc.toString()).toBe("pick [me]()");
    // Cursor inside the empty parens
    expect(view.state.selection.main.head).toBe(view.state.doc.length - 1);
  });

  it("bails if the document changed while reading the clipboard", async () => {
    let resolveClipboard: (url: string | null) => void = () => {};
    mockedClipboard.mockReturnValue(
      new Promise((r) => {
        resolveClipboard = r;
      })
    );
    const view = makeView("hello world", 6, 11);

    insertLinkWithClipboard(asView(view));
    view.dispatch({ changes: { from: 0, to: 0, insert: "X" } });
    view.dispatch.mockClear();

    resolveClipboard("https://example.com");
    await flush();

    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
