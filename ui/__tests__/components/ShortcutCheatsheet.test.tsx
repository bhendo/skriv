import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutCheatsheet } from "../../components/ShortcutCheatsheet";
import { FORMATTING_SHORTCUTS } from "../../live-preview/keymap";
import { SHORTCUTS, displayChord } from "../../utils/shortcuts";
import { MAC_UA, stubPlatform } from "../mocks/shortcuts";

/** Every rendered row as { label, chords[] }, for exact-match assertions. */
function renderedRows(container: HTMLElement) {
  return [...container.querySelectorAll(".cheatsheet-row")].map((row) => ({
    label: row.querySelector(".cheatsheet-label")?.textContent,
    chords: [...row.querySelectorAll("kbd")].map((kbd) => kbd.textContent),
  }));
}

describe("ShortcutCheatsheet", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists every registry shortcut with its display chord", () => {
    stubPlatform(MAC_UA);
    const { container } = render(<ShortcutCheatsheet onClose={vi.fn()} />);

    const rows = renderedRows(container);
    for (const s of SHORTCUTS) {
      expect(rows, `row for ${s.id}`).toContainEqual({
        label: s.label.replace(/…$/, ""),
        chords: [displayChord(s.id)],
      });
    }
  });

  it("lists every formatting shortcut and nothing else", () => {
    stubPlatform(MAC_UA);
    const { container } = render(<ShortcutCheatsheet onClose={vi.fn()} />);

    const labels = renderedRows(container).map((r) => r.label);
    for (const f of FORMATTING_SHORTCUTS) {
      expect(labels).toContain(f.label);
    }
    // Registry rows + formatting rows account for the whole sheet.
    expect(labels).toHaveLength(SHORTCUTS.length + FORMATTING_SHORTCUTS.length);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ShortcutCheatsheet onClose={onClose} />);

    // The dialog takes focus on mount, so Escape lands inside it.
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click but not on panel click", async () => {
    const onClose = vi.fn();
    const { container } = render(<ShortcutCheatsheet onClose={onClose} />);

    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.querySelector(".cheatsheet-backdrop");
    if (!backdrop) throw new Error("backdrop missing");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes via the close button", async () => {
    const onClose = vi.fn();
    render(<ShortcutCheatsheet onClose={onClose} />);

    await userEvent.click(screen.getByLabelText("Close cheatsheet"));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
