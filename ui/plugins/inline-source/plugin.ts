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
import { findFirstNodeOfType } from "../block-source/cursor";
import {
  buildRawText,
  computePrefixLength,
  computeSuffixLength,
  findTrailingSplit,
  MARK_SYNTAX,
  parseInlineSyntax,
  SUPPORTED_MARKS,
} from "./syntax";

/** Build Mark[] from mark names, filtering any that don't exist in the schema. */
function createMarks(schema: { marks: Record<string, MarkType> }, markNames: string[]): Mark[] {
  return markNames.map((name) => schema.marks[name]?.create()).filter((m): m is Mark => m != null);
}

/**
 * Replace an inline_source node with its parsed marked text (or plain
 * text if the syntax is incomplete).  Shared by the LEAVE path in
 * handleInlineSourceTransition and the backspace-exit handler.
 *
 * Returns false if the node was empty and was deleted instead.
 */
export function leaveInlineSource(
  tr: Transaction,
  schema: EditorState["schema"],
  nodeFrom: number,
  nodeTo: number,
  raw: string
): boolean {
  if (!raw) {
    tr.delete(nodeFrom, nodeTo);
    return false;
  }
  const parsed = parseInlineSyntax(raw);
  if (parsed.marks.length > 0) {
    const marks = createMarks(schema, parsed.marks);
    tr.replaceWith(nodeFrom, nodeTo, schema.text(parsed.text, marks));
  } else {
    tr.replaceWith(nodeFrom, nodeTo, schema.text(raw));
  }
  return true;
}

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
  const selectionChanged = !oldState.selection.eq(newState.selection);
  const docChanged = !oldState.doc.eq(newState.doc);
  if (!selectionChanged && !docChanged) return null;

  const schema = newState.schema;
  const inlineSourceType = schema.nodes.inline_source;
  if (!inlineSourceType) return null;

  const sel = newState.selection as TextSelection;
  const $cursor = sel.$cursor;

  // If cursor is inside an inline_source node, check for trailing text
  // past the closing syntax markers (e.g. "**test** x" — the " x" is trailing).
  // If found, split the node: syntax portion becomes marked text, trailing
  // text becomes plain text in the parent.
  if ($cursor && $cursor.parent.type === inlineSourceType) {
    const raw = $cursor.parent.textContent;
    const split = findTrailingSplit(raw);
    if (!split) return null;

    // Find the position of the inline_source node in the document
    const nodeStart = $cursor.start() - 1; // -1 for the node open token
    const nodeEnd = nodeStart + $cursor.parent.nodeSize;

    const tr = newState.tr;

    // Build the marked text node from the syntax portion
    const markedNode = schema.text(split.innerText, createMarks(schema, split.marks));
    const trailingNode = schema.text(split.trailing);

    tr.replaceWith(nodeStart, nodeEnd, [markedNode, trailingNode]);

    // Position cursor at the end of the trailing text
    // After replacement: nodeStart is where markedNode starts,
    // trailingNode starts at nodeStart + markedNode.nodeSize
    const cursorPos = nodeStart + markedNode.nodeSize + trailingNode.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, cursorPos));

    tr.setMeta("addToHistory", false);
    return tr;
  }

  // LEAVE runs for any selection type (cursor, range, node, all) so that
  // non-cursor selections outside the node trigger leave (#34).
  const found = findFirstNodeOfType(newState.doc, "inline_source");

  if (found) {
    const nodeFrom = found.pos;
    const nodeTo = found.pos + found.node.nodeSize;

    // If selection is still inside the inline_source node, skip leave.
    // Strict inequality: nodeFrom/nodeTo are positions before the opening
    // and after the closing tokens — those positions are outside the node.
    if (sel.from > nodeFrom && sel.to < nodeTo) return null;

    const tr = newState.tr;
    leaveInlineSource(tr, schema, nodeFrom, nodeTo, found.node.textContent);
    tr.setMeta("addToHistory", false);
    return tr;
  }

  // ENTER requires a collapsed cursor and a selection-only change.
  // When the document changed (input rules, structural lifts, undo/redo),
  // skip ENTER to prevent source mode activating during typing and to
  // break ENTER-LEAVE cycles (#38).  The plugin wrapper additionally
  // suppresses ENTER via an early return for DOM-observer reconciliation
  // transactions that follow doc changes.
  if (!$cursor || docChanged) return null;

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

  const nodeStart = $from.start();
  const nodeEnd = nodeStart + parent.content.size;

  const hasSelection = $from.pos !== $to.pos && $to.parentOffset !== $from.parentOffset;

  // Resolve the text range to operate on
  const from = hasSelection ? $from.pos : nodeStart;
  const to = hasSelection ? $to.pos : nodeEnd;
  const text = state.doc.textBetween(from, to);

  const tr = state.tr;
  if (isWrappedWith(text, marker)) {
    tr.replaceWith(from, to, state.schema.text(text.slice(marker.length, -marker.length)));
  } else {
    tr.replaceWith(from, to, state.schema.text(marker + text + marker));
  }
  view.dispatch(tr);
}

