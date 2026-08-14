import { describe, it, expect } from "vitest";
import { fileNameFromPath, parentDirFromPath, abbreviateHome, windowTitle } from "../../utils/path";

describe("fileNameFromPath", () => {
  it("returns the final segment", () => {
    expect(fileNameFromPath("/Users/b/notes/ideas.md")).toBe("ideas.md");
    expect(fileNameFromPath("C:\\docs\\ideas.md")).toBe("ideas.md");
  });

  it("falls back to Untitled", () => {
    expect(fileNameFromPath(null)).toBe("Untitled");
    expect(fileNameFromPath("")).toBe("Untitled");
  });
});

describe("parentDirFromPath", () => {
  it("returns everything before the last separator", () => {
    expect(parentDirFromPath("/Users/b/notes/ideas.md")).toBe("/Users/b/notes");
    expect(parentDirFromPath("C:\\docs\\ideas.md")).toBe("C:\\docs");
  });

  it("returns empty for bare names and root-level files", () => {
    expect(parentDirFromPath("ideas.md")).toBe("");
    expect(parentDirFromPath("/ideas.md")).toBe("");
  });
});

describe("abbreviateHome", () => {
  it("replaces the home prefix with ~", () => {
    expect(abbreviateHome("/Users/b/docs", "/Users/b")).toBe("~/docs");
    expect(abbreviateHome("/Users/b", "/Users/b")).toBe("~");
  });

  it("tolerates a trailing separator on home", () => {
    expect(abbreviateHome("/Users/b/docs", "/Users/b/")).toBe("~/docs");
  });

  it("only abbreviates at a path-segment boundary", () => {
    expect(abbreviateHome("/Users/bob/docs", "/Users/b")).toBe("/Users/bob/docs");
  });

  it("passes through when home is unknown", () => {
    expect(abbreviateHome("/Users/b/docs", null)).toBe("/Users/b/docs");
  });
});

describe("windowTitle", () => {
  it("shows name and abbreviated directory", () => {
    expect(windowTitle("/Users/b/docs/ideas.md", "/Users/b", false)).toBe("ideas.md — ~/docs");
  });

  it("appends the Edited marker", () => {
    expect(windowTitle("/Users/b/docs/ideas.md", "/Users/b", true)).toBe(
      "ideas.md — ~/docs — Edited"
    );
  });

  it("shows the full directory when home is unknown", () => {
    expect(windowTitle("/Users/b/docs/ideas.md", null, false)).toBe("ideas.md — /Users/b/docs");
  });

  it("shows Untitled with no directory when no file is open", () => {
    expect(windowTitle(null, "/Users/b", false)).toBe("Untitled");
    expect(windowTitle(null, "/Users/b", true)).toBe("Untitled — Edited");
  });
});
