import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMEditorView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { $view } from "@milkdown/utils";
import { EditorView as CMEditorView, keymap, drawSelection } from "@codemirror/view";
import { EditorState as CMEditorState } from "@codemirror/state";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import createPanZoom, { type PanZoom } from "panzoom";
import mermaid from "mermaid";
import { mermaidBlockNode } from "./node";
import { buildMermaidThemeConfig } from "./theme";

function nextId(): string {
  return `mermaid-diagram-${crypto.randomUUID()}`;
}

let mermaidInitialized = false;

/** Registry of active NodeView re-render callbacks for theme changes. */
const activeViews = new Set<() => void>();

function ensureMermaidInit(): void {
  const config = buildMermaidThemeConfig();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: config.theme,
    themeVariables: config.themeVariables,
  });
  mermaidInitialized = true;
}

/** Re-initialize mermaid with fresh theme variables and re-render all diagrams. */
export function reinitMermaid(): void {
  mermaidInitialized = false;
  ensureMermaidInit();
  for (const rerender of activeViews) {
    rerender();
  }
}

export const mermaidBlockView = $view(mermaidBlockNode, (): NodeViewConstructor => {
  return (initialNode: Node, view: PMEditorView, getPos: () => number | undefined) => {
    if (!mermaidInitialized) ensureMermaidInit();

    let node = initialNode;
    let editing = false;
    let lastSvg = "";
    let cmView: CMEditorView | null = null;
    let pzInstance: PanZoom | null = null;

    // --- DOM structure ---
    const dom = document.createElement("div");
    dom.className = "mermaid-block";

    const svgContainer = document.createElement("div");
    svgContainer.className = "mermaid-svg-container";
    dom.appendChild(svgContainer);

    // Inner wrapper for panzoom — panzoom transforms this element
    const svgWrapper = document.createElement("div");
    svgWrapper.className = "mermaid-svg-wrapper";
    svgContainer.appendChild(svgWrapper);

    // Editing container with fence markers
    const editContainer = document.createElement("div");
    editContainer.className = "mermaid-edit-container";
    editContainer.style.display = "none";

    const fenceOpen = document.createElement("div");
    fenceOpen.className = "code-fence code-fence-open";
    const openMarker = document.createElement("span");
    openMarker.className = "syntax-marker";
    openMarker.textContent = "```";
    const openLang = document.createElement("span");
    openLang.className = "fence-language";
    openLang.textContent = "mermaid";
    fenceOpen.appendChild(openMarker);
    fenceOpen.appendChild(openLang);

    const cmContainer = document.createElement("div");
    cmContainer.className = "mermaid-cm-container";

    const fenceClose = document.createElement("div");
    fenceClose.className = "code-fence code-fence-close";
    const closeMarker = document.createElement("span");
    closeMarker.className = "syntax-marker";
    closeMarker.textContent = "```";
    fenceClose.appendChild(closeMarker);

    editContainer.appendChild(fenceOpen);
    editContainer.appendChild(cmContainer);
    editContainer.appendChild(fenceClose);
    dom.appendChild(editContainer);

    // --- Pan/zoom ---
    function disposePanZoom(): void {
      if (pzInstance) {
        pzInstance.dispose();
        pzInstance = null;
      }
    }

    function attachPanZoom(): void {
      disposePanZoom();
      if (!svgWrapper.querySelector("svg")) return;
      pzInstance = createPanZoom(svgWrapper, {
        maxZoom: 5,
        minZoom: 0.5,
        smoothScroll: false,
        onClick: () => {
          if (!view.editable) return;
          enterEditing();
        },
      });
    }

    // --- Rendering ---
    async function renderDiagram(source: string): Promise<void> {
      disposePanZoom();

      if (!source.trim()) {
        svgWrapper.innerHTML = '<div class="mermaid-placeholder">Empty mermaid diagram</div>';
        return;
      }

      try {
        const { svg } = await mermaid.render(nextId(), source);
        svgWrapper.innerHTML = svg;
        lastSvg = svg;
        attachPanZoom();
      } catch (err: unknown) {
        if (lastSvg) {
          svgWrapper.innerHTML = lastSvg;
          attachPanZoom();
        } else {
          const msg = err instanceof Error ? err.message : "Invalid mermaid syntax";
          const errorDiv = document.createElement("div");
          errorDiv.className = "mermaid-error";
          errorDiv.textContent = msg;
          svgWrapper.replaceChildren(errorDiv);
        }
      }
    }

    // --- CodeMirror editor ---
    function createCMEditor(content: string): CMEditorView {
      return new CMEditorView({
        state: CMEditorState.create({
          doc: content,
          extensions: [
            // Match Crepe's CodeMirrorBlock extensions
            drawSelection(),
            keymap.of([
              {
                key: "Escape",
                run: () => {
                  leaveEditing();
                  returnFocusToEditor();
                  return true;
                },
              },
              ...defaultKeymap.concat(indentWithTab),
            ]),
            basicSetup,
            CMEditorView.lineWrapping,
            CMEditorView.domEventHandlers({
              blur: () => {
                // Delay to allow Escape keymap to fire first
                setTimeout(() => leaveEditing(), 0);
              },
            }),
          ],
        }),
        parent: cmContainer,
      });
    }

    function returnFocusToEditor(): void {
      const pos = getPos();
      if (pos == null) return;
      view.focus();
      const after = pos + node.nodeSize;
      const resolvedAfter = Math.min(after, view.state.doc.content.size);
      try {
        const sel = TextSelection.create(view.state.doc, resolvedAfter);
        view.dispatch(view.state.tr.setSelection(sel));
      } catch {
        // If position is invalid, just focus the view
      }
    }

    // --- State transitions ---
    function enterEditing(): void {
      if (editing) return;
      editing = true;
      disposePanZoom();
      svgContainer.style.display = "none";
      editContainer.style.display = "block";

      // Create fresh CodeMirror editor each time
      if (cmView) cmView.destroy();
      cmView = createCMEditor(node.textContent);
      cmView.focus();
    }

    function leaveEditing(): void {
      if (!editing) return;
      editing = false;

      // Sync CodeMirror content back to ProseMirror
      const text = cmView?.state.doc.toString() ?? "";
      const pos = getPos();
      if (pos != null) {
        const { state } = view;
        const currentNode = state.doc.nodeAt(pos);
        if (currentNode && currentNode.textContent !== text) {
          const tr = state.tr;
          const from = pos + 1;
          const to = pos + currentNode.nodeSize - 1;
          if (text) {
            tr.replaceWith(from, to, state.schema.text(text));
          } else {
            tr.delete(from, to);
          }
          view.dispatch(tr);
        }
      }

      if (cmView) {
        cmView.destroy();
        cmView = null;
      }

      editContainer.style.display = "none";
      svgContainer.style.display = "block";
      renderDiagram(text);
    }

    // Click-to-edit is handled by panzoom's onClick callback

    // --- Theme change re-render ---
    const rerender = () => {
      if (!editing) renderDiagram(node.textContent);
    };
    activeViews.add(rerender);

    // --- Initial render ---
    renderDiagram(node.textContent);

    // --- NodeView interface ---
    return {
      dom,

      update(updatedNode: Node): boolean {
        if (updatedNode.type !== initialNode.type) return false;
        node = updatedNode;

        if (!editing) {
          renderDiagram(node.textContent);
        }

        return true;
      },

      ignoreMutation(): boolean {
        return true;
      },

      selectNode(): void {
        dom.classList.add("ProseMirror-selectednode");
      },

      deselectNode(): void {
        dom.classList.remove("ProseMirror-selectednode");
      },

      stopEvent(event: Event): boolean {
        // Let CodeMirror handle its events during editing
        if (editing && dom.contains(event.target as globalThis.Node)) {
          return true;
        }
        // Stop wheel events on the SVG container so panzoom handles zoom
        if (event.type === "wheel" && svgContainer.contains(event.target as globalThis.Node)) {
          return true;
        }
        return false;
      },

      destroy(): void {
        disposePanZoom();
        if (cmView) cmView.destroy();
        activeViews.delete(rerender);
        dom.remove();
      },
    };
  };
});
