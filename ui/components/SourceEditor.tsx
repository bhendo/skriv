import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { EditorHandle } from "../types/editor";

const skrivTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--crepe-color-background)",
    color: "var(--crepe-color-on-background)",
  },
  ".cm-content": {
    caretColor: "var(--crepe-color-on-background)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--crepe-color-on-background) !important",
  },
  ".cm-gutters": {
    backgroundColor: "var(--crepe-color-surface-low)",
    borderRight: "1px solid var(--crepe-color-outline)",
    color: "var(--crepe-color-on-surface-variant)",
  },
  ".cm-activeLineGutter, .cm-activeLine": {
    backgroundColor: "var(--crepe-color-surface-low)",
  },
});

interface SourceEditorProps {
  defaultValue: string;
  onChange: () => void;
}

export const SourceEditor = forwardRef<EditorHandle, SourceEditorProps>(
  ({ defaultValue, onChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => viewRef.current?.state.doc.toString(),
      }),
      []
    );

    useEffect(() => {
      if (!containerRef.current) return;

      const view = new EditorView({
        state: EditorState.create({
          doc: defaultValue,
          extensions: [
            EditorView.lineWrapping,
            history(),
            closeBrackets(),
            keymap.of([
              { key: "Mod-/", run: () => true },
              ...closeBracketsKeymap,
              ...defaultKeymap,
              ...searchKeymap,
              ...historyKeymap,
            ]),
            markdown({ codeLanguages: languages }),
            syntaxHighlighting(defaultHighlightStyle),
            skrivTheme,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChange();
              }
            }),
          ],
        }),
        parent: containerRef.current,
      });

      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only create editor on mount
    }, []);

    return <div ref={containerRef} className="source-editor" />;
  }
);
SourceEditor.displayName = "SourceEditor";
