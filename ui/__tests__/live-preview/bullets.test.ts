import { describe, it, expect } from "vitest";
import { sourceMarkdownParser } from "../../markdown/parser";
import { listDepth, bulletGlyph } from "../../live-preview/bullets";

/** Depths of every `-` list mark in `source`, in document order. */
function bulletDepths(source: string): number[] {
  const depths: number[] = [];
  sourceMarkdownParser.parse(source).iterate({
    enter(node) {
      if (node.name === "ListMark" && source.slice(node.from, node.to) === "-") {
        depths.push(listDepth(node.node));
      }
    },
  });
  return depths;
}

describe("listDepth", () => {
  it("counts BulletList ancestors of each mark", () => {
    const source = ["- one", "  - two", "    - three", "      - four", "- one again"].join("\n");
    expect(bulletDepths(source)).toEqual([1, 2, 3, 4, 1]);
  });

  it("counts OrderedList ancestors too", () => {
    const source = ["1. ordered", "   - bullet under ordered"].join("\n");
    expect(bulletDepths(source)).toEqual([2]);
  });
});

describe("bulletGlyph", () => {
  it("cycles • ◦ ▪ by depth", () => {
    expect([1, 2, 3, 4, 5, 6].map(bulletGlyph)).toEqual(["•", "◦", "▪", "•", "◦", "▪"]);
  });
});
