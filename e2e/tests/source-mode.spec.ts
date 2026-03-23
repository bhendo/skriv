import { test, expect, MOD, getComputedStyles } from "../fixtures";

const CONTENT = "# Hello\n\nA paragraph with **bold** text.\n";

const CODE_BLOCK_CONTENT = `# Hello

\`\`\`js
let x = 1;
\`\`\`
`;

test.describe("Source mode toggle (Cmd+M)", () => {
  test("Cmd+M switches to source mode (CodeMirror)", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await expect(page.locator(".milkdown .editor")).toBeVisible();

    await page.keyboard.press(`${MOD}+m`);

    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".milkdown")).toHaveCount(0);

    await expect(sourceCm).toContainText("# Hello");
    await expect(sourceCm).toContainText("**bold**");
  });

  test("Cmd+M toggles back to WYSIWYG and preserves content", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({
      timeout: 5_000,
    });

    await page.keyboard.press(`${MOD}+m`);

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

    const milkdown = page.locator(".milkdown .editor");
    await expect(milkdown).toBeVisible({ timeout: 5_000 });
    await expect(milkdown.locator("h2")).toContainText("New Section");
    await expect(milkdown.locator("h1")).toContainText("Hello");
  });
});

const STYLE_PROPS = ["background-color", "color"];

test.describe("Source editor style consistency", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`source editor background matches code block (${colorScheme} mode)`, async ({
      page,
      loadApp,
    }) => {
      await page.emulateMedia({ colorScheme });

      await loadApp({
        openedFile: "/tmp/test.md",
        fileContent: CODE_BLOCK_CONTENT,
      });

      // Capture normal code block styles as reference
      const editor = page.locator(".milkdown .editor");
      const codeBlock = editor.locator(".milkdown-code-block");
      await expect(codeBlock).toBeVisible({ timeout: 10_000 });

      const codeBlockCm = codeBlock.locator(".cm-editor");
      const refStyles = await getComputedStyles(codeBlockCm, STYLE_PROPS);

      // Switch to source mode
      await page.keyboard.press(`${MOD}+m`);
      const sourceCm = page.locator(".source-editor .cm-editor");
      await expect(sourceCm).toBeVisible({ timeout: 5_000 });

      const sourceStyles = await getComputedStyles(sourceCm, STYLE_PROPS);

      console.log(
        `[${colorScheme}] code block .cm-editor:`,
        JSON.stringify(refStyles),
      );
      console.log(
        `[${colorScheme}] source .cm-editor:`,
        JSON.stringify(sourceStyles),
      );

      expect(
        sourceStyles["background-color"],
        `[${colorScheme}] Source editor background should match code block. ` +
          `Expected: ${refStyles["background-color"]}, ` +
          `Got: ${sourceStyles["background-color"]}`,
      ).toBe(refStyles["background-color"]);
    });
  }
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
