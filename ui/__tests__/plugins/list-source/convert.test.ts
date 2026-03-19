import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { convertListType, unwrapListItem } from "../../../plugins/list-source/convert";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
      parseDOM: [{ tag: "p" }],
    },
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
      toDOM: () => ["li", 0] as const,
      parseDOM: [{ tag: "li" }],
    },
    bullet_list: {
      content: "list_item+",
      group: "block",
      toDOM: () => ["ul", 0] as const,
      parseDOM: [{ tag: "ul" }],
    },
    ordered_list: {
      content: "list_item+",
      group: "block",
      attrs: {
        order: { default: 1 },
        spread: { default: false },
      },
      toDOM: () => ["ol", 0] as const,
      parseDOM: [{ tag: "ol" }],
    },
  },
});

function createBulletList(items: string[]) {
  return schema.nodes.bullet_list.create(
    null,
    items.map((text) =>
      schema.nodes.list_item.create({ listType: "bullet", label: "\u2022" }, [
        schema.nodes.paragraph.create(null, text ? [schema.text(text)] : []),
      ])
    )
  );
}

function createOrderedList(items: string[]) {
  return schema.nodes.ordered_list.create(
    null,
    items.map((text, i) =>
      schema.nodes.list_item.create({ listType: "ordered", label: `${i + 1}.` }, [
        schema.nodes.paragraph.create(null, text ? [schema.text(text)] : []),
      ])
    )
  );
}

function createViewWithDoc(doc: ReturnType<typeof schema.node>) {
  const state = EditorState.create({ doc, schema });
  const container = document.createElement("div");
  return new EditorView(container, { state });
}

describe("convertListType", () => {
  it("converts bullet_list to ordered_list", () => {
    const doc = schema.node("doc", null, [createBulletList(["a", "b", "c"])]);
    const view = createViewWithDoc(doc);

    // First list_item is at pos 1 (0=blist open, 1=li open)
    // getPos() returns position before the node, so resolving pos 1
    // lands inside the bullet_list. convertListType uses $pos.depth to
    // find the parent wrapper.
    convertListType(view, 1, "ordered_list");

    const newDoc = view.state.doc;
    const list = newDoc.firstChild!;
    expect(list.type.name).toBe("ordered_list");
    expect(list.childCount).toBe(3);

    view.destroy();
  });

  it("converts ordered_list to bullet_list", () => {
    const doc = schema.node("doc", null, [createOrderedList(["a", "b", "c"])]);
    const view = createViewWithDoc(doc);

    convertListType(view, 1, "bullet_list");

    const newDoc = view.state.doc;
    const list = newDoc.firstChild!;
    expect(list.type.name).toBe("bullet_list");

    // Child attrs should be updated to bullet
    list.forEach((child) => {
      expect(child.attrs.listType).toBe("bullet");
      expect(child.attrs.label).toBe("\u2022");
    });

    view.destroy();
  });

  it("no-ops when target type matches current type", () => {
    const doc = schema.node("doc", null, [createBulletList(["a"])]);
    const view = createViewWithDoc(doc);
    const docBefore = view.state.doc;

    convertListType(view, 1, "bullet_list");

    // Doc should be unchanged
    expect(view.state.doc).toBe(docBefore);

    view.destroy();
  });

  it("handles nested lists independently", () => {
    // Outer bullet list with nested ordered list
    const innerList = createOrderedList(["nested"]);
    const outerItem = schema.nodes.list_item.create({ listType: "bullet", label: "\u2022" }, [
      schema.nodes.paragraph.create(null, [schema.text("outer")]),
      innerList,
    ]);
    const outerList = schema.nodes.bullet_list.create(null, [outerItem]);
    const doc = schema.node("doc", null, [outerList]);
    const view = createViewWithDoc(doc);

    // The nested list_item position:
    // 0=outer_blist, 1=outer_li, 2=outer_p, 3-7="outer", 8=p_close
    // 9=inner_olist, 10=inner_li, 11=inner_p, 12-17="nested"
    // getPos() for inner list_item = 10, resolves inside inner ordered_list (depth)
    convertListType(view, 10, "bullet_list");

    const newDoc = view.state.doc;
    // Outer list should still be bullet_list
    expect(newDoc.firstChild!.type.name).toBe("bullet_list");
    // Inner list should now be bullet_list
    const innerNode = newDoc.firstChild!.firstChild!.lastChild!;
    expect(innerNode.type.name).toBe("bullet_list");

    view.destroy();
  });
});

describe("unwrapListItem", () => {
  it("lifts a single-item bullet list to a paragraph", () => {
    const doc = schema.node("doc", null, [createBulletList(["hello"])]);
    const view = createViewWithDoc(doc);

    // Place selection inside the list item content first
    const sel = TextSelection.create(view.state.doc, 3);
    view.dispatch(view.state.tr.setSelection(sel));

    const result = unwrapListItem(view, 1);
    expect(result).toBe(true);

    const newDoc = view.state.doc;
    // Should be a plain paragraph now
    expect(newDoc.firstChild!.type.name).toBe("paragraph");
    expect(newDoc.firstChild!.textContent).toBe("hello");

    view.destroy();
  });
});
