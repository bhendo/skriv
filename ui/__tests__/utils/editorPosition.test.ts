import { describe, it, expect, vi } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  captureEditorPosition,
  anchorScrollTop,
  holdScrollAnchor,
} from "../../utils/editorPosition";

// Geometry (scrollDOM, lineBlockAtHeight, lineBlockAt) is stubbed — jsdom has
// no layout. Full toggle behavior is covered by e2e/tests/source-mode.spec.ts.

interface Block {
  from: number;
  to: number;
  top: number;
  height: number;
  bottom: number;
}

function block(from: number, to: number, top: number, height: number): Block {
  return { from, to, top, height, bottom: top + height };
}

function makeCaptureView(opts: {
  doc: string;
  anchor: number;
  head?: number;
  scrollTop: number;
  paddingTop: number;
  topBlock: Block;
}) {
  const state = EditorState.create({
    doc: opts.doc,
    selection: EditorSelection.single(opts.anchor, opts.head ?? opts.anchor),
  });
  const lineBlockAtHeight = vi.fn(() => opts.topBlock);
  const view = {
    state,
    scrollDOM: { scrollTop: opts.scrollTop },
    documentPadding: { top: opts.paddingTop },
    lineBlockAtHeight,
  } as unknown as EditorView;
  return { view, lineBlockAtHeight };
}

function makeRestoreView(opts: { doc: string; paddingTop: number; blocks: Block[] }) {
  const lineBlockAt = vi.fn(
    (pos: number) => opts.blocks.find((b) => pos >= b.from && pos <= b.to) ?? opts.blocks[0]
  );
  const view = {
    state: EditorState.create({ doc: opts.doc }),
    scrollDOM: { scrollTop: 0 },
    documentPadding: { top: opts.paddingTop },
    lineBlockAt,
    dom: document.createElement("div"),
  } as unknown as EditorView;
  return { view, lineBlockAt };
}

describe("captureEditorPosition", () => {
  it("captures the selection and the top block range with fractional depth", () => {
    const { view, lineBlockAtHeight } = makeCaptureView({
      doc: "hello\nworld",
      anchor: 2,
      head: 8,
      scrollTop: 150,
      paddingTop: 16,
      topBlock: block(6, 11, 120, 40),
    });

    const position = captureEditorPosition(view);

    // Probes the height map in document space (scrollTop minus top padding),
    // then records how far into the block that lands: (134 - 120) / 40.
    expect(lineBlockAtHeight).toHaveBeenCalledWith(134);
    expect(position.selection.main.anchor).toBe(2);
    expect(position.selection.main.head).toBe(8);
    expect(position.anchor).toEqual({ from: 6, to: 11, frac: 0.35 });
  });

  it("clamps the fraction to 0..1", () => {
    const { view } = makeCaptureView({
      doc: "hello",
      anchor: 0,
      scrollTop: 0,
      paddingTop: 16,
      // Viewport top (-16 in document space) is above the block.
      topBlock: block(0, 5, 0, 20),
    });

    expect(captureEditorPosition(view).anchor.frac).toBe(0);
  });
});

describe("anchorScrollTop", () => {
  it("maps a captured widget fraction onto the matching finer block", () => {
    // Captured: halfway through a fold widget spanning 0..100. Here the
    // same range is two separate blocks; position 50 falls at the second
    // block's start.
    const { view } = makeRestoreView({
      doc: "x".repeat(200),
      paddingTop: 16,
      blocks: [block(0, 49, 0, 100), block(50, 100, 100, 100)],
    });

    expect(anchorScrollTop(view, { from: 0, to: 100, frac: 0.5 })).toBe(116);
  });

  it("maps a captured row proportionally into a coarser block", () => {
    // Captured: the top of row 40..49. Here that whole region is one fold
    // widget block 0..100, so the row lands at its document-offset depth.
    const { view } = makeRestoreView({
      doc: "x".repeat(200),
      paddingTop: 0,
      blocks: [block(0, 100, 0, 600)],
    });

    expect(anchorScrollTop(view, { from: 40, to: 49, frac: 0 })).toBe(240);
  });

  it("resolves a same-block anchor by fractional depth", () => {
    const { view } = makeRestoreView({
      doc: "x".repeat(100),
      paddingTop: 0,
      blocks: [block(10, 40, 200, 60)],
    });

    expect(anchorScrollTop(view, { from: 10, to: 40, frac: 0.5 })).toBe(230);
  });

  it("clamps the anchor range to the document length", () => {
    const { view, lineBlockAt } = makeRestoreView({
      doc: "short",
      paddingTop: 0,
      blocks: [block(0, 5, 0, 20)],
    });

    anchorScrollTop(view, { from: 50, to: 90, frac: 0.5 });

    expect(lineBlockAt).toHaveBeenCalledWith(5);
    expect(lineBlockAt).not.toHaveBeenCalledWith(50);
  });
});

describe("holdScrollAnchor", () => {
  it("applies the anchor scroll position immediately", () => {
    const { view } = makeRestoreView({
      doc: "x".repeat(100),
      paddingTop: 16,
      blocks: [block(10, 40, 100, 300)],
    });

    const cancel = holdScrollAnchor(view, { from: 10, to: 40, frac: 0.5 });

    expect(view.scrollDOM.scrollTop).toBe(266);
    cancel();
  });
});
