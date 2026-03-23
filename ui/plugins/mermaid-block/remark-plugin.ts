import { $remark } from "@milkdown/utils";

export interface RemarkNode {
  type: string;
  lang?: string | null;
  value?: string;
  children?: RemarkNode[];
}

/**
 * Remark plugin that transforms fenced code blocks with lang "mermaid"
 * into a custom "mermaidDiagram" AST node type. This allows our
 * mermaid_block ProseMirror node to claim them during Milkdown's
 * remark-to-prosemirror transformation, before code_block matches.
 */
export function remarkMermaid() {
  return (tree: RemarkNode) => {
    visit(tree);
  };
}

/**
 * Milkdown wrapper for the remark plugin. Uses $remark() to register
 * at the correct point in Milkdown's initialization lifecycle.
 */
export const remarkMermaidPlugin = $remark("remarkMermaid", () => remarkMermaid);

function visit(node: RemarkNode): void {
  if (!node.children) return;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "code" && child.lang === "mermaid") {
      node.children[i] = {
        type: "mermaidDiagram",
        value: child.value,
      };
    } else {
      visit(child);
    }
  }
}
