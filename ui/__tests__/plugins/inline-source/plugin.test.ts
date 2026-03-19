import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { findMarkSpan, handleInlineSourceTransition } from "../../../plugins/inline-source/plugin";

// Minimal schema with marks for testing
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
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

describe("findMarkSpan", () => {
  it("finds the extent of a strong mark", () => {
    // doc > paragraph > "hello " + strong("bold") + " world"
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("hello "),
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text(" world"),
      ]),
    ]);
    const strongType = schema.marks.strong;
    // Paragraph starts at pos 1 (after paragraph open tag)
    // "hello " = positions 1-6, "bold" = positions 7-10, " world" = positions 11-16
    // from=7 (start of "bold"), to=11 (after "bold")
    const result = findMarkSpan(doc, 9, strongType);
    expect(result).toEqual({ from: 7, to: 11 });
  });

  it("returns null when mark not found at position", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("hello "),
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text(" world"),
      ]),
    ]);
    const strongType = schema.marks.strong;
    // Cursor in "hello " — no strong mark
    const result = findMarkSpan(doc, 3, strongType);
    expect(result).toBeNull();
  });

  it("finds span across multiple text nodes with same mark", () => {
    // Two text nodes both with strong mark (one also has emphasis)
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("bold ", [schema.marks.strong.create()]),
        schema.text("more", [schema.marks.strong.create(), schema.marks.emphasis.create()]),
      ]),
    ]);
    const strongType = schema.marks.strong;
    // "bold " at 1-5, "more" at 6-9
    // Cursor in "more" — strong spans both text nodes: 1-10
    const result = findMarkSpan(doc, 7, strongType);
    expect(result).toEqual({ from: 1, to: 10 });
  });
});

// Extended schema with inline_source node for transition tests
const transitionSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
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
    strike_through: {
      toDOM: () => ["del", 0] as const,
      parseDOM: [{ tag: "del" }],
    },
    inlineCode: {
      toDOM: () => ["code", 0] as const,
      parseDOM: [{ tag: "code" }],
    },
  },
});

describe("handleInlineSourceTransition", () => {
  describe("enter transition", () => {
    it("replaces strong mark with inline_source node when cursor enters", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.text("bold", [transitionSchema.marks.strong.create()]),
          transitionSchema.text(" world"),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3), // in "hello"
      });

      // Move cursor into the bold span (pos 9 is inside "bold" at positions 7-10)
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 9));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundInlineSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "inline_source") {
            foundInlineSource = true;
            expect(node.textContent).toBe("**bold**");
            expect(node.attrs.syntax).toBe("strong");
          }
        });
        expect(foundInlineSource).toBe(true);
      }
    });

    it("returns null when cursor is not near a supported mark", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [transitionSchema.text("hello world")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 5));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("returns null when cursor is already inside inline_source", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.nodes.inline_source.create(
            { syntax: "strong" },
            transitionSchema.text("**bold**")
          ),
          transitionSchema.text(" world"),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 10),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 12));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("handles nested same-boundary marks (strong + emphasis)", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("both", [
            transitionSchema.marks.strong.create(),
            transitionSchema.marks.emphasis.create(),
          ]),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 1),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundInlineSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "inline_source") {
            foundInlineSource = true;
            expect(node.textContent).toBe("***both***");
            expect(node.attrs.syntax).toContain("strong");
            expect(node.attrs.syntax).toContain("emphasis");
          }
        });
        expect(foundInlineSource).toBe(true);
      }
    });
  });
});
