import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMEditorView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { $view } from "@milkdown/utils";
import { EditorView as CMEditorView, type ViewUpdate, keymap } from "@codemirror/view";
import { EditorState as CMEditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { mermaidBlockNode } from "./node";
import { createMermaidSurface } from "../../mermaid/surface";
import { createFenceOpen, createFenceClose } from "../code-block-source/plugin";

export const mermaidBlockView = $view(mermaidBlockNode, (): NodeViewConstructor => {
  return (initialNode: Node, view: PMEditorView, getPos: () => number | undefined) => {
    let node = initialNode;
    let cmView: CMEditorView | null = null;
    let updating = false; // Guard against CM↔PM sync loops

    const surface = createMermaidSurface({
      onActivate: () => {
        if (view.editable) enterEditing();
      },
    });
    const dom = surface.dom;

    // Editing container with fence markers
    const editContainer = document.createElement("div");
    editContainer.className = "mermaid-edit-container milkdown-code-block";
    editContainer.style.display = "none";

    const cmContainer = document.createElement("div");
    cmContainer.className = "mermaid-cm-container";

    editContainer.appendChild(createFenceOpen("mermaid"));
    editContainer.appendChild(cmContainer);
    editContainer.appendChild(createFenceClose());
    dom.appendChild(editContainer);

    // --- CodeMirror ↔ ProseMirror sync ---
    // Sync CM changes to PM in real-time (like Crepe's CodeMirrorBlock)
    // so getMarkdown() always reflects current content during save.
    function forwardUpdate(update: ViewUpdate): void {
      if (updating || !cmView?.hasFocus) return;
      if (!update.docChanged) return;

      let offset = (getPos() ?? 0) + 1;
      const tr = view.state.tr;
      update.changes.iterChanges(
        (fromA: number, toA: number, _fromB: number, toB: number, text) => {
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
            basicSetup,
            keymap.of([
              {
                key: "Escape",
                run: () => {
                  leaveEditing();
                  returnFocusToEditor();
                  return true;
                },
              },
            ]),
            oneDark,
            // Provide mermaid comment tokens so Cmd+/ works (mermaid has no CM language mode)
            CMEditorState.languageData.of(() => [
              { commentTokens: { line: "%%", block: { open: "%%{", close: "}%%" } } },
            ]),
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
      surface.hide();
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
      surface.show();
      void surface.render(text);
    }

    // --- Initial render ---
    void surface.render(node.textContent);

    // --- NodeView interface ---
    return {
      dom,

      update(updatedNode: Node): boolean {
        if (updatedNode.type !== initialNode.type) return false;
        if (updating) return true;

        const contentChanged = updatedNode.textContent !== node.textContent;
        node = updatedNode;

        if (contentChanged) surface.closeOverlay();

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
          void surface.render(node.textContent);
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
        if (
          event.type === "wheel" &&
          surface.svgContainer.contains(event.target as globalThis.Node)
        ) {
          return true;
        }
        return false;
      },

      destroy(): void {
        surface.dispose();
        if (cmView) cmView.destroy();
        dom.remove();
      },
    };
  };
});
