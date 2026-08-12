import type { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Cursor and scroll anchor captured from the outgoing editor on a mode
 * toggle. Both modes are CodeMirror views over the identical markdown
 * string, so document offsets transfer directly.
 *
 * The scroll anchor is the top visible block's document range plus the
 * fractional depth into it, not a position alone: block granularity differs
 * across modes (a table is one fold widget in live preview but many raw
 * lines in source), so anchoring a bare position snaps to the block start
 * and loses however far the user had scrolled into it.
 */
export interface EditorPosition {
  selection: EditorSelection;
  anchor: ScrollAnchor;
}

export interface ScrollAnchor {
  /** Document range of the block at the top of the viewport. */
  from: number;
  to: number;
  /** How far into that block's height the viewport top sits, 0..1. */
  frac: number;
}

export function captureEditorPosition(view: EditorView): EditorPosition {
  // Height-map lookup, not coordsAtPos: it resolves positions outside the
  // rendered viewport (see key_facts.md). scrollTop is scroller-relative;
  // lineBlockAtHeight expects document space, which starts below the top
  // padding.
  const y = view.scrollDOM.scrollTop - view.documentPadding.top;
  const block = view.lineBlockAtHeight(y);
  const frac = block.height > 0 ? Math.max(0, Math.min(1, (y - block.top) / block.height)) : 0;
  return {
    selection: view.state.selection,
    anchor: { from: block.from, to: block.to, frac },
  };
}

/**
 * The scrollTop that puts `anchor` at the top of the viewport.
 *
 * The anchor is reduced to a virtual document position (range start plus
 * the fraction of its length), then placed proportionally by document
 * offset within whatever block contains it here. That stays correct when
 * block granularity changes in either direction: a captured row lands at
 * its proportional depth inside a table widget, and a captured widget
 * fraction lands on the matching raw row.
 */
export function anchorScrollTop(view: EditorView, anchor: ScrollAnchor): number {
  const docLength = view.state.doc.length;
  const from = Math.min(anchor.from, docLength);
  const to = Math.min(anchor.to, docLength);
  const pos = from + anchor.frac * (to - from);
  const block = view.lineBlockAt(Math.min(Math.round(pos), docLength));
  const rel =
    block.to > block.from
      ? Math.max(0, Math.min(1, (pos - block.from) / (block.to - block.from)))
      : 0;
  return block.top + rel * block.height + view.documentPadding.top;
}

const CANCEL_EVENTS = ["wheel", "touchstart", "mousedown", "keydown"] as const;
const MAX_FRAMES = 30;
const STABLE_FRAMES = 3;

/**
 * Holds the viewport on `anchor` for a few frames after a fresh view mounts,
 * while fold widgets materialize and the height map corrects from estimates
 * to measured sizes. Stops once the position is stable, on any user input,
 * or when the returned cancel function runs (call it before destroying the
 * view).
 */
export function holdScrollAnchor(view: EditorView, anchor: ScrollAnchor): () => void {
  let raf = 0;
  let frames = 0;
  let stable = 0;
  const cancel = () => {
    cancelAnimationFrame(raf);
    for (const type of CANCEL_EVENTS) view.dom.removeEventListener(type, cancel);
  };
  for (const type of CANCEL_EVENTS) {
    view.dom.addEventListener(type, cancel, { passive: true });
  }
  const tick = () => {
    const target = anchorScrollTop(view, anchor);
    if (Math.abs(view.scrollDOM.scrollTop - target) > 1) {
      view.scrollDOM.scrollTop = target;
      stable = 0;
    } else {
      stable += 1;
    }
    if (++frames >= MAX_FRAMES || stable >= STABLE_FRAMES) {
      cancel();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return cancel;
}
