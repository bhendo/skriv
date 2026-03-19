import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { liftListItem } from "@milkdown/kit/prose/schema-list";

/**
 * Convert the list that contains the list_item at `listItemPos` to
 * `targetWrapper` (`bullet_list` or `ordered_list`).
 *
 * Entire-list conversion — all sibling items change type together,
 * because ProseMirror's schema enforces homogeneous list wrappers.
 *
 * For ordered→bullet, we update children's attrs immediately because
 * the syncListOrderPlugin would otherwise see a bullet_list with
 * listType='ordered' children and convert it back.
 */
export function convertListType(
  view: EditorView,
  listItemPos: number,
  targetWrapper: "bullet_list" | "ordered_list"
): void {
  const state = view.state;
  const $pos = state.doc.resolve(listItemPos);

  // list_item is at depth d, parent list wrapper is at d-1
  const listDepth = $pos.depth;
  const listNode = $pos.node(listDepth);
  const listPos = $pos.before(listDepth);

  if (listNode.type.name === targetWrapper) return;

  const targetType = state.schema.nodes[targetWrapper];
  if (!targetType) return;

  const tr = state.tr;
  const attrs = { ...listNode.attrs };

  if (targetWrapper === "ordered_list") {
    attrs.order = 1;
  }

  tr.setNodeMarkup(listPos, targetType, attrs);

  // When converting to bullet_list, update child list_item attrs immediately.
  // Otherwise syncListOrderPlugin sees a bullet_list with children whose
  // listType='ordered' and converts it back.
  if (targetWrapper === "bullet_list") {
    const listItemType = state.schema.nodes.list_item;
    if (listItemType) {
      listNode.forEach((child: Node, offset: number) => {
        if (child.type === listItemType) {
          const childPos = listPos + 1 + offset;
          tr.setNodeMarkup(childPos, undefined, {
            ...child.attrs,
            listType: "bullet",
            label: "\u2022",
          });
        }
      });
    }
  }

  view.dispatch(tr);
}

/**
 * Lift the list item out of its parent list, converting it to a plain
 * paragraph. Sets selection inside the list item first so the
 * prosemirror-schema-list `liftListItem` command can find it.
 */
export function unwrapListItem(view: EditorView, listItemPos: number): boolean {
  const state = view.state;
  const listItemType = state.schema.nodes.list_item;
  if (!listItemType) return false;

  // Place selection inside the list item's first child
  const insidePos = listItemPos + 2; // +1 enters list_item, +1 enters first paragraph
  if (insidePos > state.doc.content.size) return false;

  const sel = TextSelection.create(state.doc, insidePos);
  const tr = state.tr.setSelection(sel);
  view.dispatch(tr);

  // Now call liftListItem on the updated state
  const command = liftListItem(listItemType);
  return command(view.state, view.dispatch.bind(view));
}
