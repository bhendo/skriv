import { test, expect, MOD } from "../fixtures";

const CONTENT = "# Hello\n\nA paragraph with **bold** text.\n";

test.describe("Source mode toggle (Cmd+M)", () => {
  test("Cmd+M switches to source mode (raw CodeMirror)", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await expect(page.locator(".live-preview-editor .cm-content")).toBeVisible();

    await page.keyboard.press(`${MOD}+m`);

    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".live-preview-editor")).toHaveCount(0);

    await expect(sourceCm).toContainText("# Hello");
    await expect(sourceCm).toContainText("**bold**");
  });

  test("Cmd+M toggles back to live preview and preserves content", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({
      timeout: 5_000,
    });

    await page.keyboard.press(`${MOD}+m`);

    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".source-editor")).toHaveCount(0);

    await expect(editor).toContainText("Hello");
    await expect(editor).toContainText("bold");
  });

  test("edits in source mode are preserved when toggling back", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await page.keyboard.press(`${MOD}+m`);
    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });

    const cmContent = page.locator(".source-editor .cm-content");
    await cmContent.click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.type("## New Section");
    await expect(sourceCm).toContainText("## New Section");

    await page.keyboard.press(`${MOD}+m`);

    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(editor).toContainText("New Section");
    await expect(editor).toContainText("Hello");
  });
});

test.describe("Source editor features", () => {
  test("source editor shows line numbers", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await page.keyboard.press(`${MOD}+m`);
    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });

    const gutters = page.locator(".source-editor .cm-gutters");
    await expect(gutters).toBeVisible();
    const lineNumbers = page.locator(".source-editor .cm-lineNumbers");
    await expect(lineNumbers).toBeVisible();
  });
});
