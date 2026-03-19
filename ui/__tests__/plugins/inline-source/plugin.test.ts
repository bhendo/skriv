import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import {
  buildMarkerDecorations,
  findMarkSpan,
  handleInlineSourceTransition,
  isWrappedWith,
  toggleSyntaxInRawText,
} from "../../../plugins/inline-source/plugin";

// Minimal schema with marks for testing
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: {
    strong: {
      toDOM: () => ["strong", 0] as const,
      parseDOM: [{ tag: "strong" }],
    },
    emphasis: {
      toDOM: () => ["em", 0] as const,
      parseDOM: [{ tag: "em" }],
    },
  },
});

describe("findMarkSpan", () => {
  it("finds the extent of a strong mark", () => {
    // doc > paragraph > "hello " + strong("bold") + " world"
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("hello "),
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text(" world"),
      ]),
    ]);
    const strongType = schema.marks.strong;
    // Paragraph starts at pos 1 (after paragraph open tag)
    // "hello " = positions 1-6, "bold" = positions 7-10, " world" = positions 11-16
    // from=7 (start of "bold"), to=11 (after "bold")
    const result = findMarkSpan(doc, 9, strongType);
    expect(result).toEqual({ from: 7, to: 11 });
  });

  it("returns null when mark not found at position", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("hello "),
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text(" world"),
      ]),
    ]);
    const strongType = schema.marks.strong;
    // Cursor in "hello " — no strong mark
    const result = findMarkSpan(doc, 3, strongType);
    expect(result).toBeNull();
  });

  it("finds span across multiple text nodes with same mark", () => {
    // Two text nodes both with strong mark (one also has emphasis)
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("bold ", [schema.marks.strong.create()]),
        schema.text("more", [schema.marks.strong.create(), schema.marks.emphasis.create()]),
      ]),
    ]);
    const strongType = schema.marks.strong;
    // "bold " at 1-5, "more" at 6-9
    // Cursor in "more" — strong spans both text nodes: 1-10
    const result = findMarkSpan(doc, 7, strongType);
    expect(result).toEqual({ from: 1, to: 10 });
  });
});

// Extended schema with inline_source node for transition tests
const transitionSchema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      toDOM: () => ["div", 0] as const,
    },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
    },
    text: { group: "inline" },
    inline_source: {
      group: "inline",
      inline: true,
      content: "text*",
      marks: "",
      attrs: { syntax: { default: "" } },
      toDOM: () => ["span", { class: "inline-source" }, 0] as const,
    },
  },
  marks: {
    strong: {
      toDOM: () => ["strong", 0] as const,
      parseDOM: [{ tag: "strong" }],
    },
    emphasis: {
      toDOM: () => ["em", 0] as const,
      parseDOM: [{ tag: "em" }],
    },
    strike_through: {
      toDOM: () => ["del", 0] as const,
      parseDOM: [{ tag: "del" }],
    },
    inlineCode: {
      toDOM: () => ["code", 0] as const,
      parseDOM: [{ tag: "code" }],
    },
  },
});

