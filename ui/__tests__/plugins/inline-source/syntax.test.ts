import { describe, it, expect } from "vitest";
import {
  buildRawText,
  parseInlineSyntax,
  computePrefixLength,
  findTrailingSplit,
} from "../../../plugins/inline-source/syntax";

describe("buildRawText", () => {
  it("wraps text with strong markers", () => {
    expect(buildRawText("bold", ["strong"])).toBe("**bold**");
  });
  it("wraps text with emphasis markers", () => {
    expect(buildRawText("italic", ["emphasis"])).toBe("*italic*");
  });
  it("wraps text with strikethrough markers", () => {
    expect(buildRawText("struck", ["strike_through"])).toBe("~~struck~~");
  });
  it("wraps text with inline code markers", () => {
    expect(buildRawText("code", ["inlineCode"])).toBe("`code`");
  });
  it("wraps text with nested same-boundary marks (strong + emphasis)", () => {
    expect(buildRawText("both", ["strong", "emphasis"])).toBe("***both***");
  });
  it("wraps text with nested marks regardless of input order", () => {
    expect(buildRawText("both", ["emphasis", "strong"])).toBe("***both***");
  });
  it("returns plain text when no marks", () => {
    expect(buildRawText("plain", [])).toBe("plain");
  });
});

describe("parseInlineSyntax", () => {
  it("parses strong markers", () => {
    expect(parseInlineSyntax("**bold**")).toEqual({
      text: "bold",
      marks: ["strong"],
    });
  });
  it("parses emphasis markers", () => {
    expect(parseInlineSyntax("*italic*")).toEqual({
      text: "italic",
      marks: ["emphasis"],
    });
  });
  it("parses strikethrough markers", () => {
    expect(parseInlineSyntax("~~struck~~")).toEqual({
      text: "struck",
      marks: ["strike_through"],
    });
  });
  it("parses inline code markers", () => {
    expect(parseInlineSyntax("`code`")).toEqual({
      text: "code",
      marks: ["inlineCode"],
    });
  });
  it("parses triple asterisk as strong + emphasis", () => {
    expect(parseInlineSyntax("***both***")).toEqual({
      text: "both",
      marks: ["strong", "emphasis"],
    });
  });
  it("parses underscore variants", () => {
    expect(parseInlineSyntax("__bold__")).toEqual({
      text: "bold",
      marks: ["strong"],
    });
    expect(parseInlineSyntax("_italic_")).toEqual({
      text: "italic",
      marks: ["emphasis"],
    });
    expect(parseInlineSyntax("___both___")).toEqual({
      text: "both",
      marks: ["strong", "emphasis"],
    });
  });
  it("returns plain text for incomplete syntax", () => {
    expect(parseInlineSyntax("**bold")).toEqual({ text: "**bold", marks: [] });
    expect(parseInlineSyntax("*italic")).toEqual({
      text: "*italic",
      marks: [],
    });
  });
  it("returns plain text for empty input", () => {
    expect(parseInlineSyntax("")).toEqual({ text: "", marks: [] });
  });
  it("returns plain text for no markers", () => {
    expect(parseInlineSyntax("plain text")).toEqual({
      text: "plain text",
      marks: [],
    });
  });
});

describe("computePrefixLength", () => {
  it("returns prefix length for strong", () => {
    expect(computePrefixLength(["strong"])).toBe(2);
  });
  it("returns prefix length for emphasis", () => {
    expect(computePrefixLength(["emphasis"])).toBe(1);
  });
  it("returns prefix length for nested strong + emphasis", () => {
    expect(computePrefixLength(["strong", "emphasis"])).toBe(3);
  });
  it("returns prefix length for strikethrough", () => {
    expect(computePrefixLength(["strike_through"])).toBe(2);
  });
  it("returns prefix length for inline code", () => {
    expect(computePrefixLength(["inlineCode"])).toBe(1);
  });
  it("returns 0 for no marks", () => {
    expect(computePrefixLength([])).toBe(0);
  });
});

describe("findTrailingSplit", () => {
  it("returns null for empty string", () => {
    expect(findTrailingSplit("")).toBeNull();
  });

  it("returns null for complete strong syntax (no trailing)", () => {
    expect(findTrailingSplit("**bold**")).toBeNull();
  });

  it("returns null for complete emphasis syntax (no trailing)", () => {
    expect(findTrailingSplit("*italic*")).toBeNull();
  });

  it("returns null for plain text with no syntax", () => {
    expect(findTrailingSplit("plain text")).toBeNull();
  });

  it("returns null for incomplete syntax", () => {
    expect(findTrailingSplit("**bold")).toBeNull();
  });

  it("splits strong syntax with trailing space", () => {
    const result = findTrailingSplit("**test** ");
    expect(result).toEqual({
      innerText: "test",
      marks: ["strong"],
      trailing: " ",
    });
  });

  it("splits strong syntax with trailing character", () => {
    const result = findTrailingSplit("**test**x");
    expect(result).toEqual({
      innerText: "test",
      marks: ["strong"],
      trailing: "x",
    });
  });

  it("splits strong syntax with trailing text", () => {
    const result = findTrailingSplit("**test** hello world");
    expect(result).toEqual({
      innerText: "test",
      marks: ["strong"],
      trailing: " hello world",
    });
  });

  it("splits emphasis syntax with trailing space", () => {
    const result = findTrailingSplit("*italic* ");
    expect(result).toEqual({
      innerText: "italic",
      marks: ["emphasis"],
      trailing: " ",
    });
  });

  it("splits strikethrough syntax with trailing text", () => {
    const result = findTrailingSplit("~~struck~~ more");
    expect(result).toEqual({
      innerText: "struck",
      marks: ["strike_through"],
      trailing: " more",
    });
  });

  it("splits inline code syntax with trailing text", () => {
    const result = findTrailingSplit("`code` more");
    expect(result).toEqual({
      innerText: "code",
      marks: ["inlineCode"],
      trailing: " more",
    });
  });

  it("splits nested strong+emphasis syntax with trailing text", () => {
    const result = findTrailingSplit("***both*** x");
    expect(result).toEqual({
      innerText: "both",
      marks: ["strong", "emphasis"],
      trailing: " x",
    });
  });
});
