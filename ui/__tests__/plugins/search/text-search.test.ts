import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { extractText, findMatches } from "../../../plugins/search/text-search";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level}`, 0] as const,
    },
    code_block: {
      group: "block",
      content: "text*",
      marks: "",
      code: true,
      toDOM: () => ["pre", ["code", 0]] as const,
    },
    text: { group: "inline" },
  },
  marks: {
    bold: { toDOM: () => ["strong", 0] as const },
    link: {
      attrs: { href: { default: "" } },
      toDOM: () => ["a", 0] as const,
    },
  },
});

describe("extractText", () => {
  it("extracts text from a single paragraph", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello world")]),
    ]);
    const result = extractText(doc);
    expect(result.text).toBe("hello world");
    expect(result.posMap[0]).toBe(1);
  });

  it("extracts text across multiple paragraphs with newline separators", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello")]),
      schema.node("paragraph", null, [schema.text("world")]),
    ]);
    const result = extractText(doc);
    expect(result.text).toBe("hello\nworld");
    expect(result.posMap[0]).toBe(1);
    expect(result.posMap[6]).toBe(8);
  });

  it("extracts text through inline marks (bold, links)", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("click "),
        schema.text("here", [schema.mark("link", { href: "http://example.com" })]),
        schema.text(" now"),
      ]),
    ]);
    const result = extractText(doc);
    expect(result.text).toBe("click here now");
  });

  it("extracts text from headings", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.text("Title")]),
      schema.node("paragraph", null, [schema.text("body")]),
    ]);
    const result = extractText(doc);
    expect(result.text).toBe("Title\nbody");
  });

  it("extracts text from code blocks", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("before")]),
      schema.node("code_block", null, [schema.text("let x = 1;")]),
    ]);
    const result = extractText(doc);
    expect(result.text).toContain("before");
    expect(result.text).toContain("let x = 1;");
  });

  it("returns empty text for empty doc", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph")]);
    const result = extractText(doc);
    expect(result.text).toBe("");
    expect(result.posMap).toHaveLength(0);
  });
});

describe("findMatches", () => {
  it("finds case-insensitive matches by default", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Hello hello HELLO")]),
    ]);
    const matches = findMatches(doc, "hello", false);
    expect(matches).toHaveLength(3);
  });

  it("finds case-sensitive matches when enabled", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Hello hello HELLO")]),
    ]);
    const matches = findMatches(doc, "hello", true);
    expect(matches).toHaveLength(1);
    expect(matches[0].from).toBe(7);
    expect(matches[0].to).toBe(12);
  });

  it("returns empty array for empty query", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("hello")])]);
    const matches = findMatches(doc, "", false);
    expect(matches).toHaveLength(0);
  });

  it("finds matches spanning across inline marks", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("click "),
        schema.text("here", [schema.mark("bold")]),
        schema.text(" now"),
      ]),
    ]);
    const matches = findMatches(doc, "here now", false);
    expect(matches).toHaveLength(1);
  });

  it("returns correct ProseMirror positions", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("abc def abc")]),
    ]);
    const matches = findMatches(doc, "abc", false);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ from: 1, to: 4 });
    expect(matches[1]).toEqual({ from: 9, to: 12 });
  });
});
