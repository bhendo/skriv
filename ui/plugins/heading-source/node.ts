import { $node } from "@milkdown/utils";
import { parseHeadingPrefix, stripPrefix } from "./syntax";

export const headingSourceNode = $node("heading_source", () => ({
  group: "block",
  content: "inline*",
  defining: true,
  attrs: {
    level: { default: 1 },
    id: { default: "" },
  },
  toDOM: (node) =>
    [
      `h${node.attrs.level}`,
      { class: "heading-source", id: node.attrs.id || undefined },
      0,
    ] as const,
  parseDOM: [],
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (node) => node.type.name === "heading_source",
    runner: (state, node) => {
      const text = node.textContent;
      const parsed = parseHeadingPrefix(text);
      const level = parsed?.level ?? (node.attrs.level as number);
      // Strip the prefix before serializing to avoid double-prefix output
      // (remark-stringify adds its own ## from the depth attr)
      const schema = node.type.schema;
      const strippedContent = parsed
        ? stripPrefix(node.content, parsed.contentStart, schema)
        : node.content;
      state.openNode("heading", undefined, { depth: level });
      state.next(strippedContent);
      state.closeNode();
    },
  },
}));
