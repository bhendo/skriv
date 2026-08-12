import { describe, it, expect } from "vitest";
import { defaultKeymap } from "@codemirror/commands";
import { appDefaultKeymap } from "../../utils/editorKeymap";

describe("appDefaultKeymap", () => {
  it("drops toggleComment's Mod-/, the shortcut-cheatsheet chord", () => {
    expect(defaultKeymap.some((b) => b.key === "Mod-/")).toBe(true);
    expect(appDefaultKeymap.some((b) => b.key === "Mod-/")).toBe(false);
  });

  it("keeps every other default binding", () => {
    // Canary: if this fails after a registry or CodeMirror change, a second
    // default binding started colliding with a registry chord — make sure
    // losing it in the editor is intended.
    expect(appDefaultKeymap).toHaveLength(defaultKeymap.length - 1);
  });
});
