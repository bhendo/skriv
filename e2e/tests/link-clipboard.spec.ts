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
    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();

    // Select all text then trigger Cmd+K
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+k`);

    // URL auto-filled; cursor stays at the URL end for review, so the raw
    // syntax remains visible
    await expect(editor).toContainText("[hello](https://example.com)", {
      timeout: 5_000,
    });
  });

  test("Cmd+K with clipboard URL and no selection inserts link syntax with URL", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello\n",
      clipboardText: "https://example.com",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();

    // Move cursor to end of line (no selection)
    await page.keyboard.press("End");
    await page.keyboard.press(`${MOD}+k`);

    await expect(editor).toContainText("hello[](https://example.com)", {
      timeout: 5_000,
    });
  });

  test("Cmd+K with non-URL clipboard text leaves empty parens", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello\n",
      clipboardText: "just plain text",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();

    // Select all text then trigger Cmd+K
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+k`);

    await expect(editor).toContainText("[hello]()", {
      timeout: 5_000,
    });
  });
});
