import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  buildLinkDecorations,
  findLinkSpan,
  handleLinkSourceTransition,
  leaveLinkSource,
} from "../../../plugins/link-source/plugin";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", group: "block" },
    text: { inline: true },
  },
  marks: {
    link: {
      attrs: { href: { default: "" }, title: { default: null } },
      toDOM: (mark) => ["a", { href: mark.attrs.href }] as const,
    },
    strong: { toDOM: () => ["strong"] as const },
  },
});

function makeDoc(...children: ReturnType<typeof schema.text>[]) {
  return schema.node("doc", null, [schema.node("paragraph", null, children)]);
}

describe("findLinkSpan", () => {
  it("finds span for a simple link mark", () => {
    const linkMark = schema.marks.link.create({ href: "https://example.com" });
    const doc = makeDoc(
      schema.text("before "),
      schema.text("link text", [linkMark]),
      schema.text(" after")
    );
    // doc open(1) + "before "(7) + 1 into link = 9
    const pos = 1 + 7 + 1;
    const span = findLinkSpan(doc, pos, schema.marks.link, "https://example.com");
    expect(span).not.toBeNull();
    expect(doc.textBetween(span!.from, span!.to)).toBe("link text");
  });

  it("respects href boundaries", () => {
    const link1 = schema.marks.link.create({ href: "https://a.com" });
    const link2 = schema.marks.link.create({ href: "https://b.com" });
    const doc = makeDoc(schema.text("aaa", [link1]), schema.text("bbb", [link2]));
    const span = findLinkSpan(doc, 2, schema.marks.link, "https://a.com");
    expect(span).not.toBeNull();
    expect(doc.textBetween(span!.from, span!.to)).toBe("aaa");
  });

  it("returns null when no link mark at position", () => {
    const doc = makeDoc(schema.text("plain text"));
    const span = findLinkSpan(doc, 3, schema.marks.link, "https://example.com");
    expect(span).toBeNull();
  });

  it("spans multiple text nodes with same href", () => {
    const linkMark = schema.marks.link.create({ href: "https://x.com" });
    const doc = makeDoc(
      schema.text("aaa", [linkMark]),
      schema.text("bbb", [linkMark, schema.marks.strong.create()])
    );
    const span = findLinkSpan(doc, 2, schema.marks.link, "https://x.com");
    expect(span).not.toBeNull();
    expect(doc.textBetween(span!.from, span!.to)).toBe("aaabbb");
  });

  it("stops at href boundary when spanning forward", () => {
    const link1 = schema.marks.link.create({ href: "https://a.com" });
    const link2 = schema.marks.link.create({ href: "https://b.com" });
    const doc = makeDoc(
      schema.text("aaa", [link1]),
      schema.text("bbb", [link1]),
      schema.text("ccc", [link2])
    );
    const span = findLinkSpan(doc, 2, schema.marks.link, "https://a.com");
    expect(span).not.toBeNull();
    expect(doc.textBetween(span!.from, span!.to)).toBe("aaabbb");
  });

  it("finds span when cursor is at boundary (after link)", () => {
    const linkMark = schema.marks.link.create({ href: "https://example.com" });
    const doc = makeDoc(schema.text("link", [linkMark]), schema.text(" after"));
    // Cursor at pos 5 = right at boundary between "link" and " after"
    // The index at pos 5 points to " after", which has no link mark.
    // But the previous child "link" does have the link mark, so findLinkSpan
    // should find it via the fallback to the previous child.
    const span = findLinkSpan(doc, 5, schema.marks.link, "https://example.com");
    expect(span).not.toBeNull();
    expect(doc.textBetween(span!.from, span!.to)).toBe("link");
  });

  it("returns null when href does not match", () => {
    const linkMark = schema.marks.link.create({ href: "https://other.com" });
    const doc = makeDoc(schema.text("link", [linkMark]));
    const span = findLinkSpan(doc, 2, schema.marks.link, "https://example.com");
    expect(span).toBeNull();
  });
});

