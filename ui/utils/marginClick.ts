import { ViewPlugin } from "@codemirror/view";

/** Margin clicks (#90). The prose column is centered inside a full-pane
    .cm-scroller, and CodeMirror's mouse handling listens on the content DOM,
    so pointer gestures starting in the side margins would otherwise be dead.
    Re-target them: cancel the original mousedown (its default action would
    move focus out of the editor) and dispatch a clone on the content DOM.
    CodeMirror resolves position, click count, and modifiers from the event
    itself, so click, shift-click, double-click, and drag selection all behave
    as if they started inside the content. */
export const marginClickExtension = ViewPlugin.define((view) => {
  const onMouseDown = (event: MouseEvent) => {
    if (event.target !== view.scrollDOM) return;
    event.preventDefault();
    view.contentDOM.dispatchEvent(new MouseEvent(event.type, event));
  };
  view.scrollDOM.addEventListener("mousedown", onMouseDown);
  return {
    destroy() {
      view.scrollDOM.removeEventListener("mousedown", onMouseDown);
    },
  };
});
