import { $prose } from "@milkdown/utils";
import type { Node } from "@milkdown/kit/prose/model";
import { Fragment } from "@milkdown/kit/prose/model";
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { buildHeadingPrefix, parseHeadingPrefix, stripPrefix } from "./syntax";
import { findAncestorOfType, findFirstNodeOfType } from "../block-source/cursor";
import { makeDecorationPlugin } from "../block-source/decoration";

export function handleHeadingSourceTransition(
  _transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState
): Transaction | null {
  const selectionChanged = !oldState.selection.eq(newState.selection);
  const docChanged = !oldState.doc.eq(newState.doc);
  if (!selectionChanged && !docChanged) return null;

  const schema = newState.schema;
  const headingSourceType = schema.nodes.heading_source;
  const headingType = schema.nodes.heading;
  if (!headingSourceType || !headingType) return null;

  const sel = newState.selection as TextSelection;
  const $cursor = sel.$cursor;

  // If cursor is inside heading_source, check for live update only
  if ($cursor && $cursor.parent.type === headingSourceType) {
    if (!docChanged) return null;
    return handleLiveUpdate($cursor.parent, $cursor.before(), newState);
  }

  // LEAVE runs for any selection type (matching inline_source pattern)
  const found = findFirstNodeOfType(newState.doc, "heading_source");

  if (found) {
    const nodeFrom = found.pos;
    const nodeTo = found.pos + found.node.nodeSize;

    // If selection is still inside the heading_source, skip leave
    if (sel.from >= nodeFrom && sel.to <= nodeTo) {
      if (docChanged) {
        return handleLiveUpdate(found.node, nodeFrom, newState);
      }
      return null;
    }

    return leaveHeadingSource(found.node, nodeFrom, newState);
  }

  // ENTER requires a collapsed cursor
  if (!$cursor) return null;

  // Already in heading_source — no enter needed
  if (findAncestorOfType(newState, "heading_source")) return null;

  // Check if cursor is in a heading block
  const ancestor = findAncestorOfType(newState, "heading");
  if (ancestor) {
    return enterHeadingSource(ancestor.node, ancestor.pos, $cursor.pos, newState);
  }

  return null;
}

function enterHeadingSource(
  headingNode: Node,
  headingPos: number,
  cursorPos: number,
  state: EditorState
): Transaction {
  const schema = state.schema;
  const headingSourceType = schema.nodes.heading_source;
  const level = headingNode.attrs.level as number;
  const id = (headingNode.attrs.id as string) || "";

  const prefix = buildHeadingPrefix(level);
  const prefixTextNode = schema.text(prefix);

  // Build content: prefix text + original heading content
  const children: Node[] = [prefixTextNode];
  headingNode.content.forEach((child) => children.push(child));
  const content = Fragment.from(children);

  const hsNode = headingSourceType.create({ level, id }, content);

  const tr = state.tr;
  const headingEnd = headingPos + headingNode.nodeSize;
  tr.replaceWith(headingPos, headingEnd, hsNode);

  // Map cursor position: shift right by prefix length
  const contentStart = headingPos + 1; // after block open token
  const offsetInHeading = cursorPos - contentStart;
  const newCursorPos = contentStart + prefix.length + offsetInHeading;
  tr.setSelection(TextSelection.create(tr.doc, newCursorPos));
  tr.setMeta("addToHistory", false);

  return tr;
}

function leaveHeadingSource(hsNode: Node, hsPos: number, state: EditorState): Transaction {
  const schema = state.schema;
  const headingType = schema.nodes.heading;
  const paragraphType = schema.nodes.paragraph;

  const text = hsNode.textContent;
  const parsed = parseHeadingPrefix(text);

  const tr = state.tr;
  const hsEnd = hsPos + hsNode.nodeSize;

  let replacement: Node;
  if (parsed) {
    const strippedContent = stripPrefix(hsNode.content, parsed.contentStart, schema);
    if (strippedContent.size === 0) {
      replacement = headingType.create({ level: parsed.level, id: hsNode.attrs.id }, null);
    } else {
      replacement = headingType.create(
        { level: parsed.level, id: hsNode.attrs.id },
        strippedContent
      );
    }
  } else {
    // No # prefix — convert to paragraph
    const content = hsNode.content;
    // Strip leading space if present
    const firstText = content.firstChild;
    if (firstText?.isText && firstText.text?.startsWith(" ")) {
      const trimmedContent = stripPrefix(content, 1, schema);
      replacement = paragraphType.create(null, trimmedContent.size > 0 ? trimmedContent : null);
    } else {
      replacement = paragraphType.create(null, content.size > 0 ? content : null);
    }
  }

  tr.replaceWith(hsPos, hsEnd, replacement);
  tr.setMeta("addToHistory", false);

  return tr;
}

function handleLiveUpdate(hsNode: Node, hsPos: number, state: EditorState): Transaction | null {
  const text = hsNode.textContent;
  const parsed = parseHeadingPrefix(text);
  const currentLevel = hsNode.attrs.level as number;

  const newLevel = parsed ? parsed.level : currentLevel;
  if (newLevel === currentLevel) return null;

  const tr = state.tr;
  tr.setNodeMarkup(hsPos, undefined, {
    ...hsNode.attrs,
    level: newLevel,
  });
  tr.setMeta("addToHistory", false);

  return tr;
}

export function buildHeadingPrefixDecorations(state: EditorState): DecorationSet {
  const headingSourceType = state.schema.nodes.heading_source;
  if (!headingSourceType) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type === headingSourceType) {
      const text = node.textContent;
      const parsed = parseHeadingPrefix(text);
      if (parsed) {
        const prefixLen = parsed.contentStart;
        const contentStart = pos + 1;
        decorations.push(
          Decoration.inline(contentStart, contentStart + prefixLen, {
            class: "syntax-marker",
          })
        );
      }
      return false;
    }
    return true;
  });

  return DecorationSet.create(state.doc, decorations);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const headingSourceDecoPlugin = $prose((_ctx) =>
  makeDecorationPlugin("heading-source-deco", buildHeadingPrefixDecorations)
);

const headingSourceBehaviorKey = new PluginKey("heading-source-behavior");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const headingSourceBehaviorPlugin = $prose((_ctx) => {
  let composing = false;

  return new Plugin({
    key: headingSourceBehaviorKey,
    appendTransaction(transactions, oldState, newState) {
      if (composing) return null;
      return handleHeadingSourceTransition(transactions, oldState, newState);
    },
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Enter") return false;

        const headingSourceType = view.state.schema.nodes.heading_source;
        if (!headingSourceType) return false;

        const sel = view.state.selection as TextSelection;
        const $cursor = sel.$cursor;
        if (!$cursor) return false;

        const ancestor = findAncestorOfType(view.state, "heading_source");
        if (!ancestor) return false;

        const hsPos = ancestor.pos;
        const hsNode = ancestor.node;

        const leaveTr = leaveHeadingSource(hsNode, hsPos, view.state);
        view.dispatch(leaveTr);

        const afterLeaveState = view.state;
        const restoredNode = afterLeaveState.doc.nodeAt(hsPos);
        if (!restoredNode) return true;
        const insertPos = hsPos + restoredNode.nodeSize;
        const paragraphType = afterLeaveState.schema.nodes.paragraph;
        const insertTr = afterLeaveState.tr;
        insertTr.insert(insertPos, paragraphType.create());
        insertTr.setSelection(TextSelection.create(insertTr.doc, insertPos + 1));
        view.dispatch(insertTr);

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
      },
    },
  });
});

export const headingSourcePlugin = [headingSourceDecoPlugin, headingSourceBehaviorPlugin].flat();
