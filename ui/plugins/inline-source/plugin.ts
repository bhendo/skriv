import type { Node, MarkType } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { buildRawText, computePrefixLength, SUPPORTED_MARKS } from "./syntax";

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

export function handleInlineSourceTransition(
  _transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState
): Transaction | null {
  // Only act if selection or doc changed
  const selectionChanged = !oldState.selection.eq(newState.selection);
  const docChanged = !oldState.doc.eq(newState.doc);
  if (!selectionChanged && !docChanged) return null;

  // Only handle cursor selections (not range selections)
  const sel = newState.selection as TextSelection;
  if (!sel.$cursor) return null;
  const $cursor = sel.$cursor;

  const schema = newState.schema;
  const inlineSourceType = schema.nodes.inline_source;
  if (!inlineSourceType) return null;

  // If cursor is already inside an inline_source node, no transition needed
  if ($cursor.parent.type === inlineSourceType) return null;

  // TODO: LEAVE logic will go here in Task 7

  // ENTER: Check if cursor is adjacent to a supported mark
  const nodeBefore = $cursor.nodeBefore;
  const nodeAfter = $cursor.nodeAfter;
  const marksBefore = nodeBefore?.marks ?? [];
  const marksAfter = nodeAfter?.marks ?? [];

  // Find a supported mark at cursor position (left-biased)
  let targetMarkType = null;
  for (const markName of SUPPORTED_MARKS) {
    const markType = schema.marks[markName];
    if (!markType) continue;
    if (markType.isInSet(marksBefore) || markType.isInSet(marksAfter)) {
      targetMarkType = markType;
      break;
    }
  }

  if (!targetMarkType) return null;

  // Find the full extent of the mark span
  const span = findMarkSpan(newState.doc, $cursor.pos, targetMarkType);
  if (!span) return null;

  // Collect ALL supported mark names on the text at this span
  const $spanStart = newState.doc.resolve(span.from);
  const firstChild = $spanStart.nodeAfter;
  if (!firstChild) return null;

  const markNames = firstChild.marks
    .map((m) => m.type.name)
    .filter((name) => SUPPORTED_MARKS.includes(name));

  if (markNames.length === 0) return null;

  // Build raw text with syntax markers
  const textContent = newState.doc.textBetween(span.from, span.to);
  const rawText = buildRawText(textContent, markNames);

  // Create inline_source node
  const inlineSource = inlineSourceType.create(
    { syntax: markNames.join(",") },
    schema.text(rawText)
  );

  // Build transaction (non-historical — presentation change only)
  const tr = newState.tr;
  tr.replaceWith(span.from, span.to, inlineSource);
  tr.setMeta("addToHistory", false);

  // Map cursor position: offset in rendered text -> offset in raw text
  const prefixLength = computePrefixLength(markNames);
  const offsetInSpan = $cursor.pos - span.from;
  const offsetInRaw = offsetInSpan + prefixLength;

  // inline_source node content starts at span.from + 1 (after node open)
  const contentStart = span.from + 1;
  const newCursorPos = Math.min(contentStart + offsetInRaw, contentStart + rawText.length);
  tr.setSelection(TextSelection.create(tr.doc, newCursorPos));

  return tr;
}
