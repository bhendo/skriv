import { $prose } from "@milkdown/utils";
import type { Node, Mark, MarkType } from "@milkdown/kit/prose/model";
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  buildRawText,
  computePrefixLength,
  MARK_SYNTAX,
  parseInlineSyntax,
  SUPPORTED_MARKS,
} from "./syntax";

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

  // LEAVE: Check if there's an inline_source node elsewhere that cursor has left
  let inlineSourcePos: number | null = null;
  let inlineSourceNode: Node | null = null;
  newState.doc.descendants((node, pos) => {
    if (node.type === inlineSourceType) {
      inlineSourcePos = pos;
      inlineSourceNode = node;
      return false; // stop traversal
    }
    return true;
  });

  if (inlineSourcePos !== null && inlineSourceNode !== null) {
    const raw = (inlineSourceNode as Node).textContent;
    const nodeFrom = inlineSourcePos;
    const nodeTo = inlineSourcePos + (inlineSourceNode as Node).nodeSize;

    const tr = newState.tr;

    if (!raw) {
      // Empty content — just remove the node
      tr.delete(nodeFrom, nodeTo);
    } else {
      const parsed = parseInlineSyntax(raw);
      if (parsed.marks.length > 0) {
        // Reconstruct marked text
        const marks = parsed.marks
          .map((name) => schema.marks[name]?.create())
          .filter((m): m is Mark => m != null);
        const textNode = schema.text(parsed.text, marks);
        tr.replaceWith(nodeFrom, nodeTo, textNode);
      } else {
        // No valid syntax — insert as plain text
        const textNode = schema.text(raw);
        tr.replaceWith(nodeFrom, nodeTo, textNode);
      }
    }

    tr.setMeta("addToHistory", false);
    return tr;
  }

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

  // Collect supported mark names from the first text node in the span.
  // v1 only handles same-boundary marks (all marks share start/end positions),
  // so inspecting the first child is sufficient. Overlapping marks with different
  // boundaries are out of scope — see design doc for future phases.
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

/**
 * Check whether `text` is wrapped with the given `marker` (e.g. `**`)
 * without being wrapped with a longer run of the same character
 * (e.g. `**hello**` is NOT considered wrapped with `*`).
 */
export function isWrappedWith(text: string, marker: string): boolean {
  if (!text.startsWith(marker) || !text.endsWith(marker)) return false;
  if (text.length <= marker.length * 2) return false;
  const markerChar = marker[0];
  const afterPrefix = text[marker.length];
  const beforeSuffix = text[text.length - marker.length - 1];
  // If the char adjacent to the marker is the same char, it's a longer marker
  if (afterPrefix === markerChar) return false;
  if (beforeSuffix === markerChar) return false;
  return true;
}

/**
 * Toggle markdown syntax markers around the raw text inside an inline_source
 * node that contains the current selection / cursor.
 *
 * - If there is a text selection within the node, wrap/unwrap that selection.
 * - If the cursor is collapsed (no selection), wrap/unwrap the entire node text.
 */
export function toggleSyntaxInRawText(view: EditorView, marker: string): void {
  const { state } = view;
  const { $from, $to } = state.selection;
  const parent = $from.parent;

  const nodeStart = $from.start(); // start of parent content
  const nodeEnd = nodeStart + parent.content.size;

  const hasSelection = $from.pos !== $to.pos && $to.parentOffset !== $from.parentOffset;

  if (hasSelection) {
    // Operate on the selected range within the node
    const selFrom = $from.pos;
    const selTo = $to.pos;
    const selectedText = state.doc.textBetween(selFrom, selTo);

    const tr = state.tr;
    if (isWrappedWith(selectedText, marker)) {
      const unwrapped = selectedText.slice(marker.length, -marker.length);
      tr.replaceWith(selFrom, selTo, state.schema.text(unwrapped));
    } else {
      const wrapped = marker + selectedText + marker;
      tr.replaceWith(selFrom, selTo, state.schema.text(wrapped));
    }
    view.dispatch(tr);
  } else {
    // No selection — operate on entire node text
    const rawText = parent.textContent;

    const tr = state.tr;
    if (isWrappedWith(rawText, marker)) {
      const unwrapped = rawText.slice(marker.length, -marker.length);
      tr.replaceWith(nodeStart, nodeEnd, state.schema.text(unwrapped));
    } else {
      const wrapped = marker + rawText + marker;
      tr.replaceWith(nodeStart, nodeEnd, state.schema.text(wrapped));
    }
    view.dispatch(tr);
  }
}

/**
 * Build inline decorations that apply the `syntax-marker` CSS class to the
 * prefix and suffix marker characters inside every `inline_source` node.
 *
 * For example, in an `inline_source` with syntax="strong" containing
 * `**bold**`, decorations cover positions 0–2 (prefix `**`) and 6–8
 * (suffix `**`) within the node content.
 */
export function buildMarkerDecorations(state: EditorState): DecorationSet {
  const inlineSourceType = state.schema.nodes.inline_source;
  if (!inlineSourceType) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type === inlineSourceType) {
      const syntax = node.attrs.syntax as string;
      const markNames = syntax ? syntax.split(",") : [];

      let prefixLen = 0;
      let suffixLen = 0;
      for (const name of markNames) {
        const s = MARK_SYNTAX[name];
        if (s) {
          prefixLen += s.prefix.length;
          suffixLen += s.suffix.length;
        }
      }

      const contentStart = pos + 1; // after node open token
      const contentEnd = pos + node.nodeSize - 1; // before node close token

      if (prefixLen > 0 && contentStart + prefixLen <= contentEnd) {
        decorations.push(
          Decoration.inline(contentStart, contentStart + prefixLen, {
            class: "syntax-marker",
          })
        );
      }
      if (suffixLen > 0 && contentEnd - suffixLen >= contentStart) {
        decorations.push(
          Decoration.inline(contentEnd - suffixLen, contentEnd, {
            class: "syntax-marker",
          })
        );
      }

      return false; // don't descend into inline_source
    }
    return true;
  });

  return DecorationSet.create(state.doc, decorations);
}

const inlineSourcePluginKey = new PluginKey("inline-source");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const inlineSourcePlugin = $prose((_ctx) => {
  let composing = false;

  return new Plugin({
    key: inlineSourcePluginKey,
    state: {
      init(_, state) {
        return buildMarkerDecorations(state);
      },
      apply(tr, oldDecorations, _oldState, newState) {
        if (tr.docChanged || tr.selectionSet) {
          return buildMarkerDecorations(newState);
        }
        return oldDecorations;
      },
    },
    appendTransaction(transactions, oldState, newState) {
      if (composing) return null;
      return handleInlineSourceTransition(transactions, oldState, newState);
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (!(event.metaKey || event.ctrlKey)) return false;

        const inlineSourceType = view.state.schema.nodes.inline_source;
        if (!inlineSourceType) return false;

        const { $from } = view.state.selection;
        if ($from.parent.type !== inlineSourceType) return false;

        if (event.key === "b") {
          event.preventDefault();
          toggleSyntaxInRawText(view, "**");
          return true;
        }
        if (event.key === "i") {
          event.preventDefault();
          toggleSyntaxInRawText(view, "*");
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        compositionstart: () => {
          composing = true;
          return false;
        },
        compositionend: () => {
          composing = false;
          return false;
        },
      },
    },
  });
});
