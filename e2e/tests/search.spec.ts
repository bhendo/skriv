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

  test("typing a query counts matches", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator(".search-bar input");
    await input.fill("hello");

    // Match count display
    const count = page.locator(".search-count");
    await expect(count).toContainText("1/3", { timeout: 3_000 });
  });

  test("next/prev navigation updates the match counter", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator(".search-bar input");
    await input.fill("hello");

    const count = page.locator(".search-count");
    await expect(count).toContainText("1/3", { timeout: 3_000 });

    await page.click("[aria-label='Next match']");
    await expect(count).toContainText("2/3");

    await page.click("[aria-label='Next match']");
    await expect(count).toContainText("3/3");

    // Wraps around
    await page.click("[aria-label='Next match']");
    await expect(count).toContainText("1/3");

    // Previous match keeps a valid position
    await page.click("[aria-label='Previous match']");
    await expect(count).toContainText("/3");
  });

  test("search with selected text pre-fills input", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
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

  test("matches are highlighted, active match marked after find next", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-bar input").fill("hello");

    await expect(page.locator(".skriv-search-match")).toHaveCount(3, { timeout: 3_000 });

    await page.click("[aria-label='Next match']");
    await expect(page.locator(".skriv-search-match-active")).toHaveCount(1);
  });

  test("Cmd+G / Cmd+Shift+G navigate matches", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-bar input").fill("hello");
    const count = page.locator(".search-count");
    await expect(count).toContainText("1/3", { timeout: 3_000 });

    await page.keyboard.press(`${MOD}+g`);
    await expect(count).toContainText("2/3");

    await page.keyboard.press(`${MOD}+Shift+g`);
    await expect(count).toContainText("/3");
  });

  test("Cmd+Alt+F opens search bar with the replace row", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+Alt+f`);
    await expect(page.locator(".search-bar")).toBeVisible({ timeout: 2_000 });
    await expect(page.locator("[placeholder='Replace...']")).toBeVisible();

    // Find input keeps focus so the query can be typed immediately
    await expect(page.locator("[placeholder='Find...']")).toBeFocused();
  });

  test("chevron toggles the replace row", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+f`);
    await expect(page.locator(".search-bar")).toBeVisible({ timeout: 2_000 });
    await expect(page.locator("[placeholder='Replace...']")).not.toBeVisible();

    await page.click("[aria-label='Toggle replace']");
    await expect(page.locator("[placeholder='Replace...']")).toBeVisible();

    await page.click("[aria-label='Toggle replace']");
    await expect(page.locator("[placeholder='Replace...']")).not.toBeVisible();
  });

  test("replace substitutes the current match and advances", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+Alt+f`);
    await page.locator("[placeholder='Find...']").fill("hello");
    await expect(page.locator(".search-count")).toContainText("/3", { timeout: 3_000 });
    await page.locator("[placeholder='Replace...']").fill("howdy");

    // First activation selects the match, second replaces it (CM semantics)
    await page.click("[aria-label='Replace']");
    await page.click("[aria-label='Replace']");

    await expect(page.locator(".search-count")).toContainText("/2");
    await expect(page.locator(".cm-content")).toContainText("howdy");
  });

  test("replace all substitutes every match", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+Alt+f`);
    await page.locator("[placeholder='Find...']").fill("hello");
    await expect(page.locator(".search-count")).toContainText("/3", { timeout: 3_000 });
    await page.locator("[placeholder='Replace...']").fill("goodbye");

    await page.click("[aria-label='Replace all']");

    await expect(page.locator(".search-count")).toContainText("No results");
    const text = await page.locator(".cm-content").innerText();
    expect(text).not.toContain("hello");
    expect((text.match(/goodbye/g) ?? []).length).toBe(3);
  });

  test("Escape closes the replace bar", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    await page.keyboard.press(`${MOD}+Alt+f`);
    await expect(page.locator(".search-bar")).toBeVisible({ timeout: 2_000 });

    await page.keyboard.press("Escape");
    await expect(page.locator(".search-bar")).not.toBeVisible();
  });

  test("search persists when switching to source mode", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: SEARCH_CONTENT,
    });

    // Open search in live preview
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
