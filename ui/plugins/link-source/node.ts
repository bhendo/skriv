import { $node } from "@milkdown/utils";
import { parseLinkSyntax } from "./syntax";
import { MARK_SYNTAX, parseInlineSyntax } from "../inline-source/syntax";

interface SerializerState {
  openNode(type: string, attrs?: Record<string, unknown>): void;
  closeNode(): void;
  addNode(type: string, attrs?: Record<string, unknown>, value?: string): void;
}

interface SerializerNode {
  textContent: string;
  attrs: { href: string; title: string };
}

function serializeInlineText(state: SerializerState, text: string): void {
  const parsed = parseInlineSyntax(text);
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
    state.addNode("text", undefined, text);
  }
}

export function linkSourceSerializerRunner(state: SerializerState, node: SerializerNode): void {
  const raw = node.textContent;
  const parsed = parseLinkSyntax(raw);

  if (parsed) {
    // Branch 1: raw text parses as valid link syntax
    state.openNode("link", {
      url: parsed.href,
      title: parsed.title || undefined,
    });
    serializeInlineText(state, parsed.text);
    state.closeNode();
  } else if (node.attrs.href) {
    // Branch 2: invalid syntax but has href attr as fallback
    state.openNode("link", {
      url: node.attrs.href,
      title: node.attrs.title || undefined,
    });
    state.addNode("text", undefined, raw);
    state.closeNode();
  } else {
    // Branch 3: no valid link data — serialize as plain text
    state.addNode("text", undefined, raw);
  }
}

export const linkSourceNode = $node("link_source", () => ({
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  attrs: {
    href: { default: "" },
    title: { default: "" },
  },
  toDOM: () => ["span", { class: "link-source" }, 0] as const,
  parseDOM: [],
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (node) => node.type.name === "link_source",
    runner: (state, node) => {
      linkSourceSerializerRunner(state as never, node as never);
    },
  },
}));
