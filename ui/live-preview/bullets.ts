import { Decoration, WidgetType } from "@codemirror/view";
import { foldableSyntaxFacet } from "@prosemark/core";
import type { SyntaxNode } from "@lezer/common";

// Replaces @prosemark/core's bulletListExtension (left out of the unpacked
// foldable bundle in LivePreviewEditor), whose widget renders "•" at every
// depth. Same fold shape, but the glyph cycles Typora-style by nesting level.

const GLYPHS = ["•", "◦", "▪"];

/**
 * Nesting level of a list mark: 1 for a top-level bullet, counting every
 * BulletList/OrderedList ancestor — a bullet inside an ordered item is
 * depth 2.
 */
export function listDepth(mark: SyntaxNode): number {
  let depth = 0;
  for (let node = mark.parent; node; node = node.parent) {
    if (node.name === "BulletList" || node.name === "OrderedList") depth++;
  }
  return depth;
}

/** Marker glyph for a 1-based nesting depth: • ◦ ▪, then repeating. */
export function bulletGlyph(depth: number): string {
  return GLYPHS[(depth - 1) % GLYPHS.length];
}

class BulletMarkWidget extends WidgetType {
  constructor(readonly glyph: string) {
    super();
  }

  eq(other: BulletMarkWidget): boolean {
    return other.glyph === this.glyph;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-rendered-list-mark";
    span.textContent = this.glyph;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Renders `-`/`*`/`+` list marks as depth-cycled bullet glyphs. */
export const depthAwareBulletExtension = foldableSyntaxFacet.of({
  nodePath: "BulletList/ListItem/ListMark",
  buildDecorations: (_state, node) => {
    // Guard kept verbatim from upstream: task items get a checkbox from
    // taskExtension, so their mark must not be replaced with a glyph.
    const cursor = node.node.cursor();
    if (cursor.nextSibling() && cursor.name === "Task") return;
    const glyph = bulletGlyph(listDepth(node.node));
    return Decoration.replace({ widget: new BulletMarkWidget(glyph) }).range(node.from, node.to);
  },
});
