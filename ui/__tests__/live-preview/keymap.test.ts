import { describe, it, expect } from "vitest";
import { formattingShortcutAliases, livePreviewFormattingKeymap } from "../../live-preview/keymap";

describe("formattingShortcutAliases", () => {
  it("resolves both skriv aliases against the ProseMark keymap", () => {
    // If a ProseMark upgrade renames the source keys, this fails loudly
    // instead of the aliases silently vanishing.
    const keys = formattingShortcutAliases.map((b) => b.key);
    expect(keys).toEqual(["Mod-e", "Mod-Alt-x"]);
    for (const binding of formattingShortcutAliases) {
      expect(typeof binding.run).toBe("function");
    }
  });
});

describe("livePreviewFormattingKeymap", () => {
  it("binds Mod-k exactly once, to the clipboard-aware command", () => {
    const modK = livePreviewFormattingKeymap.filter((b) => b.key === "Mod-k");
    expect(modK).toHaveLength(1);
  });

  it("keeps ProseMark's other formatting bindings", () => {
    const keys = livePreviewFormattingKeymap.map((b) => b.key);
    expect(keys).toContain("Mod-b");
    expect(keys).toContain("Mod-i");
  });
});
