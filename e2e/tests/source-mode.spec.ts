import { test, expect, MOD } from "../fixtures";

const CONTENT = "# Hello\n\nA paragraph with **bold** text.\n";

test.describe("Source mode toggle (Cmd+/)", () => {
  test("Cmd+/ switches to source mode (CodeMirror)", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await expect(page.locator(".milkdown .editor")).toBeVisible();

    await page.keyboard.press(`${MOD}+/`);

    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".milkdown")).toHaveCount(0);

    await expect(sourceCm).toContainText("# Hello");
    await expect(sourceCm).toContainText("**bold**");
  });

  test("Cmd+/ toggles back to WYSIWYG and preserves content", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await page.keyboard.press(`${MOD}+/`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({
      timeout: 5_000,
    });

    await page.keyboard.press(`${MOD}+/`);

    const milkdown = page.locator(".milkdown .editor");
    await expect(milkdown).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".source-editor")).toHaveCount(0);

    await expect(milkdown.locator("h1")).toContainText("Hello");
    await expect(milkdown.locator("strong")).toContainText("bold");
  });

  test("edits in source mode are preserved when toggling back", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await page.keyboard.press(`${MOD}+/`);
    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });

    const cmContent = page.locator(".source-editor .cm-content");
    await cmContent.click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.type("## New Section");
    await expect(sourceCm).toContainText("## New Section");

    await page.keyboard.press(`${MOD}+/`);

    const milkdown = page.locator(".milkdown .editor");
    await expect(milkdown).toBeVisible({ timeout: 5_000 });
    await expect(milkdown.locator("h2")).toContainText("New Section");
    await expect(milkdown.locator("h1")).toContainText("Hello");
  });
});
