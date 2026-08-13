import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";

/**
 * Swap the editor buffer when the shell replaces the document (file open /
 * external reload). Keyed on docVersion, not the document string: a save
 * echoes the saved string back through content, and a string comparison
 * would misread that as a new document whenever a keystroke outran the
 * write. setState reuses the view and its DOM, and drops undo history so
 * Cmd+Z can't restore the previous file. The mount picks up the current
 * version, so the effect acts only on later bumps.
 */
export function useShellDocSync(
  viewRef: RefObject<EditorView | null>,
  docVersion: number,
  defaultValue: string,
  createState: (doc: string) => EditorState
) {
  const appliedVersionRef = useRef(docVersion);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || appliedVersionRef.current === docVersion) return;
    appliedVersionRef.current = docVersion;
    view.setState(createState(defaultValue));
  }, [viewRef, docVersion, defaultValue, createState]);
}
