import { $prose } from "@milkdown/utils";
import type { Node, Mark, MarkType } from "@milkdown/kit/prose/model";
import { createMarks, NAV_KEYS } from "../shared/marks";
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { inputRules, InputRule } from "@milkdown/kit/prose/inputrules";
import { findFirstNodeOfType } from "../block-source/cursor";
import { makeDecorationPlugin } from "../block-source/decoration";
import { leaveInlineSource } from "../inline-source/plugin";
import {
  buildRawText,
  parseInlineSyntax,
  SUPPORTED_MARKS,
  computePrefixLength,
} from "../inline-source/syntax";
import {
  buildLinkRawText,
  findLinkTrailingSplit,
  LINK_INPUT_RULE_REGEX,
  normalizeHref,
  parseLinkSyntax,
} from "./syntax";

/** Create a text node with a link mark and optional inner marks from raw link text. */
function createLinkTextNode(
  schema: EditorState["schema"],
  linkText: string,
  href: string
): { node: Node; linkMarkType: MarkType } | null {
  const linkMarkType = schema.marks.link;
  if (!linkMarkType) return null;
  const innerParsed = parseInlineSyntax(linkText);
  const linkMark = linkMarkType.create({ href, title: null });
  const marks: Mark[] = [linkMark];
  if (innerParsed.marks.length > 0) {
    marks.push(...createMarks(schema, innerParsed.marks));
  }
  const displayText = innerParsed.marks.length > 0 ? innerParsed.text : linkText;
  return { node: schema.text(displayText, marks), linkMarkType };
}

/**
 * Find the extent of a link mark span at `pos`, matching by `targetHref`.
 * Two adjacent link marks with different `href` values are separate spans.
 */
export function findLinkSpan(
  doc: Node,
  pos: number,
  linkMarkType: MarkType,
  targetHref: string
): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;

  if (!parent.isTextblock) return null;

  const parentStart = $pos.start();
  const index = $pos.index();

  // Find the child at or near the cursor that has the link mark with matching href
  let targetIndex = index;
  if (targetIndex >= parent.childCount) {
    targetIndex = parent.childCount - 1;
  }
  if (targetIndex < 0) return null;

  function hasMatchingLink(node: Node): boolean {
    const linkMark = linkMarkType.isInSet(node.marks);
    return linkMark != null && linkMark.attrs.href === targetHref;
  }

  const child = parent.child(targetIndex);
  if (!hasMatchingLink(child)) {
    // Check previous child (cursor might be at boundary)
    if (targetIndex > 0) {
      const prevChild = parent.child(targetIndex - 1);
      if (hasMatchingLink(prevChild)) {
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
    if (!hasMatchingLink(c)) break;
    from -= c.nodeSize;
  }

  // Walk forward from targetIndex to find end
  let to = parentStart;
  for (let i = 0; i <= targetIndex; i++) {
    to += parent.child(i).nodeSize;
  }
  for (let i = targetIndex + 1; i < parent.childCount; i++) {
    const c = parent.child(i);
    if (!hasMatchingLink(c)) break;
    to += c.nodeSize;
  }

  return { from, to };
}

/**
 * Replace a `link_source` node with parsed content. Exported for cross-plugin use.
 *
 * - If raw text parses as valid link -> create text node with `link` mark (and inner marks via `parseInlineSyntax`)
 * - If raw text is invalid but fallbackHref exists -> create text with link mark from fallback attrs
 * - If empty -> delete the node
 * - Otherwise -> plain text
 *
 * Returns false if the node was empty and was deleted instead.
 */
export function leaveLinkSource(
  tr: Transaction,
  schema: EditorState["schema"],
  nodeFrom: number,
  nodeTo: number,
  raw: string,
  fallbackHref: string,
  fallbackTitle: string
): boolean {
  if (!raw) {
    tr.delete(nodeFrom, nodeTo);
    return false;
  }

  const parsed = parseLinkSyntax(raw);
  if (parsed) {
    // Valid link syntax: create text with link mark (and inner marks)
    const linkMark = schema.marks.link.create({
      href: parsed.href,
      title: parsed.title || null,
    });
    const innerParsed = parseInlineSyntax(parsed.text);
    const marks: Mark[] = [linkMark];
    if (innerParsed.marks.length > 0) {
      marks.push(...createMarks(schema, innerParsed.marks));
    }
    const textContent = innerParsed.marks.length > 0 ? innerParsed.text : parsed.text;
    tr.replaceWith(nodeFrom, nodeTo, schema.text(textContent, marks));
  } else if (fallbackHref && !raw.includes("](")) {
    // Truly broken syntax (no link structure at all) but has fallback href.
    // If the raw text still has [...]( structure, the user was intentionally
    // editing the link syntax (e.g., cleared the URL) — don't use fallback.
    const linkMark = schema.marks.link.create({
      href: fallbackHref,
      title: fallbackTitle || null,
    });
    tr.replaceWith(nodeFrom, nodeTo, schema.text(raw, [linkMark]));
  } else {
    // No valid link data: plain text
    tr.replaceWith(nodeFrom, nodeTo, schema.text(raw));
  }

  return true;
}

/**
 * Check whether all text nodes in a span share the same set of non-link marks.
 * Returns the shared mark names (excluding link), or null if they differ.
 */
function getSharedInnerMarks(
  doc: Node,
  from: number,
  to: number,
  linkMarkType: MarkType
): string[] | null {
  const $from = doc.resolve(from);
  const parent = $from.parent;
  const parentStart = $from.start();

  let offset = parentStart;
  let sharedNames: string[] | null = null;

  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childEnd = offset + child.nodeSize;

    if (childEnd <= from) {
      offset = childEnd;
      continue;
    }
    if (offset >= to) break;

    // This child overlaps the span
    const nonLinkMarks = child.marks
      .filter((m) => m.type !== linkMarkType)
      .map((m) => m.type.name)
      .filter((name) => SUPPORTED_MARKS.includes(name))
      .sort();

    const key = nonLinkMarks.join(",");

    if (sharedNames === null) {
      sharedNames = nonLinkMarks;
    } else if (sharedNames.join(",") !== key) {
      return null; // different mark sets -> skip enter
    }

    offset = childEnd;
  }

  return sharedNames ?? [];
}

