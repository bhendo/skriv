import { test, expect } from "../fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test.describe("Formatting keyboard shortcuts", () => {
  test("Cmd+B toggles bold on selected text", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello world\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Select the word "hello" using double-click
    const paragraph = editor.locator("p").first();
    await paragraph.dblclick();

    // Apply bold with Cmd+B
    await page.keyboard.press(`${MOD}+b`);

    // Verify <strong> element appears with the selected text
    await expect(editor.locator("strong")).toContainText("hello");
  });

  test("Cmd+I toggles italic on selected text", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "hello world\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Select the word "hello" using double-click
    const paragraph = editor.locator("p").first();
    await paragraph.dblclick();

    // Apply italic with Cmd+I
    await page.keyboard.press(`${MOD}+i`);

    // Verify <em> element appears with the selected text
    await expect(editor.locator("em")).toContainText("hello");
  });

  test("typing text into the editor works", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "existing line\n",
    });
    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Move to end of line and press Enter to create new line
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    // Type new text
    await page.keyboard.type("newly typed text");

    // Verify the new text appears
    await expect(editor).toContainText("newly typed text");
  });
});
