import { describe, it, expect } from "vitest";
import { extractHeadingsFromText } from "../../toc/extract-cm";

describe("extractHeadingsFromText", () => {
  it("extracts headings with correct levels and positions", () => {
    const text = "# Introduction\n\nSome text\n\n## Background\n";
    const result = extractHeadingsFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ level: 1, text: "Introduction", pos: 0 });
    expect(result[1]).toEqual({ level: 2, text: "Background", pos: 27 });
  });

  it("handles all 6 heading levels", () => {
    const text = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n";
    const result = extractHeadingsFromText(text);
    expect(result).toHaveLength(6);
    expect(result.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("skips headings inside fenced code blocks", () => {
    const text = "# Real Heading\n\n```\n# Not a heading\n```\n\n## Another Real\n";
    const result = extractHeadingsFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Real Heading");
    expect(result[1].text).toBe("Another Real");
  });

  it("returns empty array for text with no headings", () => {
    expect(extractHeadingsFromText("Just some text\n")).toEqual([]);
  });

  it("ignores lines with more than 6 hashes", () => {
    const text = "####### Not a heading\n# Real\n";
    const result = extractHeadingsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real");
  });

  it("handles headings with inline formatting markers", () => {
    const text = "# **Bold** heading\n## *Italic* text\n";
    const result = extractHeadingsFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("**Bold** heading");
    expect(result[1].text).toBe("*Italic* text");
  });
});
