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

export type ShortcutGroup = "File" | "Search" | "View" | "Help";

export interface ShortcutDef {
  id: string;
  /** Cheatsheet section. */
  group: ShortcutGroup;
  /** For menu shortcuts, must match the menu.rs item label exactly (parity-tested). */
  label: string;
  /**
   * Tauri accelerator syntax; for menu shortcuts, menu.rs must use this exact
   * string (parity-tested). Absent for menu-only entries (checkbox items):
   * no keyboard binding, and the cheatsheet skips them.
   */
  chord?: string;
  /** Extra non-mac chord where the convention differs (Ctrl+H for replace): both the displayed and the bound chord there. */
  nonMacChord?: string;
  /** "event": the menu.rs item emits `menu-${id}`; "native": handled in Rust. Absent: no menu item. */
  menu?: "event" | "native";
}

const REGISTRY = [
  {
    id: "new-window",
    group: "File",
    label: "New Window",
    chord: "CmdOrCtrl+N",
    menu: "native",
  },
  {
    id: "open",
    group: "File",
    label: "Open…",
    chord: "CmdOrCtrl+O",
    menu: "event",
  },
  {
    id: "save",
    group: "File",
    label: "Save",
    chord: "CmdOrCtrl+S",
    menu: "event",
  },
  {
    id: "save-as",
    group: "File",
    label: "Save As…",
    chord: "CmdOrCtrl+Shift+S",
    menu: "event",
  },
  {
    // Menu-only checkbox (#2): auto-save has no chord anywhere (Typora,
    // VS Code); the on/off state lives in the File menu.
    id: "toggle-auto-save",
    group: "File",
    label: "Auto Save",
    menu: "event",
  },
  {
    id: "find",
    group: "Search",
    label: "Find…",
    chord: "CmdOrCtrl+F",
    menu: "event",
  },
  {
    // Cmd+Alt+F is the macOS convention for replace (Cmd+H belongs to Hide);
    // Ctrl+H is the convention everywhere else.
    id: "replace",
    group: "Search",
    label: "Find and Replace…",
    chord: "CmdOrCtrl+Alt+F",
    nonMacChord: "Ctrl+H",
    menu: "event",
  },
  {
    id: "find-next",
    group: "Search",
    label: "Find Next",
    chord: "CmdOrCtrl+G",
  },
  {
    id: "find-prev",
    group: "Search",
    label: "Find Previous",
    chord: "CmdOrCtrl+Shift+G",
  },
  {
    id: "toggle-source-mode",
    group: "View",
    label: "Toggle Source Mode",
    chord: "CmdOrCtrl+M",
  },
  {
    id: "toggle-sidebar",
    group: "View",
    label: "Toggle Sidebar",
    chord: "CmdOrCtrl+B",
    menu: "event",
  },
  {
    id: "toggle-outline",
    group: "View",
    label: "Toggle Outline",
    chord: "CmdOrCtrl+Shift+L",
    menu: "event",
  },
  {
    id: "keyboard-shortcuts",
    group: "Help",
    label: "Keyboard Shortcuts",
    chord: "CmdOrCtrl+/",
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
  if (shortcut.chord === undefined) return [];
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

/** Modifier parts + final key → mac symbols in the platform's ⌥⇧⌘ order, Ctrl+Alt+Shift+X text elsewhere. */
function displayParts(parts: readonly string[]): string {
  const key = parts[parts.length - 1].toUpperCase();
  const alt = parts.includes("Alt");
  const shift = parts.includes("Shift");
  if (isMacPlatform()) {
    return `${alt ? "⌥" : ""}${shift ? "⇧" : ""}⌘${key}`;
  }
  return ["Ctrl", alt && "Alt", shift && "Shift", key].filter(Boolean).join("+");
}

/** Chord for tooltips: mac symbols, Ctrl+Shift+X text elsewhere (honoring nonMacChord). */
export function displayChord(id: ShortcutId): string {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  if (!shortcut?.chord) throw new Error(`No chord to display for shortcut: ${id}`);
  const chord = isMacPlatform() ? shortcut.chord : (shortcut.nonMacChord ?? shortcut.chord);
  return displayParts(chord.split("+"));
}

/**
 * Display form of a CodeMirror keymap key ("Mod-Alt-x"), for shortcuts that
 * live in the editor keymap rather than the registry (Mod = Cmd or Ctrl,
 * like CmdOrCtrl in accelerator syntax).
 */
export function displayEditorChord(key: string): string {
  return displayParts(key.split("-"));
}
