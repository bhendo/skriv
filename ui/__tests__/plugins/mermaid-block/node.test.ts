import { describe, it, expect } from "vitest";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { mermaidNodeSpec } from "../../../plugins/mermaid-block/node";

describe("mermaid_block node spec", () => {
  describe("schema", () => {
    it("has correct node properties", () => {
      const spec = mermaidNodeSpec;
      expect(spec.group).toBe("block");
      expect(spec.code).toBe(true);
      expect(spec.content).toBe("text*");
      expect(spec.marks).toBe("");
      expect(spec.attrs).toEqual({ language: { default: "mermaid" } });
    });
  });

  describe("parseMarkdown", () => {
    it("matches mermaidDiagram remark nodes", () => {
      expect(
        mermaidNodeSpec.parseMarkdown.match({
          type: "mermaidDiagram",
        } as MarkdownNode)
      ).toBe(true);
    });

    it("does not match regular code nodes", () => {
      expect(
        mermaidNodeSpec.parseMarkdown.match({
          type: "code",
        } as MarkdownNode)
      ).toBe(false);
    });

    it("does not match other node types", () => {
      expect(
        mermaidNodeSpec.parseMarkdown.match({
          type: "paragraph",
        } as MarkdownNode)
      ).toBe(false);
    });
  });

  describe("toMarkdown", () => {
    it("matches mermaid_block nodes", () => {
      expect(
        mermaidNodeSpec.toMarkdown.match({
          type: { name: "mermaid_block" },
        } as ProseMirrorNode)
      ).toBe(true);
    });

    it("does not match other node types", () => {
      expect(
        mermaidNodeSpec.toMarkdown.match({
          type: { name: "code_block" },
        } as ProseMirrorNode)
      ).toBe(false);
    });
  });
});
