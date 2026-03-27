import { describe, it, expect } from "vitest";
import { Node, Schema } from "@milkdown/kit/prose/model";
import { extractHeadingsFromPM } from "../../toc/extract-pm";

const testSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 }, id: { default: "" } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    heading_source: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 }, id: { default: "" } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    text: { group: "inline" },
  },
});

function doc(...children: Node[]) {
  return testSchema.node("doc", null, children);
}
function heading(level: number, text: string) {
  return testSchema.node("heading", { level }, text ? [testSchema.text(text)] : []);
}
function headingSource(level: number, text: string) {
  return testSchema.node("heading_source", { level }, text ? [testSchema.text(text)] : []);
}
function paragraph(text: string) {
  return testSchema.node("paragraph", null, text ? [testSchema.text(text)] : []);
}

describe("extractHeadingsFromPM", () => {
  it("extracts headings with correct levels and positions", () => {
    const pmDoc = doc(
      heading(1, "Introduction"),
      paragraph("Some text"),
      heading(2, "Background"),
    );
    const result = extractHeadingsFromPM(pmDoc);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ level: 1, text: "Introduction", pos: 0 });
    expect(result[1]).toEqual(expect.objectContaining({ level: 2, text: "Background" }));
  });

  it("extracts heading_source nodes and strips ATX prefix", () => {
    const pmDoc = doc(
      headingSource(2, "## Editing"),
      paragraph("body"),
    );
    const result = extractHeadingsFromPM(pmDoc);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ level: 2, text: "Editing" }));
  });

  it("returns empty array for document with no headings", () => {
    const pmDoc = doc(paragraph("Just text"));
    expect(extractHeadingsFromPM(pmDoc)).toEqual([]);
  });

  it("handles mixed heading and heading_source nodes, stripping prefix from source", () => {
    const pmDoc = doc(
      heading(1, "Title"),
      headingSource(2, "## Subtitle"),
      heading(3, "Section"),
    );
    const result = extractHeadingsFromPM(pmDoc);
    expect(result).toHaveLength(3);
    expect(result.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(result.map((h) => h.text)).toEqual(["Title", "Subtitle", "Section"]);
  });
});
