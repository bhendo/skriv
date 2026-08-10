import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

/**
 * Move the cursor to a fold widget's source range. The fold extension sees
 * the selection touching the node and reveals the raw markdown in place.
 */
export function focusWidgetSource(view: EditorView, dom: HTMLElement): void {
  const pos = view.posAtDOM(dom);
  view.dispatch({ selection: { anchor: pos } });
  view.focus();
}

/** Expand a node's range to full lines, as block replace decorations require. */
export function fullLineRange(state: EditorState, node: SyntaxNodeRef): [number, number] {
  return [state.doc.lineAt(node.from).from, state.doc.lineAt(node.to).to];
}
