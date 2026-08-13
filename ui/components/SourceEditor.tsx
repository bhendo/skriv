import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import type { EditorSelection } from "@codemirror/state";
import {
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldKeymap,
} from "@codemirror/language";
import { history, historyKeymap } from "@codemirror/commands";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import { highlightSelectionMatches } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { useShellDocSync } from "../hooks/useShellDocSync";
import { appDefaultKeymap } from "../utils/editorKeymap";
import { holdScrollAnchor } from "../utils/editorPosition";
import type { EditorPosition } from "../utils/editorPosition";
import { marginClickExtension } from "../utils/marginClick";
import { searchExtensions } from "../utils/searchHighlight";
import type { EditorHandle } from "../types/editor";

interface SourceEditorProps {
  defaultValue: string;
  /** Shell document version: the editor resets its buffer only when this changes. */
  docVersion: number;
  onChange: () => void;
  /** Position carried over from the editor this one replaces. */
  restorePosition?: EditorPosition | null;
}

export const SourceEditor = forwardRef<EditorHandle, SourceEditorProps>(
  ({ defaultValue, docVersion, onChange, restorePosition }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => viewRef.current?.state.doc.toString(),
        getCodeMirrorView: () => viewRef.current,
      }),
      []
    );

    const createState = useCallback(
      (doc: string, selection?: EditorSelection) =>
        EditorState.create({
          doc,
          selection,
          extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            searchExtensions,
            placeholder("Start writing markdown here…"),
            keymap.of([
              ...closeBracketsKeymap,
              ...appDefaultKeymap,
              // searchKeymap intentionally excluded — search is handled by SearchBar
              ...historyKeymap,
              ...foldKeymap,
              ...completionKeymap,
            ]),
            EditorView.lineWrapping,
            marginClickExtension,
            markdown({ codeLanguages: languages }),
            oneDark,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current();
              }
            }),
          ],
        }),
      []
    );

    useEffect(() => {
      if (!containerRef.current) return;

      const view = new EditorView({
        state: createState(defaultValue, restorePosition?.selection),
        parent: containerRef.current,
        // Anchor the carried-over top block, not the cursor: same content
        // stays visible even when the cursor is off-screen. holdScrollAnchor
        // then applies the fractional depth into that block once real
        // heights are measured.
        scrollTo: restorePosition
          ? EditorView.scrollIntoView(restorePosition.anchor.from, { y: "start" })
          : undefined,
      });

      viewRef.current = view;
      let cancelHold: (() => void) | undefined;
      if (restorePosition) {
        view.focus();
        cancelHold = holdScrollAnchor(view, restorePosition.anchor);
      }

      return () => {
        cancelHold?.();
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only create editor on mount
    }, []);

    useShellDocSync(viewRef, docVersion, defaultValue, createState);

    return <div ref={containerRef} className="source-editor" />;
  }
);
SourceEditor.displayName = "SourceEditor";
