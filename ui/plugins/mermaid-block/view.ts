import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMEditorView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { $view } from "@milkdown/utils";
import {
  EditorView as CMEditorView,
  type ViewUpdate,
  keymap,
  drawSelection,
} from "@codemirror/view";
import { EditorState as CMEditorState } from "@codemirror/state";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import createPanZoom, { type PanZoom } from "panzoom";
import mermaid from "mermaid";
import { mermaidBlockNode } from "./node";
import { buildMermaidThemeConfig } from "./theme";
import { createFenceOpen, createFenceClose } from "../code-block-source/plugin";

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
    htmlLabels: true,
    theme: config.theme,
    themeVariables: config.themeVariables,
    // Render at natural size so panzoom handles scaling (not mermaid).
    flowchart: {
      useMaxWidth: false,
      padding: 20,
      nodeSpacing: 120,
      rankSpacing: 160,
      wrappingWidth: 180,
    },
    sequence: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false, padding: 15 },
    er: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    pie: { useMaxWidth: false },
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
    let lastSvg = "";
    let lastRenderedContent = "";
    let cmView: CMEditorView | null = null;
    let pzInstance: PanZoom | null = null;
    let updating = false; // Guard against CM↔PM sync loops

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

    const cmContainer = document.createElement("div");
    cmContainer.className = "mermaid-cm-container";

    editContainer.appendChild(createFenceOpen("mermaid"));
    editContainer.appendChild(cmContainer);
    editContainer.appendChild(createFenceClose());
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
      const svgEl = svgWrapper.querySelector("svg");
      if (!svgEl) return;

      // With useMaxWidth:false, the SVG renders at natural size.
      // Calculate scale to fit within container width.
      const containerWidth = svgContainer.clientWidth;
      const svgWidth = svgEl.getBoundingClientRect().width;
      const svgHeight = svgEl.getBoundingClientRect().height;
      if (svgWidth === 0 || svgHeight === 0) return;

      const scale = Math.min(containerWidth / svgWidth, 1);

      // Size container height to fit the scaled diagram (capped at 80vh)
      const fittedHeight = svgHeight * scale + 32;
      const maxHeight = window.innerHeight * 0.8;
      const containerH = Math.min(fittedHeight, maxHeight);
      svgContainer.style.height = `${containerH}px`;

      // Center the scaled content
      const offsetX = (containerWidth - svgWidth * scale) / 2;
      const offsetY = (containerH - svgHeight * scale) / 2;

      pzInstance = createPanZoom(svgWrapper, {
        maxZoom: 5,
        minZoom: 0.2,
        smoothScroll: false,
        initialZoom: scale,
        initialX: offsetX,
        initialY: offsetY,
        onClick: () => {
          if (!view.editable) return;
          enterEditing();
        },
      });
    }

    /**
     * Mermaid sometimes calculates a viewBox that doesn't encompass all
     * rendered content (especially with subgraphs). Measure the actual
     * bounding box of all SVG content and expand the viewBox if needed.
     */
    function fixViewBox(svgEl: SVGSVGElement): void {
      const bbox = svgEl.getBBox();
      const padding = 20;
      const x = bbox.x - padding;
      const y = bbox.y - padding;
      const w = bbox.width + padding * 2;
      const h = bbox.height + padding * 2;
      svgEl.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    }

    // --- Rendering ---
    async function renderDiagram(source: string): Promise<void> {
      if (source === lastRenderedContent) return;
      disposePanZoom();
      lastRenderedContent = source;

      if (!source.trim()) {
        svgWrapper.innerHTML = '<div class="mermaid-placeholder">Empty mermaid diagram</div>';
        return;
      }

      try {
        const { svg } = await mermaid.render(nextId(), source);
        svgWrapper.innerHTML = svg;
        const svgEl = svgWrapper.querySelector("svg");
        if (svgEl) fixViewBox(svgEl);
        lastSvg = svgWrapper.innerHTML;
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

    // --- CodeMirror ↔ ProseMirror sync ---
    // Sync CM changes to PM in real-time (like Crepe's CodeMirrorBlock)
    // so getMarkdown() always reflects current content during save.
    function forwardUpdate(update: ViewUpdate): void {
      if (updating || !cmView?.hasFocus) return;
      if (!update.docChanged) return;

      let offset = (getPos() ?? 0) + 1;
      const tr = view.state.tr;
      update.changes.iterChanges(
        (fromA: number, toA: number, _fromB: number, toB: number, text: { toString(): string }) => {
          if (text.length) {
            tr.replaceWith(offset + fromA, offset + toA, view.state.schema.text(text.toString()));
          } else {
            tr.delete(offset + fromA, offset + toA);
          }
          offset += toB - _fromB - (toA - fromA);
        }
      );
      view.dispatch(tr);
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
            CMEditorView.updateListener.of(forwardUpdate),
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
      if (cmView) return;
      disposePanZoom();
      svgContainer.style.display = "none";
      editContainer.style.display = "block";

      cmView = createCMEditor(node.textContent);
      cmView.focus();
    }

    function leaveEditing(): void {
      if (!cmView) return;

      // Content already synced to ProseMirror by forwardUpdate
      const text = node.textContent;
      cmView.destroy();
      cmView = null;

      editContainer.style.display = "none";
      svgContainer.style.display = "block";
      lastRenderedContent = ""; // Content may have changed during editing
      renderDiagram(text);
    }

    // Click-to-edit for rendered diagrams is handled by panzoom's onClick.
    // For empty/error states (no panzoom), handle click directly.
    svgContainer.addEventListener("click", () => {
      if (pzInstance || !view.editable) return;
      enterEditing();
    });

    // --- Theme change re-render ---
    const rerender = () => {
      if (!cmView) {
        lastRenderedContent = ""; // Force re-render on theme change
        renderDiagram(node.textContent);
      }
    };
    activeViews.add(rerender);

    // --- Initial render ---
    renderDiagram(node.textContent);

    // --- NodeView interface ---
    return {
      dom,

      update(updatedNode: Node): boolean {
        if (updatedNode.type !== initialNode.type) return false;
        if (updating) return true;

        const contentChanged = updatedNode.textContent !== node.textContent;
        node = updatedNode;

        if (cmView && contentChanged) {
          // External change while editing — update CodeMirror
          updating = true;
          const cmContent = cmView.state.doc.toString();
          if (cmContent !== node.textContent) {
            cmView.dispatch({
              changes: { from: 0, to: cmContent.length, insert: node.textContent },
            });
          }
          updating = false;
        } else if (!cmView && contentChanged) {
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
        if (cmView && dom.contains(event.target as globalThis.Node)) {
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
