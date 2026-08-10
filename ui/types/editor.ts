import type { EditorView } from "@codemirror/view";

export interface EditorHandle {
  getMarkdown: () => string | undefined;
  getCodeMirrorView: () => EditorView | null;
}
