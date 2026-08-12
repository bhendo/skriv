import { afterEach, describe, it, expect, vi } from "vitest";
// Vite ?raw import: the Rust menu source as a string, so parity is checked
// against what is actually compiled, not a copy.
import menuRs from "../../../src-tauri/src/menu.rs?raw";
import {
  SHORTCUTS,
  displayChord,
  menuEventName,
  parseChord,
  shortcutBindings,
  type KeyBinding,
} from "../../utils/shortcuts";
import { MAC_UA, WINDOWS_UA, stubPlatform } from "../mocks/shortcuts";

const CHORD_GRAMMAR = /^CmdOrCtrl(\+Alt)?(\+Shift)?\+[A-Z]$/;
const NON_MAC_CHORD_GRAMMAR = /^Ctrl(\+Alt)?(\+Shift)?\+[A-Z]$/;

/** The single letter a binding targets, whether it uses key or code. */
function boundLetter(b: KeyBinding): string {
  if (b.code !== undefined) return b.code.replace(/^Key/, "").toLowerCase();
  return b.key ?? "";
}

describe("shortcut registry invariants", () => {
  it("ids are unique", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chords follow the accelerator grammar", () => {
    for (const s of SHORTCUTS) {
      expect(s.chord, `chord of ${s.id}`).toMatch(CHORD_GRAMMAR);
      if (s.nonMacChord !== undefined) {
        expect(s.nonMacChord, `nonMacChord of ${s.id}`).toMatch(NON_MAC_CHORD_GRAMMAR);
      }
    }
  });

  it("no two derived bindings can match the same keydown", () => {
    const all = SHORTCUTS.flatMap((s) => shortcutBindings(s).map((b) => ({ id: s.id, b })));
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const { id: idA, b: a } = all[i];
        const { id: idB, b } = all[j];
        const collide =
          boundLetter(a) === boundLetter(b) &&
          a.alt === b.alt &&
          a.shift === b.shift &&
          // mac scopes overlap unless explicitly disjoint
          (a.mac === undefined || b.mac === undefined || a.mac === b.mac);
        expect(collide, `${idA} and ${idB} bind the same chord`).toBe(false);
      }
    }
  });
});

describe("binding derivation", () => {
  it("parses a plain chord into a key matcher", () => {
    expect(parseChord("CmdOrCtrl+Shift+G")).toEqual({ key: "g", alt: false, shift: true });
  });

  it("parses an Alt chord into a code matcher (Alt rewrites e.key on mac hardware)", () => {
    expect(parseChord("CmdOrCtrl+Alt+P")).toEqual({ code: "KeyP", alt: true, shift: false });
  });

  it("derives the non-mac binding from nonMacChord, so tooltip and behavior cannot drift", () => {
    const replace = SHORTCUTS.find((s) => s.id === "replace");
    if (!replace) throw new Error("replace shortcut missing");
    expect(shortcutBindings(replace)).toEqual([
      { code: "KeyF", alt: true, shift: false },
      { key: "h", alt: false, shift: false, mac: false },
    ]);
  });
});

describe("displayChord", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders mac symbols in ⌥⇧⌘ order", () => {
    stubPlatform(MAC_UA);
    expect(displayChord("find-next")).toBe("⌘G");
    expect(displayChord("find-prev")).toBe("⇧⌘G");
    expect(displayChord("save-as")).toBe("⇧⌘S");
    expect(displayChord("replace")).toBe("⌥⌘F");
  });

  it("renders Ctrl chords elsewhere", () => {
    stubPlatform(WINDOWS_UA);
    expect(displayChord("find-next")).toBe("Ctrl+G");
    expect(displayChord("find-prev")).toBe("Ctrl+Shift+G");
    expect(displayChord("save-as")).toBe("Ctrl+Shift+S");
  });

  it("uses the non-mac chord override where the convention differs", () => {
    stubPlatform(WINDOWS_UA);
    expect(displayChord("replace")).toBe("Ctrl+H");
  });
});