// Extended schema with link_source, inline_source, and marks for transition tests
const transitionSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    link_source: {
      group: "inline",
      inline: true,
      content: "text*",
      marks: "",
      attrs: { href: { default: "" }, title: { default: "" } },
      toDOM: () => ["span", { class: "link-source" }, 0] as const,
    },
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
    link: {
      attrs: { href: { default: "" }, title: { default: null } },
      toDOM: (mark) => ["a", { href: mark.attrs.href }] as const,
    },
    strong: { toDOM: () => ["strong"] as const },
    emphasis: { toDOM: () => ["em"] as const },
  },
});

describe("leaveLinkSource", () => {
  it("creates text node with link mark for valid link syntax", () => {
    // doc: <p><link_source>[text](https://example.com)</link_source></p>
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "https://example.com", title: "" },
          transitionSchema.text("[text](https://example.com)")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const tr = state.tr;

    // link_source opens at pos 1, closes at 1 + nodeSize
    // nodeSize = 1 (open) + 27 (text) + 1 (close) = 29
    const nodeFrom = 1;
    const nodeTo = 1 + doc.firstChild!.firstChild!.nodeSize;

    const result = leaveLinkSource(
      tr,
      transitionSchema,
      nodeFrom,
      nodeTo,
      "[text](https://example.com)",
      "https://example.com",
      ""
    );

    expect(result).toBe(true);

    const newDoc = state.apply(tr).doc;
    const paragraph = newDoc.firstChild!;
    let foundLink = false;
    paragraph.forEach((node) => {
      if (node.isText) {
        const linkMark = transitionSchema.marks.link.isInSet(node.marks);
        if (linkMark) {
          foundLink = true;
          expect(node.text).toBe("text");
          expect(linkMark.attrs.href).toBe("https://example.com");
        }
      }
    });
    expect(foundLink).toBe(true);
  });

  it("creates text node with link + strong marks for valid link with inner bold", () => {
    const raw = "[**bold**](https://example.com)";
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "https://example.com", title: "" },
          transitionSchema.text(raw)
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const tr = state.tr;

    const nodeFrom = 1;
    const nodeTo = 1 + doc.firstChild!.firstChild!.nodeSize;

    const result = leaveLinkSource(
      tr,
      transitionSchema,
      nodeFrom,
      nodeTo,
      raw,
      "https://example.com",
      ""
    );
    expect(result).toBe(true);

    const newDoc = state.apply(tr).doc;
    const paragraph = newDoc.firstChild!;
    let foundBoldLink = false;
    paragraph.forEach((node) => {
      if (node.isText) {
        const linkMark = transitionSchema.marks.link.isInSet(node.marks);
        const strongMark = transitionSchema.marks.strong.isInSet(node.marks);
        if (linkMark && strongMark) {
          foundBoldLink = true;
          expect(node.text).toBe("bold");
          expect(linkMark.attrs.href).toBe("https://example.com");
        }
      }
    });
    expect(foundBoldLink).toBe(true);
  });

  it("creates link mark with title attr for valid link with title", () => {
    const raw = '[text](https://example.com "My Title")';
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "https://example.com", title: "My Title" },
          transitionSchema.text(raw)
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const tr = state.tr;

    const nodeFrom = 1;
    const nodeTo = 1 + doc.firstChild!.firstChild!.nodeSize;

    const result = leaveLinkSource(
      tr,
      transitionSchema,
      nodeFrom,
      nodeTo,
      raw,
      "https://example.com",
      "My Title"
    );
    expect(result).toBe(true);

    const newDoc = state.apply(tr).doc;
    const paragraph = newDoc.firstChild!;
    let foundLink = false;
    paragraph.forEach((node) => {
      if (node.isText) {
        const linkMark = transitionSchema.marks.link.isInSet(node.marks);
        if (linkMark) {
          foundLink = true;
          expect(node.text).toBe("text");
          expect(linkMark.attrs.href).toBe("https://example.com");
          expect(linkMark.attrs.title).toBe("My Title");
        }
      }
    });
    expect(foundLink).toBe(true);
  });

  it("deletes the node range and returns false for empty raw text", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.text("hello "),
        transitionSchema.nodes.link_source.create({ href: "https://example.com", title: "" }),
        transitionSchema.text(" world"),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const tr = state.tr;

    // "hello " = pos 1-6, link_source opens at 7, closes at 8 (empty content)
    const nodeFrom = 7;
    const nodeTo = 7 + doc.firstChild!.child(1).nodeSize;

    const result = leaveLinkSource(
      tr,
      transitionSchema,
      nodeFrom,
      nodeTo,
      "",
      "https://example.com",
      ""
    );
    expect(result).toBe(false);

    const newDoc = state.apply(tr).doc;
    const paragraph = newDoc.firstChild!;
    let foundLinkSource = false;
    paragraph.forEach((node) => {
      if (node.type.name === "link_source") foundLinkSource = true;
    });
    expect(foundLinkSource).toBe(false);
  });

  it("creates text node with link mark from fallback attrs for invalid syntax with fallback href", () => {
    const raw = "[incomplete";
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "https://example.com", title: "" },
          transitionSchema.text(raw)
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const tr = state.tr;

    const nodeFrom = 1;
    const nodeTo = 1 + doc.firstChild!.firstChild!.nodeSize;

    const result = leaveLinkSource(
      tr,
      transitionSchema,
      nodeFrom,
      nodeTo,
      raw,
      "https://example.com",
      ""
    );
    expect(result).toBe(true);

    const newDoc = state.apply(tr).doc;
    const paragraph = newDoc.firstChild!;
    let foundLink = false;
    paragraph.forEach((node) => {
      if (node.isText) {
        const linkMark = transitionSchema.marks.link.isInSet(node.marks);
        if (linkMark) {
          foundLink = true;
          expect(node.text).toBe("[incomplete");
          expect(linkMark.attrs.href).toBe("https://example.com");
        }
      }
    });
    expect(foundLink).toBe(true);
  });

  it("creates plain text node for invalid syntax without fallback href", () => {
    const raw = "[incomplete";
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "", title: "" },
          transitionSchema.text(raw)
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const tr = state.tr;

    const nodeFrom = 1;
    const nodeTo = 1 + doc.firstChild!.firstChild!.nodeSize;

    const result = leaveLinkSource(tr, transitionSchema, nodeFrom, nodeTo, raw, "", "");
    expect(result).toBe(true);

    const newDoc = state.apply(tr).doc;
    const paragraph = newDoc.firstChild!;
    paragraph.forEach((node) => {
      if (node.isText) {
        expect(node.text).toBe("[incomplete");
        expect(node.marks.length).toBe(0);
      }
    });
  });

  it("creates plain text for incomplete syntax like just opening bracket with text", () => {
    const raw = "[text";
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "", title: "" },
          transitionSchema.text(raw)
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const tr = state.tr;

    const nodeFrom = 1;
    const nodeTo = 1 + doc.firstChild!.firstChild!.nodeSize;

    const result = leaveLinkSource(tr, transitionSchema, nodeFrom, nodeTo, raw, "", "");
    expect(result).toBe(true);

    const newDoc = state.apply(tr).doc;
    const paragraph = newDoc.firstChild!;
    expect(paragraph.textContent).toBe("[text");
    paragraph.forEach((node) => {
      if (node.isText) {
        expect(node.marks.length).toBe(0);
      }
    });
  });
});

