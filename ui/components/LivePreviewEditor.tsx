import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import {
  EditorView,
  keymap,
  dropCursor,
  highlightSpecialChars,
  placeholder,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import type { EditorSelection } from "@codemirror/state";
import { indentOnInput, bracketMatching } from "@codemirror/language";
import { history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  defaultHideExtensions,
  blockQuoteExtension,
  taskExtension,
  imageExtension,
  emojiExtension,
  horizonalRuleExtension,
  dashExtension,
  revealBlockOnArrowExtension,
  clickLinkExtension,
  defaultClickLinkHandler,
  fixedTabWidthExtension,
  softIndentExtension,
  codeBlockDecorationsExtension,
  prosemarkBaseThemeSetup,
} from "@prosemark/core";
import {
  depthAwareBulletExtension,
  mermaidPreviewExtension,
  tablePreviewExtension,
  livePreviewFormattingKeymap,
  listIndentKeymap,
} from "../live-preview";
import { useShellDocSync } from "../hooks/useShellDocSync";
import { markdownSyntaxExtensions } from "../markdown/parser";
import { appDefaultKeymap } from "../utils/editorKeymap";
import { holdScrollAnchor } from "../utils/editorPosition";
import type { EditorPosition } from "../utils/editorPosition";
import { searchExtensions } from "../utils/searchHighlight";
import type { EditorHandle } from "../types/editor";

interface LivePreviewEditorProps {
  defaultValue: string;
  /** Shell document version: the editor resets its buffer only when this changes. */
  docVersion: number;
  onChange: () => void;
  /** Position carried over from the editor this one replaces. */
  restorePosition?: EditorPosition | null;
}

export const LivePreviewEditor = forwardRef<EditorHandle, LivePreviewEditorProps>(
  ({ defaultValue, docVersion, onChange, restorePosition }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

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
            // ProseMark live-preview core: prosemarkBasicSetup() from
            // @prosemark/core 0.0.9, minus searchKeymap (Cmd+F belongs to
            // SearchBar), foldGutter, and lintKeymap. The
            // defaultFoldableSyntaxExtensions bundle is unpacked below so
            // bulletListExtension (fixed "•" at every depth) can be swapped
            // for the local depthAwareBulletExtension. Re-diff both the setup
            // and the bundle members on upgrades.
            defaultHideExtensions,
            blockQuoteExtension,
            depthAwareBulletExtension, // in place of bulletListExtension
            taskExtension,
            imageExtension,
            emojiExtension,
            horizonalRuleExtension, // upstream export name really is missing the "t"
            dashExtension,
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
            searchExtensions,
            placeholder("Start writing markdown here…"),
            keymap.of([
              ...livePreviewFormattingKeymap,
              ...closeBracketsKeymap,
              ...appDefaultKeymap,
              // searchKeymap intentionally excluded — search is handled by SearchBar
              ...historyKeymap,
              ...completionKeymap,
              // List-aware Tab/Shift-Tab (#85); falls through to indentWithTab
              // outside list items.
              ...listIndentKeymap,
              indentWithTab,
            ]),
            EditorView.lineWrapping,
            markdown({
              codeLanguages: languages,
              extensions: markdownSyntaxExtensions,
            }),
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

    return <div ref={containerRef} className="live-preview-editor" />;
  }
);
LivePreviewEditor.displayName = "LivePreviewEditor";
