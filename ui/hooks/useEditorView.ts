import { useCallback } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import type { EditorHandle } from "../types/editor";

/**
 * Per-action accessor for the live CodeMirror view behind the editor handle.
 * Resolved on every call, never cached across renders — the view is destroyed
 * and rebuilt on source-mode toggles.
 */
export function useEditorView(editorRef: RefObject<EditorHandle | null>): () => EditorView | null {
  return useCallback(() => editorRef.current?.getCodeMirrorView() ?? null, [editorRef]);
}
