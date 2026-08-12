import { describe, it, expect } from "vitest";
import { extractHeadings, headingsEqual, activeHeadingIndex } from "../../toc/extract";
import type { TocHeading } from "../../types/toc";

describe("extractHeadings", () => {
  it("extracts headings with correct levels and positions", () => {
    const text = "# Introduction\n\nSome text\n\n## Background\n";
    const result = extractHeadings(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ level: 1, text: "Introduction", pos: 0 });
    expect(result[1]).toEqual({ level: 2, text: "Background", pos: 27 });
  });

  it("handles all 6 heading levels", () => {
    const text = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n";
    const result = extractHeadings(text);
    expect(result).toHaveLength(6);
    expect(result.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("skips headings inside fenced code blocks", () => {
    const text = "# Real Heading\n\n```\n# Not a heading\n```\n\n## Another Real\n";
    const result = extractHeadings(text);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Real Heading");
    expect(result[1].text).toBe("Another Real");
  });

  it("returns empty array for text with no headings", () => {
    expect(extractHeadings("Just some text\n")).toEqual([]);
  });

  it("ignores lines with more than 6 hashes", () => {
    const text = "####### Not a heading\n# Real\n";
    const result = extractHeadings(text);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real");
  });

  it("handles headings with inline formatting markers", () => {
    const text = "# **Bold** heading\n## *Italic* text\n";
    const result = extractHeadings(text);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("**Bold** heading");
    expect(result[1].text).toBe("*Italic* text");
  });

  it("extracts setext headings", () => {
    const text = "Title\n=====\n\nSubtitle\n--------\n";
    const result = extractHeadings(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ level: 1, text: "Title", pos: 0 });
    expect(result[1]).toEqual({ level: 2, text: "Subtitle", pos: 13 });
  });

  it("strips closing hashes from ATX headings", () => {
    const result = extractHeadings("# Title ##\n");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Title");
  });

  it("includes ATX headings indented up to 3 spaces", () => {
    const result = extractHeadings("   # Indented\n");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Indented");
  });

  it("skips indented code blocks", () => {
    const text = "# Real\n\n    # code, not a heading\n";
    const result = extractHeadings(text);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real");
  });

  it("skips fenced code nested in a list", () => {
    const text = "- item\n\n  ```\n  # not a heading\n  ```\n";
    expect(extractHeadings(text)).toEqual([]);
  });

  it("includes headings inside blockquotes", () => {
    const result = extractHeadings("> # Quoted\n");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ level: 1, text: "Quoted" });
  });
});

describe("headingsEqual", () => {
  const a: TocHeading[] = [{ level: 1, text: "A", pos: 0 }];

  it("compares by level, text, and pos", () => {
    expect(headingsEqual(a, [{ level: 1, text: "A", pos: 0 }])).toBe(true);
    expect(headingsEqual(a, [{ level: 2, text: "A", pos: 0 }])).toBe(false);
    expect(headingsEqual(a, [{ level: 1, text: "B", pos: 0 }])).toBe(false);
    expect(headingsEqual(a, [{ level: 1, text: "A", pos: 5 }])).toBe(false);
    expect(headingsEqual(a, [])).toBe(false);
    expect(headingsEqual([], [])).toBe(true);
  });
});

describe("activeHeadingIndex", () => {
  const headings: TocHeading[] = [
    { level: 1, text: "First", pos: 10 },
    { level: 2, text: "Second", pos: 50 },
    { level: 2, text: "Third", pos: 100 },
  ];

  it("returns -1 for an empty list", () => {
    expect(activeHeadingIndex([], 0)).toBe(-1);
  });

  it("returns -1 when topPos is before the first heading", () => {
    expect(activeHeadingIndex(headings, 5)).toBe(-1);
  });

  it("matches a heading exactly at topPos", () => {
    expect(activeHeadingIndex(headings, 50)).toBe(1);
  });

  it("returns the last heading at or before topPos", () => {
    expect(activeHeadingIndex(headings, 75)).toBe(1);
    expect(activeHeadingIndex(headings, 5000)).toBe(2);
  });
});
