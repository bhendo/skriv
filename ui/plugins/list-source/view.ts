import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import { listItemSchema } from "@milkdown/kit/preset/commonmark";
import {
  listItemBlockConfig,
  type ListItemBlockConfig,
} from "@milkdown/kit/component/list-item-block";
import { $prose, $view } from "@milkdown/utils";
import { findAncestorOfType } from "../block-source/cursor";
import { makeDecorationPlugin } from "../block-source/decoration";
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
      const isReadonly = !view.editable;

      li.classList.remove("editing-marker");
      labelWrapper.classList.remove("editing-marker");
      labelWrapper.style.width = "";

      const html = config.renderLabel({
        label,
        listType,
        checked: checked ?? undefined,
        readonly: isReadonly,
      });

      labelWrapper.innerHTML = "";
      const span = document.createElement("span");
      const labelClass =
        checked == null
          ? listType === "bullet"
            ? "bullet"
            : "ordered"
          : checked
            ? "checked"
            : "unchecked";
      span.className = `milkdown-icon label ${labelClass}${isReadonly ? " readonly" : ""}`;
      span.innerHTML = html;
      labelWrapper.appendChild(span);

      if (checked == null) {
        labelWrapper.setAttribute("aria-hidden", "true");
        labelWrapper.removeAttribute("role");
        labelWrapper.removeAttribute("aria-checked");
        labelWrapper.removeAttribute("aria-label");
      } else {
        labelWrapper.removeAttribute("aria-hidden");
        labelWrapper.setAttribute("role", "checkbox");
        labelWrapper.setAttribute("aria-checked", String(checked));
        labelWrapper.setAttribute(
          "aria-label",
          checked ? "Checked task list item" : "Unchecked task list item"
        );
      }
    }

    /** Resolve the parent list wrapper type from the document. */
    function parentListType(): "bullet" | "ordered" | undefined {
      const pos = getPos();
      if (pos == null) return undefined;
      const $pos = view.state.doc.resolve(pos);
      const parent = $pos.parent;
      if (parent.type.name === "ordered_list") return "ordered";
      if (parent.type.name === "bullet_list") return "bullet";
      return undefined;
    }

    // --- Marker input rendering ---
    function renderMarkerInput() {
      const marker = markerForListItem(node, parentListType());
      savedMarker = marker;

      li.classList.add("editing-marker");
      labelWrapper.classList.add("editing-marker");
      labelWrapper.removeAttribute("aria-hidden");
      labelWrapper.removeAttribute("role");
      labelWrapper.removeAttribute("aria-checked");
      labelWrapper.removeAttribute("aria-label");
      labelWrapper.innerHTML = "";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "marker-input syntax-marker";
      input.value = marker;
      input.setAttribute("aria-label", "List marker");
      input.setAttribute(
        "aria-description",
        "Edit to change list type. Use dash or asterisk for bullets, add [ ] or [x] for task items, use number and period for ordered lists, or clear it to remove the list."
      );
      input.tabIndex = -1;

      input.addEventListener("input", handleInput);
      input.addEventListener("keydown", handleInputKeydown);
      input.addEventListener("blur", handleInputBlur);
      input.addEventListener("compositionstart", handleCompositionStart);
      input.addEventListener("compositionend", handleCompositionEnd);

      syncInputWidth(input, marker);
      labelWrapper.appendChild(input);
    }

    function getInput(): HTMLInputElement | null {
      return labelWrapper.querySelector("input.marker-input");
    }

    function syncInputWidth(input: HTMLInputElement, value: string) {
      // Size the input to fit the marker text.  We add 1 extra `ch` to
      // account for the slight difference between the CSS `ch` unit
      // (the advance width of "0") and actual rendered text, plus the
      // <input> element's built-in internal decoration.  The CSS right
      // padding (0.35ch) provides additional breathing room.
      const chars = (value || "---").length;
      const width = `${Math.max(chars + 1, 3)}ch`;
      input.style.width = width;
      labelWrapper.style.width = width;
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
          syncTaskState(parsed.checked ?? null);
          break;
        }
        case "ordered": {
          const currentType = node.attrs.listType as string;
          if (currentType !== "ordered") {
            convertListType(view, pos, "ordered_list");
          }
          syncTaskState(parsed.checked ?? null);
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
      if (input) {
        input.value = savedMarker;
        syncInputWidth(input, savedMarker);
      }
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

    function handleInput(e: Event) {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      syncInputWidth(input, input.value);
    }

    function handleCompositionStart() {
      composing = true;
    }

    function handleCompositionEnd() {
      composing = false;
    }

    function syncTaskState(checked: boolean | null) {
      const currentPos = getPos();
      if (currentPos == null) return;

      const currentNode = view.state.doc.nodeAt(currentPos);
      if (!currentNode || currentNode.type.name !== "list_item") return;

      const currentChecked = (currentNode.attrs.checked as boolean | null | undefined) ?? null;
      if (currentChecked === checked) return;

      view.dispatch(
        view.state.tr.setNodeMarkup(currentPos, undefined, {
          ...currentNode.attrs,
          checked,
        })
      );
    }

    function handleLabelPointerdown(e: PointerEvent) {
      if (!view.editable) return;
      if (e.target instanceof HTMLInputElement) return;

      const currentChecked = (node.attrs.checked as boolean | null | undefined) ?? null;
      if (currentChecked == null) return;

      e.preventDefault();
      e.stopPropagation();
      syncTaskState(!currentChecked);
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

    // Initial render — start with the static label, then immediately
    // check whether the cursor is inside this item so that list items
    // created by input rules (typing "- " or "1. ") show the editable
    // marker right away instead of requiring a click-away-and-back.
    labelWrapper.addEventListener("pointerdown", handleLabelPointerdown);
    renderStaticLabel();
    checkCursor();

    return {
      dom,
      contentDOM,

      update(updatedNode: Node): boolean {
        if (updatedNode.type !== initialNode.type) return false;

        node = updatedNode;

        if (editing) {
          // Refresh the marker when node attrs change (e.g. sync plugin
          // correcting listType from "bullet" to "ordered" after input
          // rules create the list).  Skip only if the input is focused
          // AND the value already matches — the user may be mid-edit.
          const newMarker = markerForListItem(node, parentListType());
          if (newMarker !== savedMarker) {
            const input = getInput();
            // Skip overwrite if the user is actively editing the input
            if (input && document.activeElement !== input) {
              input.value = newMarker;
              syncInputWidth(input, newMarker);
              savedMarker = newMarker;
            }
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

      ignoreMutation(
        mutation: MutationRecord | { type: "selection"; target: globalThis.Node }
      ): boolean {
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
          input.removeEventListener("input", handleInput);
          input.removeEventListener("keydown", handleInputKeydown);
          input.removeEventListener("blur", handleInputBlur);
          input.removeEventListener("compositionstart", handleCompositionStart);
          input.removeEventListener("compositionend", handleCompositionEnd);
        }
        labelWrapper.removeEventListener("pointerdown", handleLabelPointerdown);
        dom.remove();
        contentDOM.remove();
      },
    };
  };
});

/**
 * Companion plugin that produces a node decoration on the list_item
 * containing the cursor. This forces ProseMirror to call `update()`
 * on the affected NodeViews when the cursor moves between list items,
 * even if the node content hasn't changed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const listCursorPlugin = $prose((_ctx) =>
  makeDecorationPlugin(
    "list-cursor",
    (state) => {
      const ancestor = findAncestorOfType(state, "list_item");
      if (!ancestor) return DecorationSet.empty;
      return DecorationSet.create(state.doc, [
        Decoration.node(ancestor.pos, ancestor.pos + ancestor.node.nodeSize, {
          class: "list-item-active",
        }),
      ]);
    },
    {
      rebuildOnSelection: true,
      cacheKey: (state) => findAncestorOfType(state, "list_item")?.pos ?? null,
    }
  )
);
