import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { findAncestorOfType, isInsideBlockType } from "../../../plugins/block-source/cursor";

// Schema with list nodes for list-related tests
const listSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    blockquote: { group: "block", content: "block+" },
    text: { group: "inline" },
    list_item: {
      content: "paragraph block*",
      group: "listItem",
      defining: true,
      attrs: {
        label: { default: "\u2022" },
        listType: { default: "bullet" },
        spread: { default: true },
      },
    },
    bullet_list: {
      content: "list_item+",
      group: "block",
    },
  },
});

// Schema with code_block for code-block-related tests
const codeSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
    },
    code_block: {
      group: "block",
      content: "text*",
      attrs: { language: { default: "" } },
      marks: "",
      code: true,
      defining: true,
      toDOM: () => ["pre", ["code", 0]] as const,
    },
    blockquote: {
      group: "block",
      content: "block+",
      toDOM: () => ["blockquote", 0] as const,
    },
    text: { group: "inline" },
  },
});

function listStateAt(doc: ReturnType<typeof listSchema.node>, pos: number) {
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
  });
}

describe("findAncestorOfType (lists)", () => {
  it("finds a list_item when cursor is inside it", () => {
    const doc = listSchema.node("doc", null, [
      listSchema.nodes.bullet_list.create(null, [
        listSchema.nodes.list_item.create(null, [
          listSchema.nodes.paragraph.create(null, [listSchema.text("hello")]),
        ]),
      ]),
    ]);
    const state = listStateAt(doc, 4);
    const result = findAncestorOfType(state, "list_item");

    expect(result).not.toBeNull();
    expect(result!.node.type.name).toBe("list_item");
    expect(result!.pos).toBe(1);
  });

  it("returns null when cursor is not inside the given type", () => {
    const doc = listSchema.node("doc", null, [
      listSchema.nodes.paragraph.create(null, [listSchema.text("hello")]),
    ]);
    const state = listStateAt(doc, 2);
    const result = findAncestorOfType(state, "list_item");

    expect(result).toBeNull();
  });

  it("finds the innermost list_item in nested lists", () => {
    const innerItem = listSchema.nodes.list_item.create(null, [
      listSchema.nodes.paragraph.create(null, [listSchema.text("inner")]),
    ]);
    const outerItem = listSchema.nodes.list_item.create(null, [
      listSchema.nodes.paragraph.create(null, [listSchema.text("outer")]),
      listSchema.nodes.bullet_list.create(null, [innerItem]),
    ]);
    const doc = listSchema.node("doc", null, [
      listSchema.nodes.bullet_list.create(null, [outerItem]),
    ]);

    const state = listStateAt(doc, 13);
    const result = findAncestorOfType(state, "list_item");

    expect(result).not.toBeNull();
    expect(result!.pos).toBe(10);
    expect(result!.node.type.name).toBe("list_item");
  });

  it("finds outer list_item when cursor is in outer content", () => {
    const innerItem = listSchema.nodes.list_item.create(null, [
      listSchema.nodes.paragraph.create(null, [listSchema.text("inner")]),
    ]);
    const outerItem = listSchema.nodes.list_item.create(null, [
      listSchema.nodes.paragraph.create(null, [listSchema.text("outer")]),
      listSchema.nodes.bullet_list.create(null, [innerItem]),
    ]);
    const doc = listSchema.node("doc", null, [
      listSchema.nodes.bullet_list.create(null, [outerItem]),
    ]);

    const state = listStateAt(doc, 4);
    const result = findAncestorOfType(state, "list_item");

    expect(result).not.toBeNull();
    expect(result!.pos).toBe(1);
  });

  it("handles multi-paragraph list items", () => {
    const item = listSchema.nodes.list_item.create(null, [
      listSchema.nodes.paragraph.create(null, [listSchema.text("first")]),
      listSchema.nodes.paragraph.create(null, [listSchema.text("second")]),
    ]);
    const doc = listSchema.node("doc", null, [listSchema.nodes.bullet_list.create(null, [item])]);

    const state = listStateAt(doc, 11);
    const result = findAncestorOfType(state, "list_item");

    expect(result).not.toBeNull();
    expect(result!.pos).toBe(1);
  });
});