/**
 * Build inline decorations that apply the `syntax-marker` CSS class to the
 * prefix and suffix marker characters inside every `inline_source` node.
 */
export function buildMarkerDecorations(state: EditorState): DecorationSet {
  const inlineSourceType = state.schema.nodes.inline_source;
  if (!inlineSourceType) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type === inlineSourceType) {
      // Derive prefix/suffix from actual text content (#35) so decorations
      // stay correct even when attrs.syntax is stale after a toggle.
      const parsed = parseInlineSyntax(node.textContent);
      const prefixLen = computePrefixLength(parsed.marks);
      const suffixLen = computeSuffixLength(parsed.marks);

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

/** Map of keyboard shortcut keys to their syntax markers. */
const SHORTCUT_MAP: Record<string, { marker: string; needsAlt?: boolean }> = {
  b: { marker: MARK_SYNTAX.strong.prefix },
  i: { marker: MARK_SYNTAX.emphasis.prefix },
  e: { marker: MARK_SYNTAX.inlineCode.prefix },
  x: { marker: MARK_SYNTAX.strike_through.prefix, needsAlt: true },
};

const inlineSourcePluginKey = new PluginKey("inline-source");

/** Keys that represent intentional cursor navigation. */
const NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const inlineSourcePlugin = $prose((_ctx) => {
  let composing = false;

  // Suppress ENTER after doc changes until the user deliberately navigates.
  // ProseMirror's DOM observer fires selection-only transactions after
  // input-rule conversions; without this flag those would trigger ENTER
  // and flash source mode immediately after typing (**text**) (#38).
  let suppressEnter = false;

  return new Plugin({
    key: inlineSourcePluginKey,
    state: {
      init(_, state) {
        return buildMarkerDecorations(state);
      },
      apply(tr, oldDecorations, _oldState, newState) {
        if (tr.docChanged) {
          return buildMarkerDecorations(newState);
        }
        return oldDecorations;
      },
    },
    appendTransaction(transactions, oldState, newState) {
      if (composing) return null;
      const docChanged = !oldState.doc.eq(newState.doc);
      if (docChanged) suppressEnter = true;
      // When suppressEnter is active, only allow LEAVE and SPLIT
      // transitions (which handle existing inline_source nodes).
      // Skip the call entirely when there is no inline_source to
      // clean up and ENTER would be the only possible outcome.
      if (suppressEnter && !docChanged) {
        if (!findFirstNodeOfType(newState.doc, "inline_source")) return null;
      }
      return handleInlineSourceTransition(transactions, oldState, newState);
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handleTextInput(view: EditorView, from: number, to: number, text: string) {
        // When typing inside an inline_source node, insert text directly
        // to bypass Milkdown/ProseMirror input rules.  Without this,
        // input rules pattern-match on the raw syntax (e.g. **bold**)
        // and try to apply marks, but the node's marks:"" spec strips
        // them, destroying the asterisks (#38).
        const $from = view.state.doc.resolve(from);
        const inlineSourceType = view.state.schema.nodes.inline_source;
        if (inlineSourceType && $from.parent.type === inlineSourceType) {
          view.dispatch(view.state.tr.insertText(text, from, to));
          return true;
        }
        return false;
      },
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        // Navigation keys indicate intentional cursor movement — allow ENTER.
        if (NAV_KEYS.has(event.key)) suppressEnter = false;

        const inlineSourceType = view.state.schema.nodes.inline_source;
        if (!inlineSourceType) return false;

        const { $from } = view.state.selection;

        // Backspace at the start of inline_source content: exit source
        // mode first (restore marks) so the subsequent paragraph join
        // preserves formatting instead of leaking raw syntax (#38).
        if (
          event.key === "Backspace" &&
          $from.parent.type === inlineSourceType &&
          $from.parentOffset === 0
        ) {
          const nodeStart = $from.start() - 1;
          const nodeEnd = nodeStart + $from.parent.nodeSize;
          const tr = view.state.tr;
          leaveInlineSource(tr, view.state.schema, nodeStart, nodeEnd, $from.parent.textContent);
          tr.setSelection(TextSelection.create(tr.doc, nodeStart));
          tr.setMeta("addToHistory", false);
          view.dispatch(tr);
          // Return false so ProseMirror's keymap handles the backspace
          // (e.g. joinBackward) on the now-mark-restored state.
          return false;
        }

        if ($from.parent.type !== inlineSourceType) return false;

        if (!(event.metaKey || event.ctrlKey)) return false;

        const shortcut = SHORTCUT_MAP[event.key];
        if (!shortcut) return false;
        if (shortcut.needsAlt && !event.altKey) return false;

        event.preventDefault();
        toggleSyntaxInRawText(view, shortcut.marker);
        return true;
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
        mousedown: () => {
          suppressEnter = false;
          return false;
        },
      },
    },
  });
});
