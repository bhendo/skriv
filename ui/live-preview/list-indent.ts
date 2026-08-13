import { syntaxTree } from "@codemirror/language";
import { ChangeSet } from "@codemirror/state";
import type { EditorState, StateCommand, Text } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { sourceMarkdownParser } from "../markdown/parser";

/**
 * List-aware Tab/Shift-Tab (#85), Typora/Obsidian style: Tab nests a list
 * item (with its child lines) under its previous sibling and renumbers the
 * ordered runs on both sides of the move; Shift-Tab dedents symmetrically,
 * with the item's former following siblings becoming its children. Outside
 * list items both commands return false so `indentWithTab` keeps Tab's
 * generic behavior.
 *
 * Each press is one dispatched transaction, built in two stages: first the
 * whitespace shifts that move the item, then — because renumbering depends
 * on the structure those shifts produce — a reparse of the affected list
 * with `sourceMarkdownParser`, whose ordered runs are renumbered and the
 * two change sets composed.
 */

/** Nodes that own Tab for their own purposes even inside a list item. */
const TAB_OWNERS = new Set(["FencedCode", "CodeBlock", "Table"]);

/** A single replace/insert/delete, kept concrete so edits sort by position. */
interface Edit {
  from: number;
  to?: number;
  insert?: string;
}

const byPosition = (a: Edit, b: Edit) => a.from - b.from;

const isList = (name: string) => name === "OrderedList" || name === "BulletList";

/** The innermost ListItem for a line, unless a Tab-owning node claims it first. */
function lineListItem(state: EditorState, lineFrom: number, lineText: string): SyntaxNode | null {
  const first = lineText.search(/\S/);
  if (first < 0) return null;
  for (
    let cur: SyntaxNode | null = syntaxTree(state).resolveInner(lineFrom + first, 1);
    cur;
    cur = cur.parent
  ) {
    if (TAB_OWNERS.has(cur.name)) return null;
    if (cur.name === "ListItem") {
      // Blockquoted lists are left to the default commands: moving an item
      // there means editing after the `> ` prefix, not at line starts.
      for (let up = cur.parent; up; up = up.parent) {
        if (up.name === "Blockquote") return null;
      }
      return cur;
    }
  }
  return null;
}

/**
 * The list items the selection targets: the innermost item of every selected
 * line, minus items whose extent lies inside another collected item's (those
 * move as part of their parent), in document order.
 */
function collectItems(state: EditorState): SyntaxNode[] {
  const found = new Map<number, SyntaxNode>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    let lastLine = state.doc.lineAt(range.to).number;
    // A selection ending at a line start doesn't select that line.
    if (!range.empty && range.to === state.doc.line(lastLine).from && lastLine > fromLine.number) {
      lastLine--;
    }
    for (let n = fromLine.number; n <= lastLine; n++) {
      const line = state.doc.line(n);
      const item = lineListItem(state, line.from, line.text);
      if (item) found.set(item.from, item);
    }
  }
  const items = [...found.values()].sort((a, b) => a.from - b.from);
  return items.filter(
    (item) =>
      !items.some((other) => other !== item && other.from <= item.from && item.to <= other.to)
  );
}

/** The nearest ListItem ancestor (the item's parent item), if any. */
function parentListItem(item: SyntaxNode): SyntaxNode | null {
  for (let cur = item.parent; cur; cur = cur.parent) {
    if (cur.name === "ListItem") return cur;
  }
  return null;
}

/** The outermost list containing the item, whose ordered runs get renumbered. */
function outermostList(item: SyntaxNode): SyntaxNode {
  let list = item.parent as SyntaxNode;
  for (let cur = list.parent; cur; cur = cur.parent) {
    if (isList(cur.name)) list = cur;
  }
  return list;
}

/** Shift every non-blank line of the item's extent by `delta` columns. */
function shiftItemLines(doc: Text, item: SyntaxNode, delta: number, edits: Edit[]): void {
  const last = doc.lineAt(item.to).number;
  for (let n = doc.lineAt(item.from).number; n <= last; n++) {
    const line = doc.line(n);
    if (line.length === 0) continue;
    if (delta > 0) {
      edits.push({ from: line.from, insert: " ".repeat(delta) });
    } else {
      const remove = Math.min(-delta, line.text.search(/[^ ]|$/));
      if (remove > 0) edits.push({ from: line.from, to: line.from + remove });
    }
  }
}

/**
 * Renumber every ordered run in the reparsed list slice `src` (positions
 * offset by `base`): the first item of a run keeps its number — GFM takes
 * the run's start from it — unless its marker is in `restart`, meaning this
 * command placed it at a new depth, in which case the run restarts at 1;
 * every following item is its predecessor plus one. When a replacement
 * marker changes length, the item's continuation lines shift with it so its
 * children keep their nesting column.
 */
