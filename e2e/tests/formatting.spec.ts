import { test, expect, MOD } from "../fixtures";

test.describe("Formatting keyboard shortcuts", () => {
  const SHORTCUTS: Array<[key: string, expected: string]> = [
    ["b", "**hello**"],
    // ProseMark's toggleEmphasis uses underscore emphasis
    ["i", "_hello_"],
    // skriv aliases (#25) onto ProseMark's commands
    ["e", "`hello`"],
    ["Alt+x", "~~hello~~"],
  ];

  for (const [key, expected] of SHORTCUTS) {
    test(`Cmd+${key} wraps selection: ${expected}`, async ({ page, loadApp }) => {
      await loadApp({ openedFile: "/tmp/test.md", fileContent: "hello\n" });
      const editor = page.locator(".live-preview-editor .cm-content");
      await editor.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.press(`${MOD}+${key}`);
      await expect(editor).toContainText(expected);
    });
  }

  test("typing text into the editor works", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "existing line\n",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("newly typed text");
    await expect(editor).toContainText("newly typed text");
  });
});
