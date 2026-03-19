import { $node } from "@milkdown/utils";
import { parseInlineSyntax } from "./syntax";

export const inlineSourceNode = $node("inline_source", () => ({
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  attrs: {
    syntax: { default: "" },
  },
  toDOM: () => ["span", { class: "inline-source" }, 0] as const,
  parseDOM: [],
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (node) => node.type.name === "inline_source",
    runner: (state, node) => {
      const raw = node.textContent;
      const parsed = parseInlineSyntax(raw);
      if (parsed.marks.length > 0) {
        const remarkTypeMap: Record<string, string> = {
          strong: "strong",
          emphasis: "emphasis",
          strike_through: "delete",
          inlineCode: "inlineCode",
        };
        if (parsed.marks.length === 1 && parsed.marks[0] === "inlineCode") {
          state.addNode("inlineCode", undefined, parsed.text);
        } else {
          for (const markName of parsed.marks) {
            state.openNode(remarkTypeMap[markName] ?? markName);
          }
          state.addNode("text", undefined, parsed.text);
          for (let i = parsed.marks.length - 1; i >= 0; i--) {
            state.closeNode();
          }
        }
      } else {
        state.addNode("text", undefined, raw);
      }
    },
  },
}));
