import type { Editor } from "@milkdown/core";
import type { EditorView as CMEditorView } from "@codemirror/view";

export interface EditorHandle {
  getMarkdown: () => string | undefined;
  getMilkdownCtx?: () => Editor["ctx"] | null;
  getCodeMirrorView?: () => CMEditorView | null;
}