function renumberRuns(src: string, base: number, restart: Set<number>, edits: Edit[]): void {
  const lineShifts = new Map<number, number>();
  sourceMarkdownParser.parse(src).iterate({
    enter(node) {
      if (node.name !== "OrderedList") return;
      let expected: number | null = null;
      for (let item = node.node.firstChild; item; item = item.nextSibling) {
        if (item.name !== "ListItem") continue;
        const mark = item.getChild("ListMark");
        if (!mark) continue;
        const marker = src.slice(mark.from, mark.to);
        const current = parseInt(marker, 10);
        if (expected === null) expected = restart.has(base + mark.from) ? 1 : current;
        if (current !== expected) {
          const replacement = `${expected}${marker[marker.length - 1]}`;
          edits.push({ from: base + mark.from, to: base + mark.to, insert: replacement });
          const lengthDelta = replacement.length - marker.length;
          if (lengthDelta !== 0) {
            // Continuation lines: every line of the item's extent after the
            // first. Aggregated per line so nested adjustments combine.
            for (let nl = src.indexOf("\n", mark.from); nl >= 0 && nl < item.to; ) {
              const lineStart = nl + 1;
              nl = src.indexOf("\n", lineStart);
              if (src[lineStart] === "\n" || lineStart >= item.to) continue;
              lineShifts.set(
                base + lineStart,
                (lineShifts.get(base + lineStart) ?? 0) + lengthDelta
              );
            }
          }
        }
        expected++;
      }
    },
  });
  for (const [pos, delta] of lineShifts) {
    if (delta > 0) {
      edits.push({ from: pos, insert: " ".repeat(delta) });
    } else if (delta < 0) {
      const remove = Math.min(-delta, src.slice(pos - base).search(/[^ ]|$/));
      if (remove > 0) edits.push({ from: pos, to: pos + remove });
    }
  }
}

/** Shared engine for both commands; `dir` is 1 to indent, -1 to dedent. */
function moveListItems(target: Parameters<StateCommand>[0], dir: 1 | -1): boolean {
  const { state } = target;
  const items = collectItems(state);
  if (items.length === 0) return false;

  const doc = state.doc;
  const moving = new Set(items.map((item) => item.from));
  const edits: Edit[] = [];
  /** ListMark positions of items placed at a new depth (their run restarts at 1). */
  const restartMarks: number[] = [];
  /** New marker column per moved item, so co-moving siblings stay siblings. */
  const targetCols = new Map<number, number>();
  const affectedLists = new Map<number, SyntaxNode>();

  for (const item of items) {
    const mark = item.getChild("ListMark");
    if (!mark) continue;
    const markerCol = mark.from - doc.lineAt(mark.from).from;
    const markerLen = mark.to - mark.from;

    if (dir === 1) {
      let prev = item.prevSibling;
      while (prev && prev.name !== "ListItem") prev = prev.prevSibling;
      if (!prev) continue; // first at this depth: no parent to nest under
      const prevTarget = moving.has(prev.from) ? targetCols.get(prev.from) : undefined;
      let targetCol: number;
      if (prevTarget !== undefined) {
        targetCol = prevTarget; // the previous sibling moves too; stay its sibling
      } else {
        const prevMark = prev.getChild("ListMark");
        if (!prevMark) continue;
        // Nest under the previous sibling: the marker must reach its content
        // column (marker column + marker length + one space).
        targetCol =
          prevMark.from - doc.lineAt(prevMark.from).from + (prevMark.to - prevMark.from) + 1;
      }
      if (targetCol <= markerCol) continue;
      targetCols.set(item.from, targetCol);
      shiftItemLines(doc, item, targetCol - markerCol, edits);
    } else {
      const parent = parentListItem(item);
      if (!parent) continue; // already top level
      const parentMark = parent.getChild("ListMark");
      if (!parentMark) continue;
      const targetCol = parentMark.from - doc.lineAt(parentMark.from).from;
      if (targetCol < markerCol) shiftItemLines(doc, item, targetCol - markerCol, edits);
      // Former following siblings (until one that moves itself) become the
      // dedented item's children: align them to its new content column.
      const adoptCol = targetCol + markerLen + 1;
      let firstAdopted = true;
      for (let sib = item.nextSibling; sib && sib.name === "ListItem"; sib = sib.nextSibling) {
        if (moving.has(sib.from)) break;
        const sibMark = sib.getChild("ListMark");
        if (!sibMark) continue;
        const sibDelta = adoptCol - (sibMark.from - doc.lineAt(sibMark.from).from);
        if (sibDelta !== 0) shiftItemLines(doc, sib, sibDelta, edits);
        if (firstAdopted) {
          restartMarks.push(sibMark.from);
          firstAdopted = false;
        }
      }
    }
    restartMarks.push(mark.from);
    const list = outermostList(item);
    affectedLists.set(list.from, list);
  }

  // In a list but nothing can move (first item / top level): swallow the
  // press rather than let indentWithTab distort the list.
  if (edits.length === 0) return true;

  edits.sort(byPosition);
  const shifts = ChangeSet.of(edits, doc.length);
  const shifted = shifts.apply(doc);
  const restart = new Set(restartMarks.map((pos) => shifts.mapPos(pos, 1)));

  const renumberEdits: Edit[] = [];
  for (const list of affectedLists.values()) {
    const base = shifts.mapPos(doc.lineAt(list.from).from, -1);
    const end = shifts.mapPos(doc.lineAt(list.to).to, 1);
    renumberRuns(shifted.sliceString(base, end), base, restart, renumberEdits);
  }
  renumberEdits.sort(byPosition);

  const changes = renumberEdits.length
    ? shifts.compose(ChangeSet.of(renumberEdits, shifted.length))
    : shifts;
  target.dispatch(
    state.update({
      changes,
      userEvent: dir === 1 ? "input.indent" : "delete.dedent",
      scrollIntoView: true,
    })
  );
  return true;
}

/** Tab: nest the selected list items one level deeper and renumber. */
export const indentListItem: StateCommand = (target) => moveListItems(target, 1);

/** Shift-Tab: lift the selected list items to their parent depth and renumber. */
export const dedentListItem: StateCommand = (target) => moveListItems(target, -1);

/** Bind ahead of `indentWithTab` so list items get structural Tab handling. */
export const listIndentKeymap: KeyBinding[] = [
  { key: "Tab", run: indentListItem, shift: dedentListItem },
];
