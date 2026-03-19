import { forwardRef, useImperativeHandle } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { getMarkdown } from "@milkdown/utils";
import "@milkdown/crepe/theme/common/style.css";
import "../theme/skriv.css";

interface EditorProps {
  defaultValue: string;
  onChange?: (markdown: string) => void;
}

export interface EditorHandle {
  getMarkdown: () => string | undefined;
}

const CrepeEditor = forwardRef<EditorHandle, EditorProps>(({ defaultValue, onChange }, ref) => {
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
    [defaultValue]
  );

  const [loading, getInstance] = useInstance();

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      if (loading) return undefined;
      const editor = getInstance();
      return editor?.action(getMarkdown());
    },
  }));

  return <Milkdown />;
});
CrepeEditor.displayName = "CrepeEditor";

export const MarkdownEditor = forwardRef<EditorHandle, EditorProps>((props, ref) => {
  return (
    <MilkdownProvider>
      <CrepeEditor ref={ref} {...props} />
    </MilkdownProvider>
  );
});
MarkdownEditor.displayName = "MarkdownEditor";
