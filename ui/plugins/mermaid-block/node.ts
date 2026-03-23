import { $node } from "@milkdown/utils";
import type { Node as ProseMirrorNode, NodeType } from "@milkdown/kit/prose/model";
import type { MarkdownNode, ParserState, SerializerState } from "@milkdown/kit/transformer";

/**
 * Exported node spec for direct testing without Milkdown context.
 * The $node() call below wraps this for Milkdown registration.
 */
export const mermaidNodeSpec = {
  group: "block" as const,
  content: "text*" as const,
  marks: "" as const,
  code: true,
  defining: true,
  attrs: {
    language: { default: "mermaid" },
  },
  toDOM: () => ["div", { class: "mermaid-block" }, 0] as const,
  parseDOM: [],
  parseMarkdown: {
    match: (node: MarkdownNode) => node.type === "mermaidDiagram",
    runner: (state: ParserState, node: MarkdownNode, type: NodeType) => {
      state.openNode(type, { language: "mermaid" });
      if (node.value) {
        state.addText(node.value as string);
      }
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node: ProseMirrorNode) => node.type.name === "mermaid_block",
    runner: (state: SerializerState, node: ProseMirrorNode) => {
      state.addNode("code", undefined, node.textContent, {
        lang: "mermaid",
      });
    },
  },
};

export const mermaidBlockNode = $node("mermaid_block", () => mermaidNodeSpec);
