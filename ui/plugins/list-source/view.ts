import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import { listItemSchema } from "@milkdown/kit/preset/commonmark";
import {
  listItemBlockConfig,
  type ListItemBlockConfig,
} from "@milkdown/kit/component/list-item-block";
import { $view } from "@milkdown/utils";
import { findAncestorOfType } from "../block-source/cursor";
import { markerForListItem, parseMarker } from "./marker";
import { convertListType, unwrapListItem } from "./convert";
import { sinkListItem, liftListItem } from "@milkdown/kit/prose/schema-list";

/**
 * Custom list_item NodeView that shows an editable marker input when the
 * cursor is inside the list item, and a static icon/number otherwise.
 *
 * Overrides Milkdown's `listItemBlockView`.
 */
export const listSourceView = $view(listItemSchema.node, (ctx): NodeViewConstructor => {
  const config: ListItemBlockConfig = ctx.get(listItemBlockConfig.key);

  return (initialNode, view, getPos) => {
    let node = initialNode;
    let editing = false;
    let composing = false;
    let savedMarker = "";
    let prevLabel = initialNode.attrs.label as string;
    let prevListType = initialNode.attrs.listType as string;
    let prevChecked = initialNode.attrs.checked as boolean | null | undefined;

    // --- DOM structure ---
    const dom = document.createElement("div");
    dom.className = "milkdown-list-item-block";

    const li = document.createElement("li");
    li.className = "list-item";

    const labelWrapper = document.createElement("div");
    labelWrapper.className = "label-wrapper";
    labelWrapper.contentEditable = "false";

    const contentDOM = document.createElement("div");
    contentDOM.className = "children";
    contentDOM.setAttribute("data-content-dom", "true");

    li.appendChild(labelWrapper);
    li.appendChild(contentDOM);
    dom.appendChild(li);

    // --- Static label rendering ---
    function renderStaticLabel() {
      const label = node.attrs.label as string;
      const listType = node.attrs.listType as string;
      const checked = node.attrs.checked as boolean | null | undefined;

      const html = config.renderLabel({
        label,
        listType,
        checked: checked ?? undefined,
        readonly: !view.editable,
      });

      labelWrapper.setAttribute("aria-hidden", "true");
      labelWrapper.innerHTML = "";
      const span = document.createElement("span");
      span.className = `milkdown-icon label ${listType === "bullet" ? "bullet" : "ordered"}`;
      span.innerHTML = html;
      labelWrapper.appendChild(span);
    }

    // --- Marker input rendering ---
    function renderMarkerInput() {
      const marker = markerForListItem(node);
      savedMarker = marker;

      labelWrapper.removeAttribute("aria-hidden");
      labelWrapper.innerHTML = "";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "marker-input syntax-marker";
      input.value = marker;
      input.setAttribute("aria-label", "List marker");
      input.setAttribute(
        "aria-description",
        "Edit to change list type. Dash or asterisk for bullet, number and period for ordered, empty to remove list."
      );
      input.tabIndex = -1;

      input.addEventListener("keydown", handleInputKeydown);
      input.addEventListener("blur", handleInputBlur);
      input.addEventListener("compositionstart", () => {
        composing = true;
      });
      input.addEventListener("compositionend", () => {
        composing = false;
      });

      labelWrapper.appendChild(input);
    }

    function getInput(): HTMLInputElement | null {
      return labelWrapper.querySelector("input.marker-input");
    }

    // --- Commit / revert ---
    function commitMarkerEdit() {
      const input = getInput();
      if (!input) return;

      const value = input.value;
      if (value === savedMarker) return; // no change

      const parsed = parseMarker(value);
      const pos = getPos();
      if (pos == null) return;

      switch (parsed.type) {
        case "bullet": {
          const currentType = node.attrs.listType as string;
          if (currentType !== "bullet") {
            convertListType(view, pos, "bullet_list");
          }
          break;
        }
        case "ordered": {
          const currentType = node.attrs.listType as string;
          if (currentType !== "ordered") {
            convertListType(view, pos, "ordered_list");
          }
          break;
        }
        case "unwrap":
          unwrapListItem(view, pos);
          return; // unwrap handles its own focus
        case "invalid":
          // Revert to previous value
          input.value = savedMarker;
          return;
      }
    }

    function revertMarkerEdit() {
      const input = getInput();
      if (input) input.value = savedMarker;
    }

    function returnFocusToContent() {
      const pos = getPos();
      if (pos == null) return;

      view.focus();

      // Restore cursor inside the list item's content
      const $pos = view.state.doc.resolve(pos + 1);
      // Find first text position inside the list item
      const from = $pos.nodeAfter
        ? pos + 2 // inside first child paragraph
        : pos + 1;
      const resolvedFrom = Math.min(from, view.state.doc.content.size);
      try {
        const sel = TextSelection.create(view.state.doc, resolvedFrom);
        view.dispatch(view.state.tr.setSelection(sel));
      } catch {
        // If position is invalid, just focus the view
      }
    }

    // --- Event handlers ---
    function handleInputKeydown(e: KeyboardEvent) {
      if (composing) return;

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          commitMarkerEdit();
          returnFocusToContent();
          break;
        case "Escape":
          e.preventDefault();
          revertMarkerEdit();
          returnFocusToContent();
          break;
        case "Tab": {
          e.preventDefault();
          commitMarkerEdit();
          returnFocusToContent();
          const pos = getPos();
          if (pos == null) break;
          const listItemType = view.state.schema.nodes.list_item;
          if (!listItemType) break;
          if (e.shiftKey) {
            liftListItem(listItemType)(view.state, view.dispatch.bind(view));
          } else {
            sinkListItem(listItemType)(view.state, view.dispatch.bind(view));
          }
          break;
        }
        case "ArrowUp":
        case "ArrowDown":
          e.preventDefault();
          commitMarkerEdit();
          returnFocusToContent();
          break;
      }
    }

    function handleInputBlur() {
      if (composing) return;
      commitMarkerEdit();
    }

    // --- NodeView interface ---
    function enterEditing() {
      if (editing) return;
      editing = true;
      renderMarkerInput();
    }

    function leaveEditing() {
      if (!editing) return;
      editing = false;
      renderStaticLabel();
    }

    function checkCursor() {
      if (!view.editable) {
        leaveEditing();
        return;
      }

      const pos = getPos();
      if (pos == null) {
        leaveEditing();
        return;
      }

      const ancestor = findAncestorOfType(view.state, "list_item");
      const cursorInside = ancestor !== null && ancestor.pos === pos;

      if (cursorInside && !editing) {
        enterEditing();
      } else if (!cursorInside && editing) {
        leaveEditing();
      }
    }

    // Initial render
    renderStaticLabel();

    return {
      dom,
      contentDOM,

      update(updatedNode: Node): boolean {
        if (updatedNode.type !== initialNode.type) return false;

        node = updatedNode;

        if (editing) {
          // If the node changed while editing (e.g. undo), update the input
          const input = getInput();
          if (input && !input.matches(":focus")) {
            const newMarker = markerForListItem(node);
            input.value = newMarker;
            savedMarker = newMarker;
          }
        } else {
          const newLabel = updatedNode.attrs.label as string;
          const newType = updatedNode.attrs.listType as string;
          const newChecked = updatedNode.attrs.checked as boolean | null | undefined;
          if (newLabel !== prevLabel || newType !== prevListType || newChecked !== prevChecked) {
            renderStaticLabel();
            prevLabel = newLabel;
            prevListType = newType;
            prevChecked = newChecked;
          }
        }

        checkCursor();
        return true;
      },

      ignoreMutation(mutation: MutationRecord): boolean {
        if (!dom || !contentDOM) return true;
        if ((mutation.type as string) === "selection") return false;
        if (contentDOM === mutation.target && mutation.type === "attributes") return true;
        if (contentDOM.contains(mutation.target)) return false;
        return true;
      },

      selectNode() {
        li.classList.add("ProseMirror-selectednode");
      },

      deselectNode() {
        li.classList.remove("ProseMirror-selectednode");
      },

      destroy() {
        const input = getInput();
        if (input) {
          input.removeEventListener("keydown", handleInputKeydown);
          input.removeEventListener("blur", handleInputBlur);
        }
        dom.remove();
        contentDOM.remove();
      },
    };
  };
});
