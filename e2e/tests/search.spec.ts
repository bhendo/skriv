import { test, expect, MOD } from "../fixtures";

const SEARCH_CONTENT = `# Document Title

This paragraph has the word hello in it.

Another paragraph also says hello here.

And a third hello for good measure.
`;

test.describe("Document search (Cmd+F)", () => {
  test("Cmd+F opens search bar, Escape closes it", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    const searchBar = page.locator(".search-bar");
    await expect(searchBar).toBeVisible({ timeout: 2_000 });

    // Input should be focused
    const input = searchBar.locator("input");
    await expect(input).toBeFocused();

    // Escape closes
    await page.keyboard.press("Escape");
    await expect(searchBar).not.toBeVisible();
  });

  test("typing a query highlights matches", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator(".search-bar input");
    await input.fill("hello");

    // Wait for highlights to appear
    const matches = page.locator(".search-match");
    await expect(matches).toHaveCount(3, { timeout: 3_000 });

    // Match count display
    const count = page.locator(".search-count");
    await expect(count).toContainText("1/3");
  });

  test("next/prev navigation moves active highlight", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator(".search-bar input");
    await input.fill("hello");
    await expect(page.locator(".search-match")).toHaveCount(3, {
      timeout: 3_000,
    });

    // First match is active
    const count = page.locator(".search-count");
    await expect(count).toContainText("1/3");

    // Navigate with next/prev buttons
    await page.click("[aria-label='Next match']");
    await expect(count).toContainText("2/3");

    await page.click("[aria-label='Next match']");
    await expect(count).toContainText("3/3");

    // Wraps around
    await page.click("[aria-label='Next match']");
    await expect(count).toContainText("1/3");

    // Previous match goes back
    await page.click("[aria-label='Previous match']");
    await expect(count).toContainText("3/3");
  });

  test("search with selected text pre-fills input", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const paragraph = editor.locator("p").first();
    await paragraph.click();
    await page.keyboard.press(`${MOD}+a`);

    // Now Cmd+F should pre-fill with selected text
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator(".search-bar input");
    const value = await input.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test("case sensitivity toggle changes match count", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "# Hello\n\nhello world Hello\n",
    });

    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-bar input").fill("hello");

    const count = page.locator(".search-count");
    // Case-insensitive: should find "Hello", "hello", "Hello" = 3 matches
    await expect(count).toContainText("/3", { timeout: 3_000 });

    // Toggle case sensitive
    await page.click("[aria-label='Case sensitive']");
    // Case-sensitive: should find only "hello" = 1 match
    await expect(count).toContainText("/1", { timeout: 3_000 });
  });

  test("search works in source mode", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    // Switch to source mode
    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({
      timeout: 5_000,
    });

    // Open search
    await page.keyboard.press(`${MOD}+f`);
    const searchBar = page.locator(".search-bar");
    await expect(searchBar).toBeVisible({ timeout: 2_000 });

    // Type query
    await page.locator(".search-bar input").fill("hello");

    // Should show matches
    const count = page.locator(".search-count");
    await expect(count).toContainText("/3", { timeout: 3_000 });
  });

  test("search persists when switching from WYSIWYG to source mode", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    // Open search in WYSIWYG mode
    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-bar input").fill("hello");
    await expect(page.locator(".search-count")).toContainText("/3", {
      timeout: 3_000,
    });

    // Switch to source mode
    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({
      timeout: 5_000,
    });

    // Search bar should still be open with the same query
    const searchBar = page.locator(".search-bar");
    await expect(searchBar).toBeVisible();
    const input = page.locator(".search-bar input");
    await expect(input).toHaveValue("hello");
  });
});