/**
 * The `appendTransaction` handler for link source mode transitions.
 *
 * Three phases:
 * 1. Inside link_source (trailing split)
 * 2. LEAVE: cursor moved outside existing link_source
 * 3. ENTER: collapsed cursor near a link mark -> replace with link_source node
 */
export function handleLinkSourceTransition(
  _transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState
): Transaction | null {
  const selectionChanged = !oldState.selection.eq(newState.selection);
  const docChanged = !oldState.doc.eq(newState.doc);
  if (!selectionChanged && !docChanged) return null;

  const schema = newState.schema;
  const linkSourceType = schema.nodes.link_source;
  if (!linkSourceType) return null;

  const sel = newState.selection as TextSelection;
  const $cursor = sel.$cursor;

  // Phase 1: Inside link_source — check for trailing split
  if ($cursor && $cursor.parent.type === linkSourceType) {
    const raw = $cursor.parent.textContent;
    const split = findLinkTrailingSplit(raw);
    if (!split) return null;

    const nodeStart = $cursor.start() - 1; // -1 for node open token
    const nodeEnd = nodeStart + $cursor.parent.nodeSize;

    const tr = newState.tr;

    const linkMark = schema.marks.link.create({
      href: split.href,
      title: split.title || null,
    });
    const innerParsed = parseInlineSyntax(split.text);
    const marks: Mark[] = [linkMark];
    if (innerParsed.marks.length > 0) {
      marks.push(...createMarks(schema, innerParsed.marks));
    }
    const displayText = innerParsed.marks.length > 0 ? innerParsed.text : split.text;
    const markedNode = schema.text(displayText, marks);
    const trailingNode = schema.text(split.trailing);

    tr.replaceWith(nodeStart, nodeEnd, [markedNode, trailingNode]);

    const cursorPos = nodeStart + markedNode.nodeSize + trailingNode.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, cursorPos));

    tr.setMeta("addToHistory", false);
    return tr;
  }

  // Phase 2: LEAVE — runs for any selection type so non-cursor selections trigger leave
  const found = findFirstNodeOfType(newState.doc, "link_source");

  if (found) {
    const nodeFrom = found.pos;
    const nodeTo = found.pos + found.node.nodeSize;

    // If selection is still inside the link_source node, skip leave.
    if (sel.from > nodeFrom && sel.to < nodeTo) return null;

    const tr = newState.tr;
    const fallbackHref = found.node.attrs.href as string;
    const fallbackTitle = found.node.attrs.title as string;
    leaveLinkSource(
      tr,
      schema,
      nodeFrom,
      nodeTo,
      found.node.textContent,
      fallbackHref,
      fallbackTitle
    );
    // Clear link mark from stored marks so subsequent typing doesn't
    // extend the link (ProseMirror inherits marks at the boundary).
    const linkMT = schema.marks.link;
    if (linkMT) {
      tr.setStoredMarks((tr.storedMarks ?? []).filter((m) => m.type !== linkMT));
    }
    tr.setMeta("addToHistory", false);
    return tr;
  }

  // Phase 3: ENTER — requires collapsed cursor and selection-only change
  if (!$cursor || docChanged) return null;

  const linkMarkType = schema.marks.link;
  if (!linkMarkType) return null;

  // Check if cursor is adjacent to a link mark
  const nodeBefore = $cursor.nodeBefore;
  const nodeAfter = $cursor.nodeAfter;
  const marksBefore = nodeBefore?.marks ?? [];
  const marksAfter = nodeAfter?.marks ?? [];

  // Find a link mark at cursor position (left-biased)
  const linkBefore = linkMarkType.isInSet(marksBefore);
  const linkAfter = linkMarkType.isInSet(marksAfter);
  const targetLink = linkBefore ?? linkAfter;

  if (!targetLink) return null;

  const targetHref = targetLink.attrs.href as string;

  // Find the full extent of the link span
  const span = findLinkSpan(newState.doc, $cursor.pos, linkMarkType, targetHref);
  if (!span) return null;

  // Same-boundary inner mark check: only enter source mode when all text nodes
  // in the link span share the same set of non-link marks.
  const sharedInnerMarks = getSharedInnerMarks(newState.doc, span.from, span.to, linkMarkType);
  if (sharedInnerMarks === null) return null; // different mark sets -> skip (deferred to #31)

  // Leave any existing inline_source first (cross-node coordination)
  const inlineSourceFound = findFirstNodeOfType(newState.doc, "inline_source");
  const tr = newState.tr;
  let adjustedFrom = span.from;
  let adjustedTo = span.to;

  if (inlineSourceFound) {
    const isNodeFrom = inlineSourceFound.pos;
    const isNodeTo = inlineSourceFound.pos + inlineSourceFound.node.nodeSize;
    leaveInlineSource(tr, schema, isNodeFrom, isNodeTo, inlineSourceFound.node.textContent);
    tr.setMeta("addToHistory", false);

    // Remap span positions through the transaction's mapping to account for
    // size changes from leaving inline_source (node open/close tokens removed,
    // content size may change if marks were restored).
    adjustedFrom = tr.mapping.map(span.from);
    adjustedTo = tr.mapping.map(span.to);
  }

  // Build raw text
  const textContent = tr.doc.textBetween(adjustedFrom, adjustedTo);
  const title = targetLink.attrs.title as string;
  const rawText = buildLinkRawText(
    sharedInnerMarks.length > 0 ? buildRawText(textContent, sharedInnerMarks) : textContent,
    targetHref,
    title || undefined
  );

  // Create link_source node
  const linkSource = linkSourceType.create(
    { href: targetHref, title: title || "" },
    schema.text(rawText)
  );

  tr.replaceWith(adjustedFrom, adjustedTo, linkSource);
  tr.setMeta("addToHistory", false);

  // Map cursor position: offset in rendered text -> offset in raw text
  // raw = "[" + innerMarkPrefix + text + innerMarkSuffix + "](" + href + ")"
  // The "[" adds 1, plus any inner mark prefix length
  const innerPrefixLength = computePrefixLength(sharedInnerMarks);
  const offsetInSpan = $cursor.pos - span.from;
  const offsetInRaw = offsetInSpan + 1 + innerPrefixLength; // +1 for "["

  // link_source node content starts at adjustedFrom + 1 (after node open)
  const contentStart = adjustedFrom + 1;
  const newCursorPos = Math.min(contentStart + offsetInRaw, contentStart + rawText.length);
  tr.setSelection(TextSelection.create(tr.doc, newCursorPos));

  return tr;
}