describe("handleLinkSourceTransition", () => {
  describe("enter transition", () => {
    it("replaces link mark with link_source node when cursor enters a link", () => {
      const linkMark = transitionSchema.marks.link.create({ href: "https://example.com" });
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.text("link text", [linkMark]),
          transitionSchema.text(" world"),
        ]),
      ]);

      // Start cursor outside the link
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3), // in "hello"
      });

      // Move cursor into the link span
      // "hello " = pos 1-6, "link text" = pos 7-15
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 10));
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundLinkSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "link_source") {
            foundLinkSource = true;
            expect(node.textContent).toBe("[link text](https://example.com)");
            expect(node.attrs.href).toBe("https://example.com");
          }
        });
        expect(foundLinkSource).toBe(true);
      }
    });

    it("returns null when cursor is not near any link mark", () => {
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

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("returns null for range selection on link", () => {
      const linkMark = transitionSchema.marks.link.create({ href: "https://example.com" });
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.text("link text", [linkMark]),
          transitionSchema.text(" world"),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3),
      });

      // Create a range selection across the link
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 7, 16));
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("returns null when doc changed", () => {
      const linkMark = transitionSchema.marks.link.create({ href: "https://example.com" });
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.text("link text", [linkMark]),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 3),
      });

      // Insert text (doc change) and move cursor near link
      const tr = oldState.tr.insertText("X", 3);
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).toBeNull();
    });

    it("includes inner bold marks in raw text for bold link", () => {
      const linkMark = transitionSchema.marks.link.create({ href: "https://example.com" });
      const strongMark = transitionSchema.marks.strong.create();
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("bold", [linkMark, strongMark]),
        ]),
      ]);

      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 1),
      });

      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundLinkSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "link_source") {
            foundLinkSource = true;
            expect(node.textContent).toBe("[**bold**](https://example.com)");
          }
        });
        expect(foundLinkSource).toBe(true);
      }
    });
  });

  describe("leave transition", () => {
    it("replaces link_source with link-marked text when cursor leaves", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.nodes.link_source.create(
            { href: "https://example.com", title: "" },
            transitionSchema.text("[text](https://example.com)")
          ),
          transitionSchema.text(" world"),
        ]),
      ]);

      // "hello " = pos 1-6, link_source opens at 7, content starts at 8
      // "[text](https://example.com)" = 27 chars at pos 8-34
      // link_source closes at 35, " world" starts at 35
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 12), // inside link_source
      });

      // Move cursor to " world" area
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 38));
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;

        let foundLinkSource = false;
        let foundLink = false;
        paragraph.forEach((node) => {
          if (node.type.name === "link_source") foundLinkSource = true;
          if (node.isText) {
            const lm = transitionSchema.marks.link.isInSet(node.marks);
            if (lm) {
              foundLink = true;
              expect(node.text).toBe("text");
              expect(lm.attrs.href).toBe("https://example.com");
            }
          }
        });
        expect(foundLinkSource).toBe(false);
        expect(foundLink).toBe(true);
      }
    });

    it("converts link_source with incomplete syntax to plain text on leave", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("before "),
          transitionSchema.nodes.link_source.create(
            { href: "", title: "" },
            transitionSchema.text("[text")
          ),
        ]),
      ]);

      // "before " = pos 1-7, link_source opens at 8, content starts at 9
      // "[text" = 5 chars at pos 9-13, link_source closes at 14
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 11), // inside link_source
      });

      // Move cursor to "before" area
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        expect(paragraph.textContent).toBe("before [text");
        paragraph.forEach((node) => {
          if (node.isText) {
            expect(node.marks.length).toBe(0);
          }
        });
      }
    });

    it("deletes empty link_source on leave", () => {
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.text("hello "),
          transitionSchema.nodes.link_source.create({ href: "https://example.com", title: "" }),
          transitionSchema.text(" world"),
        ]),
      ]);

      // "hello " = pos 1-6, link_source opens at 7, closes at 8 (empty)
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 8), // at link_source boundary
      });

      // Move cursor to "hello" area
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 3));
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;
        let foundLinkSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "link_source") foundLinkSource = true;
        });
        expect(foundLinkSource).toBe(false);
      }
    });
  });

  describe("trailing split", () => {
    it("splits link_source containing trailing text after valid link", () => {
      // link_source contains "[text](url) extra" — cursor inside
      const doc = transitionSchema.node("doc", null, [
        transitionSchema.node("paragraph", null, [
          transitionSchema.nodes.link_source.create(
            { href: "url", title: "" },
            transitionSchema.text("[text](url) extra")
          ),
        ]),
      ]);

      // link_source opens at 1, content starts at 2
      // "[text](url) extra" = 17 chars at pos 2-18, link_source closes at 19
      // Cursor inside the link_source content
      const oldState = EditorState.create({
        doc,
        schema: transitionSchema,
        selection: TextSelection.create(doc, 18), // near end of content
      });

      // Simulate cursor still inside (but different position to trigger)
      const tr = oldState.tr.setSelection(TextSelection.create(doc, 19));
      const newState = oldState.apply(tr);

      const result = handleLinkSourceTransition([tr], oldState, newState);
      expect(result).not.toBeNull();

      if (result) {
        const resultState = newState.apply(result);
        const paragraph = resultState.doc.firstChild!;

        // link_source should be gone
        let foundLinkSource = false;
        paragraph.forEach((node) => {
          if (node.type.name === "link_source") foundLinkSource = true;
        });
        expect(foundLinkSource).toBe(false);

        // Should have "text" with link mark
        let foundLink = false;
        paragraph.forEach((node) => {
          if (node.isText) {
            const lm = transitionSchema.marks.link.isInSet(node.marks);
            if (lm) {
              foundLink = true;
              expect(node.text).toBe("text");
              expect(lm.attrs.href).toBe("https://url");
            }
          }
        });
        expect(foundLink).toBe(true);

        // Total text content should include trailing " extra"
        expect(paragraph.textContent).toBe("text extra");
      }
    });
  });
});

