import { describe, it, expect } from "vitest";
import { remarkMermaid, RemarkNode } from "../../../plugins/mermaid-block/remark-plugin";

function makeTree(children: RemarkNode[]) {
  return { type: "root", children };
}

describe("remarkMermaid", () => {
  it("transforms code node with lang=mermaid to mermaidDiagram", () => {
    const tree = makeTree([{ type: "code", lang: "mermaid", value: "graph TD\n  A-->B" }]);

    remarkMermaid()(tree);

    expect(tree.children[0]).toEqual({
      type: "mermaidDiagram",
      value: "graph TD\n  A-->B",
    });
  });

  it("leaves non-mermaid code nodes unchanged", () => {
    const tree = makeTree([{ type: "code", lang: "javascript", value: "const x = 1;" }]);
    const original = structuredClone(tree);

    remarkMermaid()(tree);

    expect(tree).toEqual(original);
  });

  it("leaves code nodes with no lang unchanged", () => {
    const tree = makeTree([{ type: "code", value: "plain code" }]);
    const original = structuredClone(tree);

    remarkMermaid()(tree);

    expect(tree).toEqual(original);
  });

  it("handles mixed children", () => {
    const tree = makeTree([
      { type: "paragraph", children: [{ type: "text", value: "hello" }] },
      { type: "code", lang: "mermaid", value: "sequenceDiagram\n  A->>B: Hi" },
      { type: "code", lang: "python", value: "print('hi')" },
    ]);

    remarkMermaid()(tree);

    expect(tree.children[0].type).toBe("paragraph");
    expect(tree.children[1]).toEqual({
      type: "mermaidDiagram",
      value: "sequenceDiagram\n  A->>B: Hi",
    });
    expect(tree.children[2].type).toBe("code");
    expect(tree.children[2].lang).toBe("python");
  });

  it("handles nested structures (e.g. code inside blockquote)", () => {
    const tree = makeTree([
      {
        type: "blockquote",
        children: [{ type: "code", lang: "mermaid", value: "graph LR\n  X-->Y" }],
      },
    ]);

    remarkMermaid()(tree);

    expect(tree.children[0].children![0]).toEqual({
      type: "mermaidDiagram",
      value: "graph LR\n  X-->Y",
    });
  });
});
