import { test, expect } from "../fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

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

    // Milkdown editor should be visible initially
    const milkdown = page.locator(".milkdown .editor");
    await expect(milkdown).toBeVisible();

    // Toggle to source mode
    await page.keyboard.press(`${MOD}+/`);

    // The standalone source editor's CodeMirror should appear
    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });

    // Milkdown should no longer be in the DOM
    await expect(page.locator(".milkdown")).toHaveCount(0);

    // Source editor should contain raw markdown syntax
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

    // Toggle to source mode
    await page.keyboard.press(`${MOD}+/`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({
      timeout: 5_000,
    });

    // Toggle back to WYSIWYG
    await page.keyboard.press(`${MOD}+/`);

    // Milkdown editor should return
    const milkdown = page.locator(".milkdown .editor");
    await expect(milkdown).toBeVisible({ timeout: 5_000 });

    // Source editor should be gone
    await expect(page.locator(".source-editor")).toHaveCount(0);

    // Content should be preserved — check rendered elements
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

    // Toggle to source mode
    await page.keyboard.press(`${MOD}+/`);
    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });

    // Click into the CodeMirror editor to focus it
    const cmContent = page.locator(".source-editor .cm-content");
    await cmContent.click();

    // Move to end of the document and add new text
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.type("## New Section");

    // Verify text was entered in source mode
    await expect(sourceCm).toContainText("## New Section");

    // Toggle back to WYSIWYG
    await page.keyboard.press(`${MOD}+/`);

    // Milkdown editor should return with the new content rendered
    const milkdown = page.locator(".milkdown .editor");
    await expect(milkdown).toBeVisible({ timeout: 5_000 });

    // The new heading should be rendered as h2
    await expect(milkdown.locator("h2")).toContainText("New Section");

    // Original content should still be there
    await expect(milkdown.locator("h1")).toContainText("Hello");
  });
});
