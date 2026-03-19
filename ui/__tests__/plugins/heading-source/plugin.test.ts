import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  handleHeadingSourceTransition,
  buildHeadingPrefixDecorations,
} from "../../../plugins/heading-source/plugin";
import { parseHeadingPrefix, stripPrefix } from "../../../plugins/heading-source/syntax";

const schema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      toDOM: () => ["div", 0] as const,
    },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 }, id: { default: "" } },
      toDOM: (node) => [`h${node.attrs.level}`, { id: node.attrs.id || undefined }, 0] as const,
    },
    heading_source: {
      group: "block",
      content: "inline*",
      defining: true,
      attrs: { level: { default: 1 }, id: { default: "" } },
      toDOM: (node) =>
        [
          `h${node.attrs.level}`,
          { class: "heading-source", id: node.attrs.id || undefined },
          0,
        ] as const,
    },
    text: { group: "inline" },
    inline_source: {
      group: "inline",
      inline: true,
      content: "text*",
      marks: "",
      attrs: { syntax: { default: "" } },
      toDOM: () => ["span", { class: "inline-source" }, 0] as const,
    },
  },
  marks: {
    strong: {
      toDOM: () => ["strong", 0] as const,
      parseDOM: [{ tag: "strong" }],
    },
    emphasis: {
      toDOM: () => ["em", 0] as const,
      parseDOM: [{ tag: "em" }],
    },
  },
});

describe("handleHeadingSourceTransition", () => {
  describe("enter transition", () => {
    it("replaces heading with heading_source when cursor enters", () => {
      // doc: heading[level=2]("Hello")
      // pos layout: doc(0) > heading(0..7): content "Hello" at 1..6
      const doc = schema.node("doc", null, [
        schema.node("heading", { level: 2, id: "" }, [schema.text("Hello")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 1),
      });

      // Cursor is inside the heading at pos 3
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.type.name).toBe("heading_source");
        expect(firstBlock.attrs.level).toBe(2);
        expect(firstBlock.textContent).toBe("## Hello");
      }
    });

    it("preserves heading id on enter", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading", { level: 1, id: "my-id" }, [schema.text("Title")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 1),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.attrs.id).toBe("my-id");
      }
    });

    it("handles empty heading", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading", { level: 2, id: "" }),
        schema.node("paragraph", null, [schema.text("body")]),
      ]);

      // Cursor starts in paragraph, moves to heading
      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 3), // in paragraph
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 1));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.type.name).toBe("heading_source");
        expect(firstBlock.textContent).toBe("## ");
      }
    });

    it("returns null when cursor is already inside heading_source", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text("## Hello")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 3),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 5));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("returns null for range selection over heading", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading", { level: 2, id: "" }, [schema.text("Hello")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 1),
      });

      // Range selection spanning the heading content
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 1, 6));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("preserves inline marks on enter", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading", { level: 2, id: "" }, [
          schema.text("Hello "),
          schema.text("bold", [schema.marks.strong.create()]),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 1),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.textContent).toBe("## Hello bold");
        // Check that the bold mark is preserved
        let foundStrong = false;
        firstBlock.content.forEach((child) => {
          if (child.marks.some((m) => m.type.name === "strong")) {
            foundStrong = true;
          }
        });
        expect(foundStrong).toBe(true);
      }
    });
  });

  describe("leave transition", () => {
    it("replaces heading_source with heading on leave", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text("## Hello")]),
        schema.node("paragraph", null, [schema.text("body")]),
      ]);

      // Cursor inside heading_source
      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 5),
      });

      // Move cursor to paragraph (heading_source nodeSize = 10, paragraph starts at 10)
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 11));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.type.name).toBe("heading");
        expect(firstBlock.attrs.level).toBe(2);
        expect(firstBlock.textContent).toBe("Hello");
      }
    });

    it("converts to paragraph when no # prefix remains", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text("Hello")]),
        schema.node("paragraph", null, [schema.text("body")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 3),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 8));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.type.name).toBe("paragraph");
        expect(firstBlock.textContent).toBe("Hello");
      }
    });

    it("creates empty heading when prefix-only content on leave", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 3, id: "" }, [schema.text("### ")]),
        schema.node("paragraph", null, [schema.text("body")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 3),
      });

      // heading_source "### " has nodeSize = 6, paragraph starts at 6
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 7));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.type.name).toBe("heading");
        expect(firstBlock.attrs.level).toBe(3);
        expect(firstBlock.textContent).toBe("");
      }
    });

    it("non-cursor selection triggers leave (#34 pattern)", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text("## Hello")]),
        schema.node("paragraph", null, [schema.text("body text")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 5),
      });

      // Create a range selection in the paragraph (outside heading_source)
      // heading_source nodeSize = 10, paragraph content starts at 11
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 11, 15));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.type.name).toBe("heading");
        expect(firstBlock.attrs.level).toBe(2);
      }
    });

    it("strips leading space when converting to paragraph", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text(" Hello")]),
        schema.node("paragraph", null, [schema.text("body")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 3),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 9));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.type.name).toBe("paragraph");
        expect(firstBlock.textContent).toBe("Hello");
      }
    });
  });

  describe("live update", () => {
    it("updates level when prefix changes", () => {
      // Start with h2 heading_source, but text says "### Hello" (user added a #)
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text("### Hello")]),
      ]);

      // Create the "old" state with the same node but level=2
      const oldDoc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text("## Hello")]),
      ]);

      const oldState = EditorState.create({
        doc: oldDoc,
        schema,
        selection: TextSelection.create(oldDoc, 3),
      });

      // Simulate doc change — new doc has "### Hello" but level still says 2
      const newState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 4),
      });

      // Simulate a doc-changing transaction
      const fakeTr = oldState.tr.insertText("#", 3, 3);
      const result = handleHeadingSourceTransition([fakeTr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const firstBlock = resultState.doc.firstChild!;
        expect(firstBlock.attrs.level).toBe(3);
      }
    });

    it("returns null when level has not changed", () => {
      const doc = schema.node("doc", null, [
        schema.node("heading_source", { level: 2, id: "" }, [schema.text("## Hello")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 3),
      });

      // Same doc, just cursor moved within the node
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 5));
      const newState = oldState.apply(tr);

      const result = handleHeadingSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });
  });
});

