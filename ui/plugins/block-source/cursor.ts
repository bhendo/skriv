import type { Node } from "@milkdown/kit/prose/model";
import { type EditorState, NodeSelection } from "@milkdown/kit/prose/state";

/** Walk the resolved position's depth stack and return the innermost ancestor of the given type. */
export function findAncestorOfType(
  state: EditorState,
  typeName: string
): { node: Node; pos: number; depth: number } | null {
  const nodeType = state.schema.nodes[typeName];
  if (!nodeType) return null;

  const sel = state.selection;
  const $from = sel.$from;

  // Walk from innermost to outermost — first match wins
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type === nodeType) {
      return { node, pos: $from.before(d), depth: d };
    }
  }

  // Handle NodeSelection: the selected node itself might be the target
  if (sel instanceof NodeSelection) {
    const node = sel.node;
    if (node.type === nodeType) {
      return { node, pos: sel.from, depth: $from.depth };
    }
  }

  return null;
}

/** Walk the document and return the first node matching the given type name. */
export function findFirstNodeOfType(
  doc: Node,
  typeName: string
): { node: Node; pos: number } | null {
  const nodeType = doc.type.schema.nodes[typeName];
  if (!nodeType) return null;

  let result: { node: Node; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (node.type === nodeType) {
      result = { node, pos };
      return false;
    }
    return true;
  });
  return result;
}
