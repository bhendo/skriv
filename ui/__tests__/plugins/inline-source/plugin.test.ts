import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { findMarkSpan } from "../../../plugins/inline-source/plugin";

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
