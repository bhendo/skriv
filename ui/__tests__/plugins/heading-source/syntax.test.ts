import { describe, it, expect } from "vitest";
import { Schema, Fragment } from "@milkdown/kit/prose/model";
import {
  parseHeadingPrefix,
  buildHeadingPrefix,
  stripPrefix,
} from "../../../plugins/heading-source/syntax";

describe("parseHeadingPrefix", () => {
  it("parses h1 prefix", () => {
    expect(parseHeadingPrefix("# Hello")).toEqual({ level: 1, contentStart: 2 });
  });

  it("parses h2 prefix", () => {
    expect(parseHeadingPrefix("## Hello")).toEqual({ level: 2, contentStart: 3 });
  });

  it("parses h3 prefix", () => {
    expect(parseHeadingPrefix("### Hello")).toEqual({ level: 3, contentStart: 4 });
  });

  it("parses h6 prefix", () => {
    expect(parseHeadingPrefix("###### Hello")).toEqual({ level: 6, contentStart: 7 });
  });

  it("parses prefix without trailing space", () => {
    expect(parseHeadingPrefix("##Hello")).toEqual({ level: 2, contentStart: 2 });
  });

  it("parses prefix-only text (with space)", () => {
    expect(parseHeadingPrefix("## ")).toEqual({ level: 2, contentStart: 3 });
  });

  it("parses prefix-only text (no space)", () => {
    expect(parseHeadingPrefix("##")).toEqual({ level: 2, contentStart: 2 });
  });

  it("returns null for no # at start", () => {
    expect(parseHeadingPrefix("Hello")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseHeadingPrefix("")).toBeNull();
  });

  it("clamps at 6 — only parses first 6 #s", () => {
    // Regex matches 6 #s; the 7th # is not consumed as part of the prefix
    expect(parseHeadingPrefix("####### Hello")).toEqual({ level: 6, contentStart: 6 });
  });
});

describe("buildHeadingPrefix", () => {
  it("builds h1 prefix", () => {
    expect(buildHeadingPrefix(1)).toBe("# ");
  });

  it("builds h2 prefix", () => {
    expect(buildHeadingPrefix(2)).toBe("## ");
  });

  it("builds h6 prefix", () => {
    expect(buildHeadingPrefix(6)).toBe("###### ");
  });
});

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
  },
});

/** Fragment.textContent is not available in this prosemirror version */
function fragmentText(f: Fragment): string {
  return f.textBetween(0, f.size);
}

describe("stripPrefix", () => {
  it("strips prefix from a plain text node", () => {
    const textNode = schema.text("## Hello");
    const content = Fragment.from(textNode);
    const result = stripPrefix(content, 3, schema);
    expect(fragmentText(result)).toBe("Hello");
  });

  it("strips prefix that spans entire first text node", () => {
    const prefix = schema.text("## ");
    const body = schema.text("Hello");
    const content = Fragment.from([prefix, body]);
    const result = stripPrefix(content, 3, schema);
    expect(fragmentText(result)).toBe("Hello");
  });

  it("preserves marks on remaining text after partial strip", () => {
    const boldText = schema.text("## bold", [schema.marks.strong.create()]);
    const content = Fragment.from(boldText);
    const result = stripPrefix(content, 3, schema);
    expect(fragmentText(result)).toBe("bold");
    let foundMark = false;
    result.forEach((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "strong")) {
        foundMark = true;
      }
    });
    expect(foundMark).toBe(true);
  });

  it("returns original content when prefixLen is 0", () => {
    const textNode = schema.text("Hello");
    const content = Fragment.from(textNode);
    const result = stripPrefix(content, 0, schema);
    expect(fragmentText(result)).toBe("Hello");
  });

  it("returns empty fragment when prefix consumes all content", () => {
    const textNode = schema.text("## ");
    const content = Fragment.from(textNode);
    const result = stripPrefix(content, 3, schema);
    expect(result.size).toBe(0);
  });

  it("handles strip across multiple text nodes", () => {
    const node1 = schema.text("##");
    const node2 = schema.text(" Hello");
    const content = Fragment.from([node1, node2]);
    const result = stripPrefix(content, 3, schema);
    expect(fragmentText(result)).toBe("Hello");
  });
});
