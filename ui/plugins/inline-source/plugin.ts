import type { Node, MarkType } from "@milkdown/kit/prose/model";

export function findMarkSpan(
  doc: Node,
  pos: number,
  markType: MarkType
): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;

  if (!parent.isTextblock) return null;

  const parentStart = $pos.start();
  const index = $pos.index();

  // Find the child at or near the cursor that has the mark
  let targetIndex = index;
  if (targetIndex >= parent.childCount) {
    targetIndex = parent.childCount - 1;
  }
  if (targetIndex < 0) return null;

  const child = parent.child(targetIndex);
  if (!markType.isInSet(child.marks)) {
    // Check previous child (cursor might be at boundary)
    if (targetIndex > 0) {
      const prevChild = parent.child(targetIndex - 1);
      if (markType.isInSet(prevChild.marks)) {
        targetIndex = targetIndex - 1;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  // Walk backward from targetIndex to find start
  let from = parentStart;
  for (let i = 0; i < targetIndex; i++) {
    from += parent.child(i).nodeSize;
  }
  for (let i = targetIndex - 1; i >= 0; i--) {
    const c = parent.child(i);
    if (!markType.isInSet(c.marks)) break;
    from -= c.nodeSize;
  }

  // Walk forward from targetIndex to find end
  let to = parentStart;
  for (let i = 0; i <= targetIndex; i++) {
    to += parent.child(i).nodeSize;
  }
  for (let i = targetIndex + 1; i < parent.childCount; i++) {
    const c = parent.child(i);
    if (!markType.isInSet(c.marks)) break;
    to += c.nodeSize;
  }

  return { from, to };
}
