import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { Extension, StateCommand, Transaction } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { markdownSyntaxExtensions } from "../../markdown/parser";
import { indentListItem, dedentListItem } from "../../live-preview/list-indent";

/** An editor state parsing markdown exactly like LivePreviewEditor does. */
function makeState(doc: string, anchor: number, head = anchor, extra: Extension = []) {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdown({ extensions: markdownSyntaxExtensions }), extra],
  });
}

/** Run a command against a doc with the cursor placed inside `at`. */
function apply(command: StateCommand, doc: string, at: string, atEnd?: string) {
  const anchor = doc.indexOf(at) + 1;
  const head = atEnd ? doc.indexOf(atEnd) + 1 : anchor;
  expect(anchor).toBeGreaterThan(0);
  expect(head).toBeGreaterThan(0);
  let state = makeState(doc, anchor, head);
  const transactions: Transaction[] = [];
  const result = command({
    state,
    dispatch: (tr) => {
      transactions.push(tr);
      state = tr.state;
    },
  });
  return { result, doc: state.doc.toString(), transactions };
}

describe("indentListItem", () => {
  it("nests a middle item under its previous sibling and renumbers both runs", () => {
    const { result, doc } = apply(indentListItem, "1. one\n2. two\n3. three\n4. four\n", "three");
    expect(result).toBe(true);
    expect(doc).toBe("1. one\n2. two\n   1. three\n3. four\n");
  });

  it("appends to an existing nested run instead of restarting it", () => {
    const { doc } = apply(
      indentListItem,
      "1. one\n2. two\n   1. a\n   2. b\n3. three\n4. four\n",
      "three"
    );
    expect(doc).toBe("1. one\n2. two\n   1. a\n   2. b\n   3. three\n3. four\n");
  });

  it("swallows Tab on the first item of a run without dispatching", () => {
    const source = "1. one\n2. two\n";
    const { result, doc, transactions } = apply(indentListItem, source, "one");
    expect(result).toBe(true);
    expect(doc).toBe(source);
    expect(transactions).toHaveLength(0);
  });

  it("keeps the ) delimiter when renumbering", () => {
    const { doc } = apply(indentListItem, "1) a\n2) b\n3) c\n", "c");
    expect(doc).toBe("1) a\n2) b\n   1) c\n");
  });

  it("derives the nesting column from a multi-digit parent marker", () => {
    const { doc } = apply(indentListItem, "9. a\n10. b\n11. c\n", "c");
    expect(doc).toBe("9. a\n10. b\n    1. c\n");
  });

  it("closes a gap across a digit-count boundary", () => {
    const { doc } = apply(indentListItem, "9. a\n10. b\n11. c\n", "b");
    expect(doc).toBe("9. a\n   1. b\n10. c\n");
  });

  it("keeps a run's start number when renumbering it", () => {
    const { doc } = apply(indentListItem, "5. a\n6. b\n7. c\n", "b");
    expect(doc).toBe("5. a\n   1. b\n6. c\n");
  });

  it("indents bullet items without touching numbering", () => {
    const { doc } = apply(indentListItem, "- a\n- b\n- c\n", "b");
    expect(doc).toBe("- a\n  - b\n- c\n");
  });

  it("brings continuation lines along with the item", () => {
    const { doc } = apply(indentListItem, "1. one\n2. two\n   continued\n3. three\n", "continued");
    expect(doc).toBe("1. one\n   1. two\n      continued\n2. three\n");
  });

  it("brings nested children along with the item", () => {
    const { doc } = apply(indentListItem, "1. one\n2. two\n   1. x\n3. three\n", "two");
    expect(doc).toBe("1. one\n   1. two\n      1. x\n2. three\n");
  });

  it("indents every item in a multi-line selection as siblings", () => {
    const { doc } = apply(indentListItem, "1. a\n2. b\n3. c\n4. d\n", "b", "c");
    expect(doc).toBe("1. a\n   1. b\n   2. c\n2. d\n");
  });

  it("returns false in a plain paragraph", () => {
    const { result, transactions } = apply(indentListItem, "just a paragraph\n", "paragraph");
    expect(result).toBe(false);
    expect(transactions).toHaveLength(0);
  });

  it("moves only the list items of a selection that also covers a paragraph", () => {
    const { result, doc } = apply(indentListItem, "para\n\n1. a\n2. b\n3. c\n", "para", "b");
    expect(result).toBe(true);
    expect(doc).toBe("para\n\n1. a\n   1. b\n2. c\n");
  });

  it("returns false inside a code block, even within a list item", () => {
    const plain = apply(indentListItem, "```\nconst x = 1;\n```\n", "const");
    expect(plain.result).toBe(false);

    const inItem = apply(indentListItem, "1. a\n2. b\n   ```\n   const x = 1;\n   ```\n", "const");
    expect(inItem.result).toBe(false);
    expect(inItem.transactions).toHaveLength(0);
  });

  it("applies the whole move as a single undoable transaction", () => {
    const source = "1. one\n2. two\n3. three\n4. four\n";
    let state = makeState(source, source.indexOf("three") + 1, undefined, history());
    const dispatch = (tr: Transaction) => {
      state = tr.state;
    };
    indentListItem({ state, dispatch });
    expect(state.doc.toString()).toBe("1. one\n2. two\n   1. three\n3. four\n");
    undo({ state, dispatch });
    expect(state.doc.toString()).toBe(source);
  });
});

describe("dedentListItem", () => {
  it("round-trips an indent back to the original document", () => {
    const source = "1. one\n2. two\n3. three\n4. four\n";
    const indented = apply(indentListItem, source, "three").doc;
    const { result, doc } = apply(dedentListItem, indented, "three");
    expect(result).toBe(true);
    expect(doc).toBe(source);
  });

  it("adopts former following siblings as children renumbered from 1", () => {
    const { doc } = apply(dedentListItem, "1. a\n   1. x\n   2. y\n   3. z\n2. b\n", "y");
    expect(doc).toBe("1. a\n   1. x\n2. y\n   1. z\n3. b\n");
  });

  it("dedents bullet items without touching numbering", () => {
    const { doc } = apply(dedentListItem, "- a\n  - b\n- c\n", "b");
    expect(doc).toBe("- a\n- b\n- c\n");
  });

  it("swallows Shift-Tab on a top-level item without dispatching", () => {
    const source = "1. one\n2. two\n";
    const { result, doc, transactions } = apply(dedentListItem, source, "two");
    expect(result).toBe(true);
    expect(doc).toBe(source);
    expect(transactions).toHaveLength(0);
  });

  it("returns false in a plain paragraph", () => {
    const { result } = apply(dedentListItem, "just a paragraph\n", "paragraph");
    expect(result).toBe(false);
  });

  it("dedents every item in a multi-line selection", () => {
    const { doc } = apply(dedentListItem, "1. a\n   1. b\n   2. c\n2. d\n", "b", "c");
    expect(doc).toBe("1. a\n2. b\n3. c\n4. d\n");
  });

  it("shifts children of an item whose renumbered marker grows a digit", () => {
    const { doc } = apply(
      dedentListItem,
      "1. a\n   1. inserted\n2. b\n3. c\n4. d\n5. e\n6. f\n7. g\n8. h\n9. i\n   1. child\n10. j\n",
      "inserted"
    );
    // "9. i" becomes "10. i"; its child must gain a column to stay nested.
    expect(doc).toBe(
      "1. a\n2. inserted\n3. b\n4. c\n5. d\n6. e\n7. f\n8. g\n9. h\n10. i\n    1. child\n11. j\n"
    );
  });
});
