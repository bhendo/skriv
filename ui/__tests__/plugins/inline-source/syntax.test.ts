import { describe, it, expect } from "vitest";
import { buildRawText } from "../../../plugins/inline-source/syntax";

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