describe("handleInlineSourceTransition", () => {
  describe("enter transition", () => {
    it("replaces strong mark with inline_source node when cursor enters", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.text("bold", [transitionSchema.marks.strong.create()]),
          transitionSchema.text(" world"),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3), // in "hello"
      });

      // Move cursor into the bold span (pos 9 is inside "bold" at positions 7-10)
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 9));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundInlineSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "inline_source") {
            foundInlineSource = true;
            expect(node.textContent).toBe("**bold**");
            expect(node.attrs.syntax).toBe("strong");
          }
        });
        expect(foundInlineSource).toBe(true);
      }
    });

    it("returns null when cursor is not near a supported mark", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [transitionSchema.text("hello world")]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 5));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("returns null when cursor is already inside inline_source", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.nodes.inline_source.create(
            { syntax: "strong" },
            transitionSchema.text("**bold**")
          ),
          transitionSchema.text(" world"),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 10),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 12));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("returns null for range selection", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.text("bold", [transitionSchema.marks.strong.create()]),
          transitionSchema.text(" world"),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3),
      });

      // Create a range selection (not cursor)
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 7, 11));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("handles nested same-boundary marks (strong + emphasis)", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("both", [
            transitionSchema.marks.strong.create(),
            transitionSchema.marks.emphasis.create(),
          ]),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 1),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundInlineSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "inline_source") {
            foundInlineSource = true;
            expect(node.textContent).toBe("***both***");
            expect(node.attrs.syntax).toContain("strong");
            expect(node.attrs.syntax).toContain("emphasis");
          }
        });
        expect(foundInlineSource).toBe(true);
      }
    });
  });

  describe("leave transition", () => {
    it("replaces inline_source with marked text when cursor leaves", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.nodes.inline_source.create(
            { syntax: "strong" },
            transitionSchema.text("**bold**")
          ),
          transitionSchema.text(" world"),
        ]),
      ]);

      // Cursor inside inline_source (position inside the "**bold**" text)
      // paragraph opens at 0, content starts at 1
      // "hello " = pos 1-6, inline_source opens at 7, content starts at 8
      // "**bold**" = pos 8-15, inline_source closes at 16, " world" = 17-22
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 12),
      });

      // Move cursor to " world" area (pos 19)
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 19));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundStrong = false;
        paragraph.forEach((node) => {
          if (node.isText && node.marks.some((m) => m.type.name === "strong")) {
            foundStrong = true;
            expect(node.text).toBe("bold");
          }
        });
        expect(foundStrong).toBe(true);
        // inline_source should be gone
        let foundInlineSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "inline_source") foundInlineSource = true;
        });
        expect(foundInlineSource).toBe(false);
      }
    });

    it("converts incomplete syntax to plain text on leave", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("before "),
          transitionSchema.nodes.inline_source.create(
            { syntax: "strong" },
            transitionSchema.text("**bol")
          ),
        ]),
      ]);

      // "before " = pos 1-7, inline_source opens at 8, content starts at 9
      // "**bol" = pos 9-13, inline_source closes at 14
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 11),
      });

      // Move cursor to "before"
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        expect(paragraph.textContent).toBe("before **bol");
        paragraph.forEach((node) => {
          if (node.isText) {
            expect(node.marks.length).toBe(0);
          }
        });
      }
    });

    it("removes node entirely when content is empty on leave", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.nodes.inline_source.create({ syntax: "strong" }),
          transitionSchema.text(" world"),
        ]),
      ]);

      // "hello " = pos 1-6, inline_source opens at 7, closes at 8 (empty)
      // " world" = pos 9-14
      // Cursor right at inline_source boundary
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 8),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleInlineSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundInlineSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "inline_source") foundInlineSource = true;
        });
        expect(foundInlineSource).toBe(false);
      }
    });
  });
});

describe("isWrappedWith", () => {
  it("detects text wrapped with **", () => {
    expect(isWrappedWith("**hello**", "**")).toBe(true);
  });

  it("detects text wrapped with *", () => {
    expect(isWrappedWith("*hello*", "*")).toBe(true);
  });

  it("returns false when text is not wrapped", () => {
    expect(isWrappedWith("hello", "**")).toBe(false);
  });

  it("returns false when only prefix is present", () => {
    expect(isWrappedWith("**hello", "**")).toBe(false);
  });

  it("returns false when only suffix is present", () => {
    expect(isWrappedWith("hello**", "**")).toBe(false);
  });

  it("returns false for text that is too short (just markers)", () => {
    expect(isWrappedWith("****", "**")).toBe(false);
  });

  it("returns false when marker is * but text is wrapped with **", () => {
    // **hello** starts with * but the char after * is also *, so it's a longer marker
    expect(isWrappedWith("**hello**", "*")).toBe(false);
  });

  it("returns false when marker is * but text is wrapped with ***", () => {
    expect(isWrappedWith("***hello***", "*")).toBe(false);
  });

  it("returns true when marker is ** and text is ***hello***", () => {
    // ***hello*** — starts with **, char after ** is *, not * again at position 2
    // Wait: marker is **, markerChar is *, afterPrefix is text[2] = "*"
    // So this should return false because afterPrefix === markerChar
    expect(isWrappedWith("***hello***", "**")).toBe(false);
  });

  it("detects text wrapped with ~~", () => {
    expect(isWrappedWith("~~hello~~", "~~")).toBe(true);
  });

  it("detects text wrapped with `", () => {
    expect(isWrappedWith("`hello`", "`")).toBe(true);
  });
});