describe("buildLinkDecorations", () => {
  it("produces 4 decorations for simple [text](url)", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "https://example.com", title: "" },
          transitionSchema.text("[text](https://example.com)")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildLinkDecorations(state);
    const decos = decoSet.find();

    expect(decos).toHaveLength(4);

    // Content starts at pos 2 (doc open + paragraph open + link_source open = 1+0+1=2)
    // Actually: doc has no open token in position counting, paragraph opens at 0, content at 1.
    // link_source opens at 1, content starts at 2.
    // "[text](https://example.com)" = 27 chars
    // "[" at pos 2-3
    // "](" at pos 2+6=8 to 10 (closeBracket = 6 in raw, so contentStart + 6 = 8, 8 to 10)
    // Wait: raw = "[text](https://example.com)", closeBracket = raw.indexOf("](") = 5
    // "[" decoration: contentStart to contentStart+1 = 2 to 3
    // "](" decoration: contentStart+5 to contentStart+7 = 7 to 9
    // URL decoration: contentStart+7 to contentEnd-1 = 9 to 28
    // Wait, let me recalculate. contentStart = pos + 1 = 1 + 1 = 2
    // contentEnd = pos + nodeSize - 1 = 1 + 29 - 1 = 29
    // raw.length = 27, closeBracket = 5
    // "[" : 2 to 3
    // "](" : 2+5=7 to 2+5+2=9
    // URL: 9 to 28 (contentEnd - 1 = 29 - 1 = 28)
    // ")" : 28 to 29

    // Verify decoration classes
    const classes = decos.map(
      (d) => (d as unknown as { type: { attrs: { class: string } } }).type.attrs.class
    );
    expect(classes).toEqual(["syntax-marker", "syntax-marker", "link-url", "syntax-marker"]);
  });

  it("returns empty DecorationSet when no link_source nodes exist", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [transitionSchema.text("hello world")]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildLinkDecorations(state);
    const decos = decoSet.find();

    expect(decos).toHaveLength(0);
  });

  it("produces no decorations for partial raw text without ](", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "", title: "" },
          transitionSchema.text("[text")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildLinkDecorations(state);
    const decos = decoSet.find();

    expect(decos).toHaveLength(0);
  });

  it("produces no decorations for raw text missing opening bracket", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "", title: "" },
          transitionSchema.text("text](url)")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildLinkDecorations(state);
    const decos = decoSet.find();

    expect(decos).toHaveLength(0);
  });

  it("marks correct positions for decorations", () => {
    const doc = transitionSchema.node("doc", null, [
      transitionSchema.node("paragraph", null, [
        transitionSchema.nodes.link_source.create(
          { href: "url", title: "" },
          transitionSchema.text("[hi](url)")
        ),
      ]),
    ]);
    const state = EditorState.create({ doc, schema: transitionSchema });
    const decoSet = buildLinkDecorations(state);
    const decos = decoSet.find();

    expect(decos).toHaveLength(4);

    // link_source at pos 1, content starts at 2
    // raw = "[hi](url)", closeBracket = 3
    // "[" : 2 to 3
    expect(decos[0]!.from).toBe(2);
    expect(decos[0]!.to).toBe(3);

    // "](" : 2+3=5 to 2+3+2=7
    expect(decos[1]!.from).toBe(5);
    expect(decos[1]!.to).toBe(7);

    // "url" : 7 to 10 (contentEnd - 1 = 1 + 11 - 1 - 1 = 10)
    expect(decos[2]!.from).toBe(7);
    expect(decos[2]!.to).toBe(10);

    // ")" : 10 to 11 (contentEnd = 1 + 11 - 1 = 11)
    expect(decos[3]!.from).toBe(10);
    expect(decos[3]!.to).toBe(11);
  });
});
