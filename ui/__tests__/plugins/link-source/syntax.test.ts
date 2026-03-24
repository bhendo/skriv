import { describe, it, expect } from "vitest";
import {
  parseLinkSyntax,
  buildLinkRawText,
  findLinkTrailingSplit,
  normalizeHref,
  LINK_INPUT_RULE_REGEX,
} from "../../../plugins/link-source/syntax";

describe("parseLinkSyntax", () => {
  it("parses a simple link", () => {
    expect(parseLinkSyntax("[text](https://example.com)")).toEqual({
      text: "text",
      href: "https://example.com",
      title: "",
    });
  });
  it("parses a link with title", () => {
    expect(parseLinkSyntax('[text](url "My Title")')).toEqual({
      text: "text",
      href: "https://url",
      title: "My Title",
    });
  });
  it("preserves inner mark syntax in text", () => {
    expect(parseLinkSyntax("[**bold**](url)")).toEqual({
      text: "**bold**",
      href: "https://url",
      title: "",
    });
  });
  it("returns null for empty string", () => {
    expect(parseLinkSyntax("")).toBeNull();
  });
  it("returns null for incomplete syntax — missing closing paren", () => {
    expect(parseLinkSyntax("[text](url")).toBeNull();
  });
  it("returns null for incomplete syntax — missing opening bracket", () => {
    expect(parseLinkSyntax("text](url)")).toBeNull();
  });
  it("returns null for empty text", () => {
    expect(parseLinkSyntax("[](url)")).toBeNull();
  });
  it("returns null for empty url", () => {
    expect(parseLinkSyntax("[text]()")).toBeNull();
  });
  it("returns null for plain text", () => {
    expect(parseLinkSyntax("just plain text")).toBeNull();
  });
  it("returns null for just brackets", () => {
    expect(parseLinkSyntax("[]()")).toBeNull();
  });
  it("handles urls with special characters", () => {
    expect(parseLinkSyntax("[text](https://example.com/path?q=1&r=2#anchor)")).toEqual({
      text: "text",
      href: "https://example.com/path?q=1&r=2#anchor",
      title: "",
    });
  });
  it("handles text with spaces", () => {
    expect(parseLinkSyntax("[click here](url)")).toEqual({
      text: "click here",
      href: "https://url",
      title: "",
    });
  });
  it("normalizes bare domain to https", () => {
    expect(parseLinkSyntax("[text](example.com)")).toEqual({
      text: "text",
      href: "https://example.com",
      title: "",
    });
  });
  it("preserves existing https protocol", () => {
    expect(parseLinkSyntax("[text](https://example.com)")!.href).toBe("https://example.com");
  });
  it("preserves existing http protocol", () => {
    expect(parseLinkSyntax("[text](http://example.com)")!.href).toBe("http://example.com");
  });
  it("preserves mailto protocol", () => {
    expect(parseLinkSyntax("[text](mailto:user@example.com)")!.href).toBe(
      "mailto:user@example.com"
    );
  });
  it("preserves anchor links", () => {
    expect(parseLinkSyntax("[text](#section)")!.href).toBe("#section");
  });
  it("preserves relative paths", () => {
    expect(parseLinkSyntax("[text](/path/to/page)")!.href).toBe("/path/to/page");
  });
});

describe("buildLinkRawText", () => {
  it("builds simple link syntax", () => {
    expect(buildLinkRawText("text", "https://example.com")).toBe("[text](https://example.com)");
  });
  it("builds link syntax with title", () => {
    expect(buildLinkRawText("text", "url", "My Title")).toBe('[text](url "My Title")');
  });
  it("builds link syntax without title when empty", () => {
    expect(buildLinkRawText("text", "url", "")).toBe("[text](url)");
  });
  it("builds link syntax without title when undefined", () => {
    expect(buildLinkRawText("text", "url")).toBe("[text](url)");
  });
});

describe("LINK_INPUT_RULE_REGEX", () => {
  it("matches simple link syntax", () => {
    const match = "[text](url)".match(LINK_INPUT_RULE_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("text");
    expect(match![2]).toBe("url");
  });
  it("matches link with long URL", () => {
    const match = "[click here](https://example.com/path?q=1)".match(LINK_INPUT_RULE_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("click here");
    expect(match![2]).toBe("https://example.com/path?q=1");
  });
  it("does not match empty text", () => {
    expect("[](url)".match(LINK_INPUT_RULE_REGEX)).toBeNull();
  });
  it("does not match empty url", () => {
    expect("[text]()".match(LINK_INPUT_RULE_REGEX)).toBeNull();
  });
  it("does not greedily match across multiple links", () => {
    const match = "[foo](bar) and [baz](qux)".match(LINK_INPUT_RULE_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("baz");
    expect(match![2]).toBe("qux");
  });
});

describe("normalizeHref", () => {
  it("prepends https:// to bare domains", () => {
    expect(normalizeHref("example.com")).toBe("https://example.com");
  });
  it("prepends https:// to domain with path", () => {
    expect(normalizeHref("example.com/path")).toBe("https://example.com/path");
  });
  it("preserves https://", () => {
    expect(normalizeHref("https://example.com")).toBe("https://example.com");
  });
  it("preserves http://", () => {
    expect(normalizeHref("http://example.com")).toBe("http://example.com");
  });
  it("preserves mailto:", () => {
    expect(normalizeHref("mailto:user@example.com")).toBe("mailto:user@example.com");
  });
  it("preserves ftp://", () => {
    expect(normalizeHref("ftp://files.example.com")).toBe("ftp://files.example.com");
  });
  it("preserves anchor links", () => {
    expect(normalizeHref("#section")).toBe("#section");
  });
  it("preserves relative paths", () => {
    expect(normalizeHref("/path/to/page")).toBe("/path/to/page");
  });
  it("returns empty string unchanged", () => {
    expect(normalizeHref("")).toBe("");
  });
});

describe("findLinkTrailingSplit", () => {
  it("returns null for empty string", () => {
    expect(findLinkTrailingSplit("")).toBeNull();
  });
  it("returns null for complete link syntax (no trailing)", () => {
    expect(findLinkTrailingSplit("[text](url)")).toBeNull();
  });
  it("returns null for plain text", () => {
    expect(findLinkTrailingSplit("just text")).toBeNull();
  });
  it("returns null for incomplete syntax", () => {
    expect(findLinkTrailingSplit("[text](url")).toBeNull();
  });
  it("splits link with trailing space", () => {
    expect(findLinkTrailingSplit("[text](url) ")).toEqual({
      text: "text",
      href: "https://url",
      title: "",
      trailing: " ",
    });
  });
  it("splits link with trailing text", () => {
    expect(findLinkTrailingSplit("[text](url) and more")).toEqual({
      text: "text",
      href: "https://url",
      title: "",
      trailing: " and more",
    });
  });
  it("splits link with trailing character", () => {
    expect(findLinkTrailingSplit("[text](url)x")).toEqual({
      text: "text",
      href: "https://url",
      title: "",
      trailing: "x",
    });
  });
  it("splits link with title and trailing text", () => {
    expect(findLinkTrailingSplit('[text](url "title") more')).toEqual({
      text: "text",
      href: "https://url",
      title: "title",
      trailing: " more",
    });
  });
});