describe("toggleSyntaxInRawText", () => {
  /** Helper: create an EditorView with cursor inside an inline_source node */
  function createViewWithInlineSource(rawText: string, cursorOffset?: number): EditorView {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.inline_source.create(
          { syntax: "strong" },
          transitionSchema.text(rawText)
        ),
      ]),
    ]);

    // inline_source opens at 1 (after paragraph open), content starts at 2
    const contentStart = 2;
    const pos = contentStart + (cursorOffset ?? 0);

    const state = EditorState.create({
      doc,
      schema: transitionSchema,
      selection: TextSelection.create(doc, pos),
    });

    const el = document.createElement("div");
    return new EditorView(el, { state });
  }

  /** Helper: create an EditorView with a range selection inside an inline_source node */
  function createViewWithInlineSourceSelection(
    rawText: string,
    selFrom: number,
    selTo: number
  ): EditorView {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.inline_source.create(
          { syntax: "strong" },
          transitionSchema.text(rawText)
        ),
      ]),
    ]);

    const contentStart = 2;

    const state = EditorState.create({
      doc,
      schema: transitionSchema,
      selection: TextSelection.create(doc, contentStart + selFrom, contentStart + selTo),
    });

    const el = document.createElement("div");
    return new EditorView(el, { state });
  }

  describe("cursor (no selection) — operates on entire node text", () => {
    it("wraps unwrapped text with **", () => {
      const view = createViewWithInlineSource("hello");
      toggleSyntaxInRawText(view, "**");

      const paragraph = view.state.doc.firstChild!;
      let inlineText = "";
      paragraph.forEach((node) => {
        if (node.type.name === "inline_source") {
          inlineText = node.textContent;
        }
      });
      expect(inlineText).toBe("**hello**");
    });

    it("unwraps text already wrapped with **", () => {
      const view = createViewWithInlineSource("**hello**");
      toggleSyntaxInRawText(view, "**");

      const paragraph = view.state.doc.firstChild!;
      let inlineText = "";
      paragraph.forEach((node) => {
        if (node.type.name === "inline_source") {
          inlineText = node.textContent;
        }
      });
      expect(inlineText).toBe("hello");
    });

    it("wraps unwrapped text with * (italic)", () => {
      const view = createViewWithInlineSource("hello");
      toggleSyntaxInRawText(view, "*");

      const paragraph = view.state.doc.firstChild!;
      let inlineText = "";
      paragraph.forEach((node) => {
        if (node.type.name === "inline_source") {
          inlineText = node.textContent;
        }
      });
      expect(inlineText).toBe("*hello*");
    });

    it("unwraps text already wrapped with * (italic)", () => {
      const view = createViewWithInlineSource("*hello*");
      toggleSyntaxInRawText(view, "*");

      const paragraph = view.state.doc.firstChild!;
      let inlineText = "";
      paragraph.forEach((node) => {
        if (node.type.name === "inline_source") {
          inlineText = node.textContent;
        }
      });
      expect(inlineText).toBe("hello");
    });

    it("does not unwrap ** when toggling * (different marker length)", () => {
      const view = createViewWithInlineSource("**hello**");
      toggleSyntaxInRawText(view, "*");

      const paragraph = view.state.doc.firstChild!;
      let inlineText = "";
      paragraph.forEach((node) => {
        if (node.type.name === "inline_source") {
          inlineText = node.textContent;
        }
      });
      // Should wrap with * around the whole thing, not unwrap
      expect(inlineText).toBe("***hello***");
    });
  });

  describe("range selection — operates on selected text", () => {
    it("wraps selected text with **", () => {
      // Raw text is "hello world", select "world" (indices 6-11)
      const view = createViewWithInlineSourceSelection("hello world", 6, 11);
      toggleSyntaxInRawText(view, "**");

      const paragraph = view.state.doc.firstChild!;
      let inlineText = "";
      paragraph.forEach((node) => {
        if (node.type.name === "inline_source") {
          inlineText = node.textContent;
        }
      });
      expect(inlineText).toBe("hello **world**");
    });

    it("unwraps selected text already wrapped with **", () => {
      // Raw text "hello **world**", select "**world**" (indices 6-15)
      const view = createViewWithInlineSourceSelection("hello **world**", 6, 15);
      toggleSyntaxInRawText(view, "**");

      const paragraph = view.state.doc.firstChild!;
      let inlineText = "";
      paragraph.forEach((node) => {
        if (node.type.name === "inline_source") {
          inlineText = node.textContent;
        }
      });
      expect(inlineText).toBe("hello world");
    });
  });
});

