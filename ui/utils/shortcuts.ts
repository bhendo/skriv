import { isMacPlatform } from "./platform";

/**
 * Single source of truth for keyboard shortcuts (#78). Each entry defines a
 * chord once, in Tauri accelerator syntax: useKeyboardShortcuts matches
 * keydown events against bindings derived from `chord` (and `nonMacChord`),
 * useMenuEvents listens for the menu events derived from `menu`, tooltips
 * render via `displayChord`, and a parity test diffs `id`/`label`/`chord`
 * against the accelerator strings in src-tauri/src/menu.rs.
 *
 * Every binding implicitly requires the primary modifier (matched as
 * metaKey || ctrlKey).
 */

export interface KeyBinding {
  /** Matched against e.key.toLowerCase() (with Shift held, key can report uppercase). */
  key?: string;
  /** Matched against e.code instead, whenever the chord holds Alt (mac Alt+F rewrites e.key to "ƒ"). */
  code?: string;
  alt: boolean;
  shift: boolean;
  /** Restrict to mac (true) or non-mac (false); absent for all platforms. */
  mac?: boolean;
}

export interface ShortcutDef {
  id: string;
  /** For menu shortcuts, must match the menu.rs item label exactly (parity-tested). */
  label: string;
  /** Tauri accelerator syntax; for menu shortcuts, menu.rs must use this exact string (parity-tested). */
  chord: string;
  /** Extra non-mac chord where the convention differs (Ctrl+H for replace): both the displayed and the bound chord there. */
  nonMacChord?: string;
  /** "event": the menu.rs item emits `menu-${id}`; "native": handled in Rust. Absent: no menu item. */
  menu?: "event" | "native";
}

const REGISTRY = [
  {
    id: "new-window",
    label: "New Window",
    chord: "CmdOrCtrl+N",
    menu: "native",
  },
  {
    id: "open",
    label: "Open…",
    chord: "CmdOrCtrl+O",
    menu: "event",
  },
  {
    id: "save",
    label: "Save",
    chord: "CmdOrCtrl+S",
    menu: "event",
  },
  {
    id: "save-as",
    label: "Save As…",
    chord: "CmdOrCtrl+Shift+S",
    menu: "event",
  },
  {
    id: "find",
    label: "Find…",
    chord: "CmdOrCtrl+F",
    menu: "event",
  },
  {
    // Cmd+Alt+F is the macOS convention for replace (Cmd+H belongs to Hide);
    // Ctrl+H is the convention everywhere else.
    id: "replace",
    label: "Find and Replace…",
    chord: "CmdOrCtrl+Alt+F",
    nonMacChord: "Ctrl+H",
    menu: "event",
  },
  {
    id: "find-next",
    label: "Find Next",
    chord: "CmdOrCtrl+G",
  },
  {
    id: "find-prev",
    label: "Find Previous",
    chord: "CmdOrCtrl+Shift+G",
  },
  {
    id: "toggle-source-mode",
    label: "Toggle Source Mode",
    chord: "CmdOrCtrl+M",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    chord: "CmdOrCtrl+B",
    menu: "event",
  },
  {
    id: "toggle-outline",
    label: "Toggle Outline",
    chord: "CmdOrCtrl+Shift+L",
    menu: "event",
  },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof REGISTRY)[number]["id"];

/** Registry entry with its id narrowed to the known union. */
export type Shortcut = ShortcutDef & { id: ShortcutId };

/** The registry, widened so optional fields are accessible on every entry. */
export const SHORTCUTS: readonly Shortcut[] = REGISTRY;

/** One handler per shortcut; App passes the same map to both hooks. */
export type ShortcutHandlers = Record<ShortcutId, () => void>;

/** Shortcuts whose menu item emits an event for the frontend to handle. */
export const MENU_EVENT_SHORTCUTS = SHORTCUTS.filter((s) => s.menu === "event");

export function menuEventName(id: ShortcutId): string {
  return `menu-${id}`;
}

/**
 * Chord string → keydown matcher. When the chord holds Alt, the matcher uses
 * e.code: on mac hardware Alt rewrites e.key (Alt+F reports "ƒ"), so a
 * key-based matcher would silently never fire there.
 */
export function parseChord(chord: string): KeyBinding {
  const parts = chord.split("+");
  const letter = parts[parts.length - 1];
  const alt = parts.includes("Alt");
  return {
    ...(alt ? { code: `Key${letter.toUpperCase()}` } : { key: letter.toLowerCase() }),
    alt,
    shift: parts.includes("Shift"),
  };
}

/** A shortcut's keydown matchers: its chord, plus its non-mac chord where one exists. */
export function shortcutBindings(shortcut: Shortcut): readonly KeyBinding[] {
  const bindings = [parseChord(shortcut.chord)];
  if (shortcut.nonMacChord) {
    bindings.push({ ...parseChord(shortcut.nonMacChord), mac: false });
  }
  return bindings;
}

const ALL_BINDINGS: ReadonlyArray<{ id: ShortcutId; binding: KeyBinding }> = SHORTCUTS.flatMap(
  (s) => shortcutBindings(s).map((binding) => ({ id: s.id, binding }))
);

function matchesBinding(e: KeyboardEvent, key: string, b: KeyBinding): boolean {
  if (b.mac !== undefined && b.mac !== isMacPlatform()) return false;
  if (e.altKey !== b.alt || e.shiftKey !== b.shift) return false;
  return b.code !== undefined ? e.code === b.code : key === b.key;
}

/** The shortcut a keydown event invokes, or null (including when the primary modifier is absent). */
export function matchShortcut(e: KeyboardEvent): ShortcutId | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  const key = e.key.toLowerCase();
  for (const { id, binding } of ALL_BINDINGS) {
    if (matchesBinding(e, key, binding)) return id;
  }
  return null;
}

/** Chord for tooltips: mac symbols in the platform's ⌥⇧⌘ order, Ctrl+Shift+X text elsewhere. */
export function displayChord(id: ShortcutId): string {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  if (!shortcut) throw new Error(`Unknown shortcut: ${id}`);
  if (!isMacPlatform()) {
    return (shortcut.nonMacChord ?? shortcut.chord).replace("CmdOrCtrl", "Ctrl");
  }
  const parts = shortcut.chord.split("+");
  return (
    (parts.includes("Alt") ? "⌥" : "") +
    (parts.includes("Shift") ? "⇧" : "") +
    "⌘" +
    parts[parts.length - 1]
  );
}
