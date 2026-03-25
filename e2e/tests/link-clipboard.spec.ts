import { test, expect, MOD } from "../fixtures";

test.describe("Cmd+K clipboard auto-fill", () => {
  test("Cmd+K with clipboard URL and text selected wraps text in a link", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello\n",
      clipboardText: "https://example.com",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Select all text then trigger Cmd+K
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+k`);

    // Phase 2 fills URL but keeps link-source open for review
    await expect(editor.locator(".link-source")).toContainText(
      "[hello](https://example.com)",
      { timeout: 5_000 },
    );
  });

  test("Cmd+K with clipboard URL and no selection inserts link-source with URL", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello\n",
      clipboardText: "https://example.com",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Move cursor to end of line (no selection)
    await page.keyboard.press("End");
    await page.keyboard.press(`${MOD}+k`);

    // With no selection the link-source node stays visible with the URL filled in
    await expect(editor.locator(".link-source")).toContainText(
      "[](https://example.com)",
      { timeout: 5_000 },
    );
  });

  test("Cmd+K with non-URL clipboard text leaves empty parens", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello\n",
      clipboardText: "just plain text",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Select all text then trigger Cmd+K
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+k`);

    // Non-URL clipboard means fallback — link-source stays with empty parens
    await expect(editor.locator(".link-source")).toContainText("[hello]()", {
      timeout: 5_000,
    });
  });
});
