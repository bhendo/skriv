import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import { foldableSyntaxFacet } from "@prosemark/core";
import { createMermaidSurface } from "../mermaid/surface";
import { focusWidgetSource, fullLineRange } from "./fold-widget";

function childText(state: EditorState, node: SyntaxNodeRef, type: string): string | null {
  const child = node.node.getChild(type);
  return child ? state.doc.sliceString(child.from, child.to) : null;
}

const widgetCleanups = new WeakMap<HTMLElement, () => void>();

class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  toDOM(view: EditorView): HTMLElement {
    const surface = createMermaidSurface({
      onActivate: () => focusWidgetSource(view, surface.dom),
    });
    surface.dom.classList.add("cm-mermaid-block");
    void surface.render(this.source);
    widgetCleanups.set(surface.dom, () => surface.dispose());
    return surface.dom;
  }

  destroy(dom: HTMLElement): void {
    widgetCleanups.get(dom)?.();
    widgetCleanups.delete(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Renders ```mermaid fences as pan/zoomable SVG diagrams. The fold driver
 * only calls buildDecorations while the selection is outside the node
 * (keepDecorationOnUnfold is unset), so cursor entry reveals the raw fence
 * without any guard here.
 */
export const mermaidPreviewExtension = foldableSyntaxFacet.of({
  nodePath: "FencedCode",
  buildDecorations: (state, node) => {
    const infoNode = node.node.getChild("CodeInfo");
    // Cheap length gate before slicing — this runs for every fence on
    // every selection change.
    if (!infoNode || infoNode.to - infoNode.from > 16) return undefined;
    const info = state.doc.sliceString(infoNode.from, infoNode.to).trim().toLowerCase();
    if (info !== "mermaid") return undefined;

    const source = childText(state, node, "CodeText") ?? "";
    const [from, to] = fullLineRange(state, node);
    return Decoration.replace({ widget: new MermaidWidget(source), block: true }).range(from, to);
  },
});
