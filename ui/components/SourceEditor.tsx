import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import type { EditorHandle } from "../types/editor";

interface SourceEditorProps {
  defaultValue: string;
  onChange: () => void;
}

export const SourceEditor = forwardRef<EditorHandle, SourceEditorProps>(
  ({ defaultValue, onChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

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
            basicSetup,
            EditorView.lineWrapping,
            markdown({ codeLanguages: languages }),
            oneDark,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current();
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
