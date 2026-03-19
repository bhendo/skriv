import { describe, it, expect } from "vitest";
import { parseMarker, markerForListItem } from "../../../plugins/list-source/marker";
import { Schema } from "@milkdown/kit/prose/model";

describe("parseMarker", () => {
  it("parses dash as bullet", () => {
    expect(parseMarker("-")).toEqual({ type: "bullet" });
  });

  it("parses asterisk as bullet", () => {
    expect(parseMarker("*")).toEqual({ type: "bullet" });
  });

  it("parses plus as bullet", () => {
    expect(parseMarker("+")).toEqual({ type: "bullet" });
  });

  it("parses '1.' as ordered with startNumber 1", () => {
    expect(parseMarker("1.")).toEqual({ type: "ordered", startNumber: 1 });
  });

  it("parses '2.' as ordered with startNumber 2", () => {
    expect(parseMarker("2.")).toEqual({ type: "ordered", startNumber: 2 });
  });

  it("parses '99.' as ordered with startNumber 99", () => {
    expect(parseMarker("99.")).toEqual({ type: "ordered", startNumber: 99 });
  });

  it("parses empty string as unwrap", () => {
    expect(parseMarker("")).toEqual({ type: "unwrap" });
  });

  it("parses whitespace-only as unwrap", () => {
    expect(parseMarker("   ")).toEqual({ type: "unwrap" });
  });

  it("trims whitespace around valid markers", () => {
    expect(parseMarker(" - ")).toEqual({ type: "bullet" });
    expect(parseMarker("  1. ")).toEqual({ type: "ordered", startNumber: 1 });
  });

  it("rejects invalid input", () => {
    expect(parseMarker("abc")).toEqual({ type: "invalid" });
    expect(parseMarker("--")).toEqual({ type: "invalid" });
    expect(parseMarker("1")).toEqual({ type: "invalid" });
    expect(parseMarker(".")).toEqual({ type: "invalid" });
    expect(parseMarker("1,")).toEqual({ type: "invalid" });
    expect(parseMarker("a.")).toEqual({ type: "invalid" });
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    list_item: {
      content: "paragraph block*",
      group: "listItem",
      defining: true,
      attrs: {
        label: { default: "\u2022" },
        listType: { default: "bullet" },
        spread: { default: true },
      },
      toDOM: () => ["li", 0] as const,
    },
    bullet_list: {
      content: "list_item+",
      group: "block",
      toDOM: () => ["ul", 0] as const,
    },
    ordered_list: {
      content: "list_item+",
      group: "block",
      attrs: { order: { default: 1 } },
      toDOM: () => ["ol", 0] as const,
    },
  },
});

describe("markerForListItem", () => {
  it("returns '-' for bullet list items", () => {
    const item = schema.nodes.list_item.create(
      { listType: "bullet", label: "\u2022" },
      schema.nodes.paragraph.create()
    );
    expect(markerForListItem(item)).toBe("-");
  });

  it("returns the label for ordered list items", () => {
    const item = schema.nodes.list_item.create(
      { listType: "ordered", label: "3." },
      schema.nodes.paragraph.create()
    );
    expect(markerForListItem(item)).toBe("3.");
  });

  it("returns '1.' for ordered list items with no label", () => {
    const item = schema.nodes.list_item.create(
      { listType: "ordered", label: "" },
      schema.nodes.paragraph.create()
    );
    expect(markerForListItem(item)).toBe("1.");
  });
});
