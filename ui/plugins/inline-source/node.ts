import { $node } from "@milkdown/utils";
import { MARK_SYNTAX, parseInlineSyntax } from "./syntax";

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
        if (parsed.marks.length === 1 && parsed.marks[0] === "inlineCode") {
          state.addNode("inlineCode", undefined, parsed.text);
        } else {
          for (const markName of parsed.marks) {
            const remarkType = MARK_SYNTAX[markName]?.remarkType ?? markName;
            state.openNode(remarkType);
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
