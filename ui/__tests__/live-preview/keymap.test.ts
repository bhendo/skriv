import { describe, it, expect } from "vitest";
import { prosemarkMarkdownFormattingKeymap } from "@prosemark/core";
import { FORMATTING_SHORTCUTS, livePreviewFormattingKeymap } from "../../live-preview/keymap";
import { insertLinkWithClipboard } from "../../live-preview/links";

describe("FORMATTING_SHORTCUTS", () => {
  it("covers the ProseMark formatting keymap exactly (parity, both directions)", () => {
    // If a ProseMark upgrade renames or adds bindings, this fails loudly
    // instead of the derived keymap silently dropping or missing a command.
    const sourceKeys = FORMATTING_SHORTCUTS.map((s) => s.sourceKey);
    const prosemarkKeys = prosemarkMarkdownFormattingKeymap.map((b) => b.key);
    expect(new Set(sourceKeys)).toEqual(new Set(prosemarkKeys));
  });

  it("keys follow the Mod grammar displayEditorChord assumes", () => {
    // displayEditorChord prints the primary modifier unconditionally; a
    // Mod-less key would render a phantom ⌘.
    for (const s of FORMATTING_SHORTCUTS) {
      for (const key of s.keys) {
        expect(key, `key of ${s.label}`).toMatch(/^Mod(-Alt)?(-Shift)?-.$/);
      }
    }
  });
});

describe("livePreviewFormattingKeymap", () => {
  it("binds every declared key exactly once", () => {
    const declared = FORMATTING_SHORTCUTS.flatMap((s) => s.keys);
    const bound = livePreviewFormattingKeymap.map((b) => b.key);
    expect([...bound].sort()).toEqual([...declared].sort());
    expect(new Set(bound).size).toBe(bound.length);
  });

  it("derives alias bindings from their ProseMark source command", () => {
    const source = prosemarkMarkdownFormattingKeymap.find((b) => b.key === "Mod-`");
    const alias = livePreviewFormattingKeymap.find((b) => b.key === "Mod-e");
    expect(source?.run).toBeDefined();
    expect(alias?.run).toBe(source?.run);
  });

  it("binds Mod-k to the clipboard-aware link command, not ProseMark's", () => {
    const modK = livePreviewFormattingKeymap.filter((b) => b.key === "Mod-k");
    expect(modK).toHaveLength(1);
    expect(modK[0].run).toBe(insertLinkWithClipboard);
  });
});
