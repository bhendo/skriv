import { describe, it, expect, vi } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { captureEditorPosition } from "../../utils/editorPosition";

// Geometry (scrollDOM, lineBlockAtHeight) is stubbed — jsdom has no layout.
// The restore side (selection + scrollTo at view construction) is covered by
// e2e/tests/source-mode.spec.ts.
function makeCaptureView(opts: {
  doc: string;
  anchor: number;
  head?: number;
  scrollTop?: number;
  paddingTop?: number;
  blockFrom?: number;
}) {
  const state = EditorState.create({
    doc: opts.doc,
    selection: EditorSelection.single(opts.anchor, opts.head ?? opts.anchor),
  });
  const lineBlockAtHeight = vi.fn(() => ({ from: opts.blockFrom ?? 0 }));
  const view = {
    state,
    scrollDOM: { scrollTop: opts.scrollTop ?? 0 },
    documentPadding: { top: opts.paddingTop ?? 0 },
    lineBlockAtHeight,
  } as unknown as EditorView;
  return { view, lineBlockAtHeight };
}

describe("captureEditorPosition", () => {
  it("captures the selection and the top visible position", () => {
    const { view } = makeCaptureView({
      doc: "hello\nworld",
      anchor: 2,
      head: 8,
      blockFrom: 6,
    });

    const position = captureEditorPosition(view);

    expect(position.selection.main.anchor).toBe(2);
    expect(position.selection.main.head).toBe(8);
    expect(position.topPos).toBe(6);
  });

  it("probes the height map in document space (scrollTop minus top padding)", () => {
    const { view, lineBlockAtHeight } = makeCaptureView({
      doc: "a\nb\nc",
      anchor: 0,
      scrollTop: 150,
      paddingTop: 16,
    });

    captureEditorPosition(view);

    expect(lineBlockAtHeight).toHaveBeenCalledWith(134);
  });
});
