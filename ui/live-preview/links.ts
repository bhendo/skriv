import type { KeyBinding } from "@codemirror/view";
import type { Command } from "@codemirror/view";
import { readClipboardUrl } from "../plugins/link-source/clipboard";

/**
 * Cmd+K link insertion with clipboard auto-fill (#56): wraps the selection
 * as a markdown link, filling the URL from the clipboard when it holds a
 * valid http(s) URL.
 *
 * Cursor placement mirrors the Milkdown implementation: with a selection,
 * the cursor lands at the end of the URL so the auto-filled value can be
 * reviewed; without one, it lands inside the brackets to type the link text.
 */
export const insertLinkWithClipboard: Command = (view) => {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const startDoc = view.state.doc;

  void readClipboardUrl().then((url) => {
    // The clipboard read is async; bail if the document changed under us.
    if (view.state.doc !== startDoc) return;

    const insert = `[${selected}](${url ?? ""})`;
    const anchor = selected ? from + insert.length - 1 : from + 1;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor },
      userEvent: "input",
    });
    view.focus();
  });

  return true;
};

/** Bind ahead of ProseMark's formatting keymap so this Mod-k wins. */
export const clipboardLinkKeyBinding: KeyBinding = {
  key: "Mod-k",
  run: insertLinkWithClipboard,
};
