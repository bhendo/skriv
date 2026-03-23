import { test, expect, MOD } from "../fixtures";

test.describe("Formatting keyboard shortcuts", () => {
  test("Cmd+B toggles bold on selected text", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello world\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    const paragraph = editor.locator("p").first();
    await paragraph.dblclick();
    await page.keyboard.press(`${MOD}+b`);

    await expect(editor.locator("strong")).toContainText("hello");
  });

  test("Cmd+I toggles italic on selected text", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello world\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    const paragraph = editor.locator("p").first();
    await paragraph.dblclick();
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
