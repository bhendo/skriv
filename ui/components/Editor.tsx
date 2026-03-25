import { forwardRef, useImperativeHandle } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { remarkStringifyOptionsCtx } from "@milkdown/core";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { getMarkdown, $prose } from "@milkdown/utils";
import type { EditorHandle } from "../types/editor";
import { inlineSourceNode, inlineSourcePlugin } from "../plugins/inline-source";
import { headingSourceNode, headingSourcePlugin } from "../plugins/heading-source";
import { listSourceView, listCursorPlugin } from "../plugins/list-source";
import { codeBlockSourcePlugin } from "../plugins/code-block-source";
import { linkSourceNode, linkSourcePlugin } from "../plugins/link-source";
import { mermaidBlockNode, mermaidBlockView, remarkMermaidPlugin } from "../plugins/mermaid-block";
import { createSearchPlugin } from "../plugins/search";
import "@milkdown/crepe/theme/common/style.css";
import "../theme/skriv.css";

export type { EditorHandle } from "../types/editor";

const searchPlugin = $prose(() => createSearchPlugin());

interface EditorProps {
  defaultValue: string;
  onChange?: (markdown: string) => void;
  syntaxToggling?: boolean;
}

const CrepeEditor = forwardRef<EditorHandle, EditorProps>(
  ({ defaultValue, onChange, syntaxToggling = true }, ref) => {
    useEditor(
      (root) => {
        const crepe = new Crepe({
          root,
          defaultValue,
          features: {
            [CrepeFeature.CodeMirror]: true,
            [CrepeFeature.Toolbar]: true,
            [CrepeFeature.BlockEdit]: true,
            [CrepeFeature.LinkTooltip]: true,
            [CrepeFeature.ImageBlock]: true,
            [CrepeFeature.Table]: true,
            [CrepeFeature.ListItem]: true,
            [CrepeFeature.Placeholder]: true,
            [CrepeFeature.Cursor]: true,
            [CrepeFeature.Latex]: false,
          },
        });

        crepe.editor.config((ctx) => {
          ctx.update(remarkStringifyOptionsCtx, (options) => ({
            ...options,
            bullet: "-" as const,
          }));
        });

        if (syntaxToggling) {
          crepe.editor
            .use(inlineSourceNode)
            .use(inlineSourcePlugin)
            .use(headingSourceNode)
            .use(headingSourcePlugin)
            .use(listSourceView)
            .use(listCursorPlugin)
            .use(codeBlockSourcePlugin)
            .use(linkSourceNode)
            .use(linkSourcePlugin);
        }

        crepe.editor
          .use(remarkMermaidPlugin)
          .use(mermaidBlockNode)
          .use(mermaidBlockView)
          .use(searchPlugin);

        if (onChange) {
          crepe.on((listener) => {
            listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
              if (markdown !== prevMarkdown) {
                onChange(markdown);
              }
            });
          });
        }

        return crepe;
      },
      [defaultValue, syntaxToggling]
    );

    const [, getInstance] = useInstance();

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => {
          const editor = getInstance();
          return editor?.action(getMarkdown());
        },
        getMilkdownCtx: () => {
          const editor = getInstance();
          if (!editor) return null;
          try {
            return editor.ctx;
          } catch {
            return null;
          }
        },
      }),
      [getInstance]
    );

    return <Milkdown />;
  }
);
CrepeEditor.displayName = "CrepeEditor";

export const MarkdownEditor = forwardRef<EditorHandle, EditorProps>((props, ref) => {
  return (
    <MilkdownProvider>
      <CrepeEditor ref={ref} {...props} />
    </MilkdownProvider>
  );
});
MarkdownEditor.displayName = "MarkdownEditor";
