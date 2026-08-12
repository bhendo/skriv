import type { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Cursor and scroll anchor captured from the outgoing editor on a mode
 * toggle. Both modes are CodeMirror views over the identical markdown
 * string, so document offsets transfer directly. The replacement editor
 * applies it at view construction (state selection + `scrollTo`), keeping
 * the same content at the top of the viewport even when the cursor is
 * off-screen — the modes render at different line heights, so a document
 * anchor is meaningful where a pixel offset is not.
 */
export interface EditorPosition {
  selection: EditorSelection;
  /** Offset of the first line visible at the top of the viewport. */
  topPos: number;
}

export function captureEditorPosition(view: EditorView): EditorPosition {
  // Height-map lookup, not coordsAtPos: it resolves positions outside the
  // rendered viewport (see key_facts.md). scrollTop is scroller-relative;
  // lineBlockAtHeight expects document space, which starts below the top
  // padding.
  const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop - view.documentPadding.top);
  return {
    selection: view.state.selection,
    topPos: topBlock.from,
  };
}