describe("buildHeadingPrefixDecorations", () => {
  it("creates decoration for heading_source prefix", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading_source", { level: 2, id: "" }, [schema.text("## Hello")]),
    ]);
    const state = EditorState.create({ doc, schema });
    const decoSet = buildHeadingPrefixDecorations(state);

    // heading_source at pos 0, content starts at pos 1
    // "## " prefix = 3 chars, decoration from 1 to 4
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(1);
    expect(decorations[0].from).toBe(1);
    expect(decorations[0].to).toBe(4);
  });

  it("creates decoration for prefix without trailing space", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading_source", { level: 2, id: "" }, [schema.text("##Hello")]),
    ]);
    const state = EditorState.create({ doc, schema });
    const decoSet = buildHeadingPrefixDecorations(state);

    const decorations = decoSet.find();
    expect(decorations).toHaveLength(1);
    expect(decorations[0].from).toBe(1);
    expect(decorations[0].to).toBe(3);
  });

  it("returns empty when no heading_source exists", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 2, id: "" }, [schema.text("Hello")]),
    ]);
    const state = EditorState.create({ doc, schema });
    const decoSet = buildHeadingPrefixDecorations(state);

    expect(decoSet.find()).toHaveLength(0);
  });

  it("returns empty when schema has no heading_source type", () => {
    const basicSchema = new Schema({
      nodes: {
        doc: { content: "block+" },
        paragraph: { group: "block", content: "inline*" },
        text: { group: "inline" },
      },
    });
    const doc = basicSchema.node("doc", null, [
      basicSchema.node("paragraph", null, [basicSchema.text("hello")]),
    ]);
    const state = EditorState.create({ doc, schema: basicSchema });
    const decoSet = buildHeadingPrefixDecorations(state);

    expect(decoSet.find()).toHaveLength(0);
  });
});

describe("toMarkdown serialization safety", () => {
  it("stripPrefix removes heading prefix so serializer avoids double-prefix", () => {
    // Simulates what toMarkdown does: parse prefix, strip it, serialize remainder
    const hsNode = schema.node("heading_source", { level: 2, id: "" }, [
      schema.text("## Hello "),
      schema.text("world", [schema.marks.strong.create()]),
    ]);

    const text = hsNode.textContent;
    const parsed = parseHeadingPrefix(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.level).toBe(2);
    expect(parsed!.contentStart).toBe(3);

    const strippedContent = stripPrefix(hsNode.content, parsed!.contentStart, schema);
    // Should contain "Hello world" without the "## " prefix
    expect(strippedContent.textBetween(0, strippedContent.size)).toBe("Hello world");

    // Bold mark should be preserved on "world"
    let foundStrong = false;
    strippedContent.forEach((child) => {
      if (child.marks.some((m) => m.type.name === "strong")) {
        foundStrong = true;
        expect(child.text).toBe("world");
      }
    });
    expect(foundStrong).toBe(true);
  });

  it("handles heading_source with no prefix (converts to paragraph content)", () => {
    const hsNode = schema.node("heading_source", { level: 2, id: "" }, [schema.text("Hello")]);

    const text = hsNode.textContent;
    const parsed = parseHeadingPrefix(text);
    // No # prefix — parsed is null, content passes through unstripped
    expect(parsed).toBeNull();
  });
});
