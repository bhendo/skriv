import { test, expect, MOD } from "../fixtures";

test.describe("Shortcut cheatsheet", () => {
  test("Mod+/ toggles the cheatsheet and Escape closes it", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: "Hello.\n" });

    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toHaveCount(0);

    await page.keyboard.press(`${MOD}+/`);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Save");
    await expect(dialog).toContainText("Bold");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // The same chord closes it again
    await page.keyboard.press(`${MOD}+/`);
    await expect(dialog).toBeVisible();
    await page.keyboard.press(`${MOD}+/`);
    await expect(dialog).toHaveCount(0);
  });

  test("Mod+/ in the editor opens the cheatsheet without toggling a comment", async ({
    page,
    loadApp,
  }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: "Hello.\n" });

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    await page.keyboard.press(`${MOD}+/`);

    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    // toggleComment is unbound: the document must not gain an HTML comment
    await expect(editor).not.toContainText("<!--");
  });
});
