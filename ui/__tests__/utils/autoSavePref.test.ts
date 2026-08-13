import { describe, it, expect, beforeEach } from "vitest";
import { loadAutoSavePref, storeAutoSavePref } from "../../utils/autoSavePref";

describe("autoSavePref", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to on when nothing is stored", () => {
    expect(loadAutoSavePref()).toBe(true);
  });

  it("round-trips off and on", () => {
    storeAutoSavePref(false);
    expect(loadAutoSavePref()).toBe(false);

    storeAutoSavePref(true);
    expect(loadAutoSavePref()).toBe(true);
  });

  it('treats unknown stored values as on (only "0" disables)', () => {
    localStorage.setItem("skriv:auto-save", "banana");
    expect(loadAutoSavePref()).toBe(true);
  });
});