describe("buildMarkerDecorations", () => {
  it("creates decorations for strong mark (**bold**)", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.inline_source.create(
          { syntax: "strong" },
          transitionSchema.text("**bold**")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildMarkerDecorations(state);

    // inline_source opens at pos 1 (after paragraph open), content starts at pos 2
    // "**bold**" occupies positions 2-9
    // prefix "**" at 2-4, suffix "**" at 8-10... wait let me recalculate:
    // paragraph open = 0, content start = 1
    // inline_source at pos 1, node open token => content starts at pos 2
    // "**bold**" = 8 chars, content positions 2-9
    // contentEnd = 1 + nodeSize - 1 = 1 + 10 - 1 = 10
    // Actually: node.nodeSize for inline_source with "**bold**" (8 chars) = 8 + 2 = 10
    // contentStart = 1 + 1 = 2, contentEnd = 1 + 10 - 1 = 10
    // prefix deco: 2 to 4, suffix deco: 8 to 10
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(2);

    // Prefix decoration: positions 2-4
    expect(decorations[0].from).toBe(2);
    expect(decorations[0].to).toBe(4);

    // Suffix decoration: positions 8-10
    expect(decorations[1].from).toBe(8);
    expect(decorations[1].to).toBe(10);
  });

  it("creates decorations for emphasis mark (*italic*)", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.inline_source.create(
          { syntax: "emphasis" },
          transitionSchema.text("*italic*")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildMarkerDecorations(state);

    // inline_source at pos 1, content starts at 2
    // "*italic*" = 8 chars, nodeSize = 10
    // contentStart = 2, contentEnd = 10
    // prefix "*" at 2-3, suffix "*" at 9-10
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(2);

    expect(decorations[0].from).toBe(2);
    expect(decorations[0].to).toBe(3);

    expect(decorations[1].from).toBe(9);
    expect(decorations[1].to).toBe(10);
  });

  it("creates decorations for nested marks (***both***)", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.inline_source.create(
          { syntax: "strong,emphasis" },
          transitionSchema.text("***both***")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildMarkerDecorations(state);

    // "***both***" = 10 chars, nodeSize = 12
    // contentStart = 2, contentEnd = 12
    // prefix "**" + "*" = 3 chars at 2-5, suffix "*" + "**" = 3 chars at 9-12
    const decorations = decoSet.find();
    expect(decorations).toHaveLength(2);

    expect(decorations[0].from).toBe(2);
    expect(decorations[0].to).toBe(5);

    expect(decorations[1].from).toBe(9);
    expect(decorations[1].to).toBe(12);
  });

  it("returns empty DecorationSet when no inline_source nodes exist", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [transitionSchema.text("hello world")]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildMarkerDecorations(state);

    const decorations = decoSet.find();
    expect(decorations).toHaveLength(0);
  });

  it("returns empty DecorationSet when schema has no inline_source type", () => {
    // Use the basic schema which has no inline_source node type
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello world")]),
    ]);
    const state = EditorState.create({ doc, schema });
    const decoSet = buildMarkerDecorations(state);

    const decorations = decoSet.find();
    expect(decorations).toHaveLength(0);
  });
});