describe("findAncestorOfType (code blocks)", () => {
  it("finds code_block when cursor is inside one", () => {
    const doc = codeSchema.node("doc", null, [
      codeSchema.node("code_block", { language: "js" }, [codeSchema.text("hello")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    const result = findAncestorOfType(state, "code_block");
    expect(result).not.toBeNull();
    expect(result!.node.type.name).toBe("code_block");
    expect(result!.pos).toBe(0);
    expect(result!.depth).toBe(1);
  });

  it("returns null when cursor is not inside the given type", () => {
    const doc = codeSchema.node("doc", null, [
      codeSchema.node("paragraph", null, [codeSchema.text("hello")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    const result = findAncestorOfType(state, "code_block");
    expect(result).toBeNull();
  });

  it("finds nested ancestor type", () => {
    const doc = codeSchema.node("doc", null, [
      codeSchema.node("blockquote", null, [
        codeSchema.node("paragraph", null, [codeSchema.text("quoted")]),
      ]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 4),
    });

    const result = findAncestorOfType(state, "blockquote");
    expect(result).not.toBeNull();
    expect(result!.node.type.name).toBe("blockquote");
    expect(result!.depth).toBe(1);
  });
});

describe("isInsideBlockType (lists)", () => {
  it("returns true when cursor is inside the specified block type", () => {
    const doc = listSchema.node("doc", null, [
      listSchema.nodes.bullet_list.create(null, [
        listSchema.nodes.list_item.create(null, [
          listSchema.nodes.paragraph.create(null, [listSchema.text("hello")]),
        ]),
      ]),
    ]);
    const state = listStateAt(doc, 4);
    expect(isInsideBlockType(state, "list_item")).toBe(true);
  });

  it("returns true for bullet_list when cursor is inside a list", () => {
    const doc = listSchema.node("doc", null, [
      listSchema.nodes.bullet_list.create(null, [
        listSchema.nodes.list_item.create(null, [
          listSchema.nodes.paragraph.create(null, [listSchema.text("hello")]),
        ]),
      ]),
    ]);
    const state = listStateAt(doc, 4);
    expect(isInsideBlockType(state, "bullet_list")).toBe(true);
  });

  it("returns false when cursor is not inside the type at all", () => {
    const doc = listSchema.node("doc", null, [
      listSchema.nodes.paragraph.create(null, [listSchema.text("hello")]),
    ]);
    const state = listStateAt(doc, 2);
    expect(isInsideBlockType(state, "list_item")).toBe(false);
  });
});

describe("isInsideBlockType (code blocks)", () => {
  it("returns true for TextSelection inside the block type", () => {
    const doc = codeSchema.node("doc", null, [
      codeSchema.node("code_block", { language: "js" }, [codeSchema.text("code")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    });

    expect(isInsideBlockType(state, "code_block")).toBe(true);
  });

  it("returns true for NodeSelection on the block type", () => {
    const doc = codeSchema.node("doc", null, [
      codeSchema.node("code_block", { language: "js" }, [codeSchema.text("code")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    expect(isInsideBlockType(state, "code_block")).toBe(true);
  });

  it("returns false when selection is outside the block type", () => {
    const doc = codeSchema.node("doc", null, [
      codeSchema.node("paragraph", null, [codeSchema.text("hello")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    expect(isInsideBlockType(state, "code_block")).toBe(false);
  });

  it("returns false for NodeSelection on a different type", () => {
    const doc = codeSchema.node("doc", null, [
      codeSchema.node("paragraph", null, [codeSchema.text("hello")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    expect(isInsideBlockType(state, "code_block")).toBe(false);
  });
});