/**
 * Build inline decorations for `link_source` nodes.
 * Parses the raw text to find the `](` boundary and applies:
 * - `.syntax-marker` to `[`, `](`, and `)`
 * - `.link-url` to the URL (and title if present)
 */
export function buildLinkDecorations(state: EditorState): DecorationSet {
  const linkSourceType = state.schema.nodes.link_source;
  if (!linkSourceType) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type === linkSourceType) {
      const raw = node.textContent;
      const contentStart = pos + 1; // after node open token
      const contentEnd = pos + node.nodeSize - 1; // before node close token

      // Find `](` boundary in the raw text
      const closeBracket = raw.indexOf("](");

      if (raw.length > 0 && raw[0] === "[" && closeBracket >= 1 && raw[raw.length - 1] === ")") {
        // "[" decoration
        decorations.push(
          Decoration.inline(contentStart, contentStart + 1, {
            class: "syntax-marker",
          })
        );

        // "](" decoration
        decorations.push(
          Decoration.inline(contentStart + closeBracket, contentStart + closeBracket + 2, {
            class: "syntax-marker",
          })
        );

        // URL (and optional title) decoration: from after "](" to before ")"
        const urlStart = contentStart + closeBracket + 2;
        const closingParen = contentEnd - 1; // position of ")"
        if (urlStart < closingParen) {
          decorations.push(
            Decoration.inline(urlStart, closingParen, {
              class: "link-url",
            })
          );
        }

        // ")" decoration
        decorations.push(
          Decoration.inline(closingParen, contentEnd, {
            class: "syntax-marker",
          })
        );
      }

      return false; // don't descend into link_source
    }
    return true;
  });

  return DecorationSet.create(state.doc, decorations);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const linkSourceDecoPlugin = $prose((_ctx) =>
  makeDecorationPlugin("link-source-deco", buildLinkDecorations)
);

