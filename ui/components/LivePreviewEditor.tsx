import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView, keymap, dropCursor, highlightSpecialChars } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { indentOnInput, bracketMatching } from "@codemirror/language";
import { history, historyKeymap, defaultKeymap, indentWithTab } from "@codemirror/commands";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import { search } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  defaultHideExtensions,
  defaultFoldableSyntaxExtensions,
  revealBlockOnArrowExtension,
  clickLinkExtension,
  defaultClickLinkHandler,
  fixedTabWidthExtension,
  softIndentExtension,
  codeBlockDecorationsExtension,
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import {
  mermaidPreviewExtension,
  tablePreviewExtension,
  livePreviewFormattingKeymap,
} from "../live-preview";
import type { EditorHandle } from "../types/editor";

interface LivePreviewEditorProps {
  defaultValue: string;
  onChange: () => void;
}

export const LivePreviewEditor = forwardRef<EditorHandle, LivePreviewEditorProps>(
  ({ defaultValue, onChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    // Last document string exchanged with the shell; null once the user
    // edits. Snapshot round-trips hand the same string back, so the sync
    // effect can skip resetting the editor (a reference-equality check).
    const lastSyncedRef = useRef<string | null>(null);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => {
          const view = viewRef.current;
          if (!view) return undefined;
          const doc = view.state.doc.toString();
          lastSyncedRef.current = doc;
          return doc;
        },
        getCodeMirrorView: () => viewRef.current,
      }),
      []
    );

    const createState = useCallback(
      (doc: string) =>
        EditorState.create({
          doc,
          extensions: [
            // ProseMark live-preview core: prosemarkBasicSetup() from
            // @prosemark/core 0.0.9, minus searchKeymap (Cmd+F belongs to
            // SearchBar), foldGutter, and lintKeymap. Re-diff on upgrades.
            defaultHideExtensions,
            defaultFoldableSyntaxExtensions,
            revealBlockOnArrowExtension,
            clickLinkExtension,
            defaultClickLinkHandler,
            fixedTabWidthExtension,
            softIndentExtension,
            codeBlockDecorationsExtension,
            mermaidPreviewExtension,
            tablePreviewExtension,
            prosemarkBaseThemeSetup(),
            highlightSpecialChars(),
            history(),
            dropCursor(),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            search(),
            keymap.of([
              ...livePreviewFormattingKeymap,
              ...closeBracketsKeymap,
              ...defaultKeymap,
              // searchKeymap intentionally excluded — search is handled by SearchBar
              ...historyKeymap,
              ...completionKeymap,
              indentWithTab,
            ]),
            EditorView.lineWrapping,
            markdown({
              codeLanguages: languages,
              extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
            }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                lastSyncedRef.current = null;
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
        state: createState(defaultValue),
        parent: containerRef.current,
      });
      viewRef.current = view;
      lastSyncedRef.current = defaultValue;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only create editor on mount
    }, []);

    // A new document arrived from the shell (file open / external reload).
    // setState reuses the view and its DOM, and drops undo history so Cmd+Z
    // can't restore the previous file.
    useEffect(() => {
      const view = viewRef.current;
      if (!view || lastSyncedRef.current === defaultValue) return;
      view.setState(createState(defaultValue));
      lastSyncedRef.current = defaultValue;
    }, [defaultValue, createState]);

    return <div ref={containerRef} className="live-preview-editor" />;
  }
);
LivePreviewEditor.displayName = "LivePreviewEditor";
