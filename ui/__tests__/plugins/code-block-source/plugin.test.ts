import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import {
  getActiveCodeBlock,
  buildFenceDecorations,
  createFenceOpen,
  createFenceClose,
} from "../../../plugins/code-block-source/plugin";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
    },
    code_block: {
      group: "block",
      content: "text*",
      attrs: { language: { default: "" } },
      marks: "",
      code: true,
      defining: true,
      toDOM: () => ["pre", ["code", 0]] as const,
    },
    text: { group: "inline" },
  },
});

describe("getActiveCodeBlock", () => {
  it("detects TextSelection inside code_block", () => {
    // doc > code_block("hello")
    // doc open=0, code_block open=1, "hello" at 2-6, code_block close=7, doc close=8
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "js" }, [schema.text("hello")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    const result = getActiveCodeBlock(state);
    expect(result).not.toBeNull();
    expect(result!.pos).toBe(0);
    expect(result!.node.type.name).toBe("code_block");
    expect(result!.node.attrs.language).toBe("js");
  });

  it("detects NodeSelection on code_block", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "python" }, [schema.text("print()")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const result = getActiveCodeBlock(state);
    expect(result).not.toBeNull();
    expect(result!.pos).toBe(0);
    expect(result!.node.type.name).toBe("code_block");
    expect(result!.node.attrs.language).toBe("python");
  });

  it("returns null when selection is outside code_block", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello")]),
      schema.node("code_block", { language: "js" }, [schema.text("code")]),
    ]);
    // Cursor in paragraph: paragraph open=0, content starts at 1
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    const result = getActiveCodeBlock(state);
    expect(result).toBeNull();
  });

  it("returns null for NodeSelection on non-code_block node", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("hello")])]);
    // NodeSelection on paragraph
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const result = getActiveCodeBlock(state);
    expect(result).toBeNull();
  });

  it("detects cursor in empty code_block", () => {
    const doc = schema.node("doc", null, [schema.node("code_block", { language: "" })]);
    // Empty code_block: open=0, content at 1, close=1 (actually nodeSize=2)
    // Cursor at position 1 (inside the empty code_block)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    });

    const result = getActiveCodeBlock(state);
    expect(result).not.toBeNull();
    expect(result!.pos).toBe(0);
  });

  it("identifies correct code_block among multiple", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "js" }, [schema.text("first")]),
      schema.node("code_block", { language: "py" }, [schema.text("second")]),
    ]);
    // First code_block: pos 0, nodeSize=7 (open + 5 chars + close)
    // Second code_block: pos 7, content starts at 8
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 9),
    });

    const result = getActiveCodeBlock(state);
    expect(result).not.toBeNull();
    expect(result!.pos).toBe(7);
    expect(result!.node.attrs.language).toBe("py");
  });
});

describe("buildFenceDecorations", () => {
  it("creates opening and closing fence decorations when inside code_block", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "javascript" }, [schema.text("const x = 1;")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 5),
    });

    const decoSet = buildFenceDecorations(state);
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(2);

    // Opening fence at pos 0 (before code_block)
    expect(decorations[0].from).toBe(0);
    expect(decorations[0].to).toBe(0);

    // Closing fence at pos 0 + nodeSize (after code_block)
    const nodeSize = doc.firstChild!.nodeSize;
    expect(decorations[1].from).toBe(nodeSize);
    expect(decorations[1].to).toBe(nodeSize);
  });

  it("returns empty DecorationSet when outside code_block", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("hello")])]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    const decoSet = buildFenceDecorations(state);
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(0);
  });

  it("creates fence with language in opening decoration", () => {
    const openDom = createFenceOpen("rust");
    expect(openDom.classList.contains("code-fence-open")).toBe(true);
    expect(openDom.querySelector(".syntax-marker")?.textContent).toBe("```");
    expect(openDom.querySelector(".fence-language")?.textContent).toBe("rust");
  });

  it("omits language span when language is empty", () => {
    const openDom = createFenceOpen("");
    expect(openDom.querySelector(".syntax-marker")?.textContent).toBe("```");
    expect(openDom.querySelector(".fence-language")).toBeNull();
  });

  it("closing fence has no language span", () => {
    const closeDom = createFenceClose();
    expect(closeDom.classList.contains("code-fence-close")).toBe(true);
    expect(closeDom.querySelector(".syntax-marker")?.textContent).toBe("```");
    expect(closeDom.querySelector(".fence-language")).toBeNull();
  });

  it("handles empty code_block", () => {
    const doc = schema.node("doc", null, [schema.node("code_block", { language: "go" })]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    });

    const decoSet = buildFenceDecorations(state);
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(2);

    // Opening at 0, closing at nodeSize (2 for empty node)
    expect(decorations[0].from).toBe(0);
    expect(decorations[1].from).toBe(2);
  });

  it("only decorates the selected code_block when multiple exist", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "js" }, [schema.text("first")]),
      schema.node("code_block", { language: "py" }, [schema.text("second")]),
    ]);
    // Cursor in second code_block (pos 7 is second code_block open, content at 8)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 9),
    });

    const decoSet = buildFenceDecorations(state);
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(2);

    // Second code_block starts at pos 7
    expect(decorations[0].from).toBe(7);
    // Second code_block nodeSize = 8 (open + "second"(6) + close), so end at 15
    expect(decorations[1].from).toBe(7 + doc.child(1).nodeSize);
  });

  it("shows fences for NodeSelection on code_block", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "rb" }, [schema.text("puts 'hi'")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const decoSet = buildFenceDecorations(state);
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(2);
  });
});

describe("decoration lifecycle", () => {
  it("decorations appear when cursor enters code_block", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("text")]),
      schema.node("code_block", { language: "js" }, [schema.text("code")]),
    ]);

    // Cursor in paragraph — no decorations
    const outsideState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    });
    expect(buildFenceDecorations(outsideState).find()).toHaveLength(0);

    // Cursor in code_block — decorations appear
    // paragraph nodeSize = 6, code_block starts at 6, content at 7
    const insideState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 8),
    });
    expect(buildFenceDecorations(insideState).find()).toHaveLength(2);
  });

  it("decorations disappear when cursor leaves code_block", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "js" }, [schema.text("code")]),
      schema.node("paragraph", null, [schema.text("text")]),
    ]);

    // Cursor in code_block — decorations present
    const insideState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });
    expect(buildFenceDecorations(insideState).find()).toHaveLength(2);

    // Cursor in paragraph — decorations gone
    // code_block nodeSize = 6, paragraph starts at 6, content at 7
    const outsideState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 8),
    });
    expect(buildFenceDecorations(outsideState).find()).toHaveLength(0);
  });

  it("decorations move when cursor moves between code_blocks", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", { language: "js" }, [schema.text("first")]),
      schema.node("code_block", { language: "py" }, [schema.text("second")]),
    ]);

    // Cursor in first code_block
    const firstState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });
    const firstDecos = buildFenceDecorations(firstState).find();
    expect(firstDecos).toHaveLength(2);
    expect(firstDecos[0].from).toBe(0);

    // Cursor in second code_block
    const secondState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 9),
    });
    const secondDecos = buildFenceDecorations(secondState).find();
    expect(secondDecos).toHaveLength(2);
    expect(secondDecos[0].from).toBe(7);
  });
});