describe("menu.rs parity", () => {
  // let <var> = accel(MenuItemBuilder::with_id("id", "Label"), "Chord") —
  // rustfmt may split this across lines, so whitespace is flexible everywhere.
  const ACCEL_ITEM =
    /let\s+(\w+)\s*=\s*accel\(\s*MenuItemBuilder::with_id\(\s*"([^"]+)",\s*"([^"]+)",?\s*\)\s*,\s*"([^"]+)"\s*,?\s*\)/g;
  const EMIT = /"([\w-]+)"\s*=>\s*emit_to_focused\(\s*app,\s*"([\w-]+)",?\s*\)/g;
  // Every match arm id in on_menu_event (the file's only match statement).
  const MATCH_ARM = /"([\w-]+)"\s*=>/g;

  const menuItems = new Map<string, { varName: string; label: string; accelerator: string }>();
  for (const m of menuRs.matchAll(ACCEL_ITEM)) {
    menuItems.set(m[2], { varName: m[1], label: m[3], accelerator: m[4] });
  }
  const menuEmits = new Map<string, string>();
  for (const m of menuRs.matchAll(EMIT)) {
    menuEmits.set(m[1], m[2]);
  }
  const matchArmIds = new Set([...menuRs.matchAll(MATCH_ARM)].map((m) => m[1]));

  const menuShortcuts = SHORTCUTS.filter((s) => s.menu !== undefined);
  const eventShortcuts = SHORTCUTS.filter((s) => s.menu === "event");

  it("extracts menu items, emit mappings, and match arms (regex canary)", () => {
    // If menu.rs is restructured such that the patterns stop matching, fail
    // loudly here instead of vacuously passing the diffs below.
    expect(menuItems.size).toBeGreaterThan(0);
    expect(menuEmits.size).toBeGreaterThan(0);
    expect(matchArmIds.size).toBeGreaterThan(0);
  });

  it("every registry menu shortcut has a menu.rs item with the same label and accelerator", () => {
    for (const s of menuShortcuts) {
      const item = menuItems.get(s.id);
      if (!item) throw new Error(`menu.rs has no accelerated item "${s.id}"`);
      expect(item.label, `label of ${s.id}`).toBe(s.label);
      expect(item.accelerator, `accelerator of ${s.id}`).toBe(s.chord);
    }
  });

  it("every menu.rs item is attached to a submenu", () => {
    // Constructing an item without .item(&x) compiles and passes the other
    // checks, but the menu entry silently never appears.
    for (const [id, item] of menuItems) {
      expect(
        menuRs.includes(`.item(&${item.varName})`),
        `"${id}" is built but never attached`
      ).toBe(true);
    }
  });

  it("every menu.rs item is handled in on_menu_event", () => {
    // A forgotten arm falls into the catch-all: menu entry present, click
    // does nothing.
    for (const s of menuShortcuts) {
      expect(matchArmIds.has(s.id), `no on_menu_event arm for "${s.id}"`).toBe(true);
    }
  });

  it("every accelerated menu.rs item is in the registry", () => {
    const ids = new Set<string>(menuShortcuts.map((s) => s.id));
    for (const id of menuItems.keys()) {
      expect(ids.has(id), `menu.rs item "${id}" is not in the shortcut registry`).toBe(true);
    }
  });

  it("menu.rs emits exactly what useMenuEvents listens for, in both directions", () => {
    for (const s of eventShortcuts) {
      expect(menuEmits.get(s.id), `emit for ${s.id}`).toBe(menuEventName(s.id));
    }
    const known = new Set<string>(eventShortcuts.map((s) => s.id));
    for (const id of menuEmits.keys()) {
      expect(known.has(id), `menu.rs emits for "${id}", unknown to the registry`).toBe(true);
    }
  });

  it("native menu shortcuts emit no event", () => {
    for (const s of menuShortcuts.filter((s) => s.menu === "native")) {
      expect(menuEmits.has(s.id), `${s.id} should be handled in Rust, not emitted`).toBe(false);
    }
  });
});
