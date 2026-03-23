import { $prose } from "@milkdown/utils";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { findAncestorOfType } from "../block-source/cursor";
import { makeDecorationPlugin } from "../block-source/decoration";

export function getActiveCodeBlock(state: EditorState): { pos: number; node: Node } | null {
  const ancestor = findAncestorOfType(state, "code_block");
  return ancestor ? { pos: ancestor.pos, node: ancestor.node } : null;
}

export function createFenceOpen(language: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "code-fence code-fence-open";

  const marker = document.createElement("span");
  marker.className = "syntax-marker";
  marker.textContent = "```";
  div.appendChild(marker);

  if (language) {
    const lang = document.createElement("span");
    lang.className = "fence-language";
    lang.textContent = language;
    div.appendChild(lang);
  }

  return div;
}

export function createFenceClose(): HTMLElement {
  const div = document.createElement("div");
  div.className = "code-fence code-fence-close";

  const marker = document.createElement("span");
  marker.className = "syntax-marker";
  marker.textContent = "```";
  div.appendChild(marker);

  return div;
}

export function buildFenceDecorations(state: EditorState): DecorationSet {
  const active = getActiveCodeBlock(state);
  if (!active) return DecorationSet.empty;

  const { pos, node } = active;
  const language = (node.attrs.language as string) || "";

  const decorations = [
    Decoration.widget(pos, () => createFenceOpen(language), { side: -1 }),
    Decoration.widget(pos + node.nodeSize, () => createFenceClose(), {
      side: 1,
    }),
  ];

  return DecorationSet.create(state.doc, decorations);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const codeBlockSourcePlugin = $prose((_ctx) =>
  makeDecorationPlugin("code-block-source", buildFenceDecorations, {
    rebuildOnSelection: true,
    cacheKey: (state) => getActiveCodeBlock(state)?.pos ?? null,
  })
);
