import type { KeyBinding } from "@codemirror/view";
import { prosemarkMarkdownFormattingKeymap } from "@prosemark/core";
import { insertLinkWithClipboard } from "./links";

/**
 * Re-bind an existing ProseMark binding under an additional key, carrying
 * every field (run, preventDefault, …). Loud on a miss: a ProseMark upgrade
 * that renames the source key should fail tests, not silently drop the alias.
 */
function aliasBinding(fromKey: string, toKey: string): KeyBinding[] {
  const source = prosemarkMarkdownFormattingKeymap.find((b) => b.key === fromKey);
  if (!source) {
    console.error(`ProseMark keymap no longer binds ${fromKey}; alias ${toKey} dropped`);
    return [];
  }
  return [{ ...source, key: toKey }];
}

/**
 * Skriv's established formatting shortcuts (#25) aliased onto ProseMark's
 * commands: Cmd+E toggles inline code (ProseMark binds Mod-`) and
 * Cmd+Alt+X toggles strikethrough (ProseMark binds Mod-Shift-x).
 */
export const formattingShortcutAliases: KeyBinding[] = [
  ...aliasBinding("Mod-`", "Mod-e"),
  ...aliasBinding("Mod-Shift-x", "Mod-Alt-x"),
];

/**
 * The live-preview markdown formatting keymap: ProseMark's bindings with
 * skriv's aliases, and Mod-k replaced by the clipboard-aware link insertion
 * (#56) instead of ProseMark's plain insertLink.
 */
export const livePreviewFormattingKeymap: KeyBinding[] = [
  { key: "Mod-k", run: insertLinkWithClipboard, preventDefault: true },
  ...formattingShortcutAliases,
  ...prosemarkMarkdownFormattingKeymap.filter((b) => b.key !== "Mod-k"),
];
