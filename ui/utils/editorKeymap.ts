import { defaultKeymap } from "@codemirror/commands";
import { SHORTCUTS } from "./shortcuts";

/** A registry chord in CodeMirror key syntax: "CmdOrCtrl+Shift+S" → "Mod-Shift-s". */
function editorKey(chord: string): string {
  const parts = chord.replace("CmdOrCtrl", "Mod").split("+");
  parts[parts.length - 1] = parts[parts.length - 1].toLowerCase();
  return parts.join("-");
}

const reservedKeys = new Set(SHORTCUTS.map((s) => editorKey(s.chord)));

/**
 * CodeMirror's default keymap minus bindings on registry chords, which are
 * app-global: toggleComment (Mod-/) would otherwise claim the
 * shortcut-cheatsheet chord inside the editor, firing both. Derived from the
 * registry, so a future shortcut that collides with a CodeMirror default
 * frees its chord automatically. (searchKeymap chords are app-global too;
 * both editors exclude that keymap entirely.)
 */
export const appDefaultKeymap = defaultKeymap.filter(
  (b) => b.key === undefined || !reservedKeys.has(b.key)
);
