import { test, expect, MOD } from "../fixtures";

test.describe("Formatting keyboard shortcuts", () => {
  test("Cmd+B toggles bold on selected text", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Select all text with keyboard (deterministic regardless of slowMo)
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+b`);

    await expect(editor.locator("strong")).toContainText("hello");
  });

  test("Cmd+I toggles italic on selected text", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+i`);

    await expect(editor.locator("em")).toContainText("hello");
  });

  test("typing text into the editor works", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "existing line\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("newly typed text");

    await expect(editor).toContainText("newly typed text");
  });
});