const linkSourceBehaviorKey = new PluginKey("link-source-behavior");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const linkSourceBehaviorPlugin = $prose((_ctx) => {
  let composing = false;
  let suppressEnter = false;
  let cmdClickPending = false;

  return new Plugin({
    key: linkSourceBehaviorKey,
    appendTransaction(transactions, oldState, newState) {
      if (composing) return null;
      // Suppress ENTER during Cmd+click so the link mark stays intact
      // for handleClick to find (otherwise ENTER may fire between
      // mousedown and mouseup, replacing the mark with link_source).
      if (cmdClickPending) return null;
      const docChanged = !oldState.doc.eq(newState.doc);
      if (docChanged) suppressEnter = true;
      if (suppressEnter && !docChanged) {
        if (!findFirstNodeOfType(newState.doc, "link_source")) return null;
      }
      const result = handleLinkSourceTransition(transactions, oldState, newState);
      if (result) return result;

      // Convert plain text [text](url) to a link mark when cursor leaves it.
      // This handles the case where the user typed [text](), then went back
      // to fill in the URL — the input rule can't fire because ) already exists.
      const oldSel = oldState.selection as TextSelection;
      const newSel = newState.selection as TextSelection;
      if (!docChanged && oldSel.$cursor) {
        const oldPos = oldSel.$cursor.pos;
        const newPos = newSel.$cursor?.pos ?? newSel.from;
        if (oldPos !== newPos) {
          const parent = oldSel.$cursor.parent;
          if (parent.isTextblock) {
            const parentStart = oldSel.$cursor.start();
            const text = parent.textContent;
            // Scan for [text](url) patterns in the parent's text
            const re = /\[([^\]]+)\]\(([^)]+)\)/g;
            let m;
            while ((m = re.exec(text)) !== null) {
              const matchFrom = parentStart + m.index;
              const matchTo = matchFrom + m[0].length;
              // Was old cursor inside this pattern and new cursor outside?
              if (
                oldPos >= matchFrom &&
                oldPos <= matchTo &&
                (newPos < matchFrom || newPos > matchTo)
              ) {
                const created = createLinkTextNode(newState.schema, m[1]!, normalizeHref(m[2]!));
                if (!created) break;
                const tr = newState.tr;
                tr.replaceWith(matchFrom, matchTo, created.node);
                tr.removeStoredMark(created.linkMarkType);
                return tr;
              }
            }
          }
        }
      }

      return null;
    },
    props: {
      handleTextInput(view: EditorView, from: number, to: number, text: string) {
        // Bypass Milkdown/ProseMirror input rules inside link_source.
        const $from = view.state.doc.resolve(from);
        const linkSourceType = view.state.schema.nodes.link_source;
        if (linkSourceType && $from.parent.type === linkSourceType) {
          view.dispatch(view.state.tr.insertText(text, from, to));
          return true;
        }

        return false;
      },
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (NAV_KEYS.has(event.key)) suppressEnter = false;

        const linkSourceType = view.state.schema.nodes.link_source;
        if (!linkSourceType) return false;

        const { $from } = view.state.selection;

        // Backspace at the start of link_source content: exit source
        // mode first (restore link mark) so the subsequent paragraph join
        // preserves formatting instead of leaking raw syntax.
        if (
          event.key === "Backspace" &&
          $from.parent.type === linkSourceType &&
          $from.parentOffset === 0
        ) {
          const nodeStart = $from.start() - 1;
          const nodeEnd = nodeStart + $from.parent.nodeSize;
          const tr = view.state.tr;
          const fallbackHref = $from.parent.attrs.href as string;
          const fallbackTitle = $from.parent.attrs.title as string;
          leaveLinkSource(
            tr,
            view.state.schema,
            nodeStart,
            nodeEnd,
            $from.parent.textContent,
            fallbackHref,
            fallbackTitle
          );
          tr.setSelection(TextSelection.create(tr.doc, nodeStart));
          tr.setMeta("addToHistory", false);
          view.dispatch(tr);
          return false;
        }

        // Cmd+K: create or enter link
        if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          const schema = view.state.schema;
          const sel = view.state.selection as TextSelection;

          // No-op if already inside link_source
          if ($from.parent.type === linkSourceType) return true;

          const linkMarkType = schema.marks.link;

          // Case 1: Cursor on an existing rendered link — trigger appendTransaction enter
          if (sel.$cursor) {
            const nodeBefore = sel.$cursor.nodeBefore;
            const nodeAfter = sel.$cursor.nodeAfter;
            const linkBefore = linkMarkType.isInSet(nodeBefore?.marks ?? []);
            const linkAfter = linkMarkType.isInSet(nodeAfter?.marks ?? []);
            if (linkBefore || linkAfter) {
              const tr = view.state.tr.setSelection(view.state.selection);
              tr.setMeta("addToHistory", false);
              view.dispatch(tr);
              return true;
            }
          }

          // Case 2: Text is selected — wrap as [selected text]()
          if (!sel.empty) {
            const selectedText = view.state.doc.textBetween(sel.from, sel.to);
            const rawText = `[${selectedText}]()`;
            const linkSource = linkSourceType.create({ href: "", title: "" }, schema.text(rawText));
            const tr = view.state.tr.replaceWith(sel.from, sel.to, linkSource);
            // Place cursor inside parens: after "]("
            // Content starts at sel.from + 1 (node open token)
            // Position after "](" = contentStart + "[".length + selectedText.length + "](".length
            const contentStart = sel.from + 1;
            const cursorPos = contentStart + 1 + selectedText.length + 2;
            tr.setSelection(TextSelection.create(tr.doc, cursorPos));
            view.dispatch(tr);
            return true;
          }

          // Case 3: No selection — insert empty link syntax
          const rawText = "[]()";
          const linkSource = linkSourceType.create({ href: "", title: "" }, schema.text(rawText));
          const pos = sel.from;
          const tr = view.state.tr.replaceWith(pos, pos, linkSource);
          // Place cursor inside brackets: after "["
          // Content starts at pos + 1 (node open token), cursor after "[" = contentStart + 1
          const contentStart = pos + 1;
          tr.setSelection(TextSelection.create(tr.doc, contentStart + 1));
          view.dispatch(tr);
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
        mousedown: (_: EditorView, event: MouseEvent) => {
          suppressEnter = false;
          cmdClickPending = !!(event.metaKey || event.ctrlKey);
          return false;
        },
      },
      handleClick(view: EditorView, pos: number, event: MouseEvent) {
        cmdClickPending = false;
        if (!(event.metaKey || event.ctrlKey)) return false;

        const linkMarkType = view.state.schema.marks.link;
        if (!linkMarkType) return false;

        const $pos = view.state.doc.resolve(pos);
        const linkMark =
          linkMarkType.isInSet($pos.nodeBefore?.marks ?? []) ??
          linkMarkType.isInSet($pos.nodeAfter?.marks ?? []);
        if (!linkMark) return false;

        const href = linkMark.attrs.href as string;
        if (!href) return false;

        event.preventDefault();
        import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch((err) => console.error("Failed to open URL:", href, err));
        return true;
      },
    },
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const linkInputRulePlugin = $prose((_ctx) => {
  const rule = new InputRule(LINK_INPUT_RULE_REGEX, (state, match, start, end) => {
    // Don't fire inside link_source
    const $from = state.doc.resolve(start);
    const linkSourceType = state.schema.nodes.link_source;
    if (linkSourceType && $from.parent.type === linkSourceType) return null;

    const created = createLinkTextNode(state.schema, match[1]!, normalizeHref(match[2]!));
    if (!created) return null;
    const tr = state.tr.replaceWith(start, end, created.node);
    tr.removeStoredMark(created.linkMarkType);
    return tr;
  });

  return inputRules({ rules: [rule] });
});

export const linkSourcePlugin = [
  linkSourceDecoPlugin,
  linkSourceBehaviorPlugin,
  linkInputRulePlugin,
].flat();
