import type { Command, KeyBinding } from "@codemirror/view";
import { prosemarkMarkdownFormattingKeymap } from "@prosemark/core";
import { insertLinkWithClipboard } from "./links";

export interface FormattingShortcut {
  /** Cheatsheet row name. */
  label: string;
  /** Every chord bound to the command, in cheatsheet display order. */
  keys: readonly string[];
  /** The ProseMark binding this command covers. */
  sourceKey: string;
  /** Replaces ProseMark's command (Mod-k's clipboard-aware link insertion, #56). */
  run?: Command;
}

/**
 * The editor's formatting shortcuts, declared once: the live-preview keymap
 * and the shortcut cheatsheet's Formatting section both derive from this
 * list. Keys beyond the source are skriv's established aliases (#25): Cmd+E
 * for inline code, Cmd+Alt+X for strikethrough. A parity test diffs
 * `sourceKey` against the ProseMark package in both directions, so an
 * upgrade that renames or adds bindings fails loudly instead of a binding
 * silently dropping out of the keymap.
 */
export const FORMATTING_SHORTCUTS: readonly FormattingShortcut[] = [
  { label: "Bold", keys: ["Mod-b"], sourceKey: "Mod-b" },
  { label: "Italic", keys: ["Mod-i"], sourceKey: "Mod-i" },
  { label: "Inline code", keys: ["Mod-e", "Mod-`"], sourceKey: "Mod-`" },
  { label: "Strikethrough", keys: ["Mod-Alt-x", "Mod-Shift-x"], sourceKey: "Mod-Shift-x" },
  { label: "Insert link", keys: ["Mod-k"], sourceKey: "Mod-k", run: insertLinkWithClipboard },
];

/**
 * A shortcut's bindings: skriv's `run` where one overrides, otherwise the
 * ProseMark source binding re-bound under each key (carrying every field —
 * run, preventDefault, …). Loud on a miss: a ProseMark upgrade that renames
 * the source key should fail tests, not silently drop the binding.
 */
function bindings(shortcut: FormattingShortcut): KeyBinding[] {
  if (shortcut.run) {
    const run = shortcut.run;
    return shortcut.keys.map((key) => ({ key, run, preventDefault: true }));
  }
  const source = prosemarkMarkdownFormattingKeymap.find((b) => b.key === shortcut.sourceKey);
  if (!source) {
    console.error(
      `ProseMark keymap no longer binds ${shortcut.sourceKey}; ${shortcut.label} dropped`
    );
    return [];
  }
  return shortcut.keys.map((key) => ({ ...source, key }));
}

/** The live-preview markdown formatting keymap, derived from FORMATTING_SHORTCUTS. */
export const livePreviewFormattingKeymap: KeyBinding[] = FORMATTING_SHORTCUTS.flatMap(bindings);
