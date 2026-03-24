import {
  test,
  expect,
  MOD,
  getComputedStyles,
  dumpStyleDiagnostics,
} from "../fixtures";

const MERMAID_CONTENT = `# Diagram Test

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`
`;

const JS_CODE_BLOCK = `# Code Test

\`\`\`js
console.log("hello");
\`\`\`
`;

/** Document with both block types for side-by-side style comparison. */
const BOTH_BLOCKS = `# Style Test

\`\`\`js
let a = 0;
\`\`\`

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`
`;

/** Style properties relevant to code block appearance. */
const CODE_BLOCK_STYLE_PROPS = [
  "background-color",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-radius",
  "color",
];

test.describe("Mermaid diagram rendering", () => {
  test("renders mermaid block as SVG", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator(".mermaid-block")).toBeVisible({
      timeout: 10_000,
    });
    await expect(editor.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mermaid SVG contains diagram nodes", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const svgWrapper = editor.locator(".mermaid-svg-wrapper");
    await expect(svgWrapper.locator("svg")).toBeVisible({ timeout: 10_000 });

    await expect(svgWrapper).toContainText("Start");
    await expect(svgWrapper).toContainText("End");
  });

  test("non-mermaid code blocks render normally", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: JS_CODE_BLOCK,
    });

    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator(".mermaid-block")).toHaveCount(0);
    await expect(editor.locator(".cm-editor")).toBeVisible();
  });
});

test.describe("Mermaid editor style consistency", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`mermaid edit-mode matches normal code block (${colorScheme} mode)`, async ({
      page,
      loadApp,
    }) => {
      await page.emulateMedia({ colorScheme });

      await loadApp({
        openedFile: "/tmp/test.md",
        fileContent: BOTH_BLOCKS,
      });

      const editor = page.locator(".milkdown .editor");

      // Wait for both blocks to render
      // Use :not(.mermaid-edit-container) to select only Crepe's native code block
      const codeBlock = editor.locator(
        ".milkdown-code-block:not(.mermaid-edit-container)",
      );
      await expect(codeBlock).toBeVisible({ timeout: 10_000 });
      const mermaidBlock = editor.locator(".mermaid-block");
      await expect(mermaidBlock).toBeVisible({ timeout: 10_000 });
      await expect(
        mermaidBlock.locator(".mermaid-svg-wrapper svg"),
      ).toBeVisible({ timeout: 10_000 });

      // --- Capture normal code block styles as the reference ---
      const codeBlockStyles = await getComputedStyles(
        codeBlock,
        CODE_BLOCK_STYLE_PROPS,
      );

      // --- Click mermaid diagram to enter edit mode ---
      await mermaidBlock.locator(".mermaid-svg-container").click();
      const editContainer = mermaidBlock.locator(".mermaid-edit-container");
      await expect(editContainer).toBeVisible({ timeout: 5_000 });
      const mermaidCmEditor = editContainer.locator(".cm-editor");
      await expect(mermaidCmEditor).toBeVisible({ timeout: 5_000 });

      // --- Capture mermaid edit container styles ---
      const mermaidContainerStyles = await getComputedStyles(
        editContainer,
        CODE_BLOCK_STYLE_PROPS,
      );

      // --- Dump diagnostics for debugging ---
      const codeDiag = await dumpStyleDiagnostics(
        codeBlock,
        CODE_BLOCK_STYLE_PROPS,
      );
      const mermaidDiag = await dumpStyleDiagnostics(
        editContainer,
        CODE_BLOCK_STYLE_PROPS,
      );

      console.log(`\n=== ${colorScheme.toUpperCase()} MODE ===`);
      console.log("--- Normal code block ---");
      console.log("Classes:", codeDiag.classes.join(" "));
      console.log("Styles:", JSON.stringify(codeDiag.styles, null, 2));

      console.log("--- Mermaid edit container ---");
      console.log("Classes:", mermaidDiag.classes.join(" "));
      console.log("Styles:", JSON.stringify(mermaidDiag.styles, null, 2));

      // --- Also dump the CM editor inside each for comparison ---
      const normalCmEditor = codeBlock.locator(".cm-editor");
      const normalCmStyles = await getComputedStyles(
        normalCmEditor,
        CODE_BLOCK_STYLE_PROPS,
      );
      const mermaidCmStyles = await getComputedStyles(
        mermaidCmEditor,
        CODE_BLOCK_STYLE_PROPS,
      );

      console.log("--- Normal .cm-editor ---");
      console.log("Styles:", JSON.stringify(normalCmStyles, null, 2));

      console.log("--- Mermaid .cm-editor ---");
      console.log("Styles:", JSON.stringify(mermaidCmStyles, null, 2));

      // --- Assertions: backgrounds must match ---
      expect(
        mermaidContainerStyles["background-color"],
        `[${colorScheme}] Mermaid edit container background should match code block. ` +
          `Expected: ${codeBlockStyles["background-color"]}, ` +
          `Got: ${mermaidContainerStyles["background-color"]}`,
      ).toBe(codeBlockStyles["background-color"]);

      expect(
        mermaidCmStyles["background-color"],
        `[${colorScheme}] Mermaid CM editor background should match normal CM editor. ` +
          `Expected: ${normalCmStyles["background-color"]}, ` +
          `Got: ${mermaidCmStyles["background-color"]}`,
      ).toBe(normalCmStyles["background-color"]);
    });
  }
});

test.describe("Mermaid editor commenting", () => {
  test("Cmd+/ toggles %% line comment in mermaid editor", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const mermaidBlock = editor.locator(".mermaid-block");
    await expect(mermaidBlock).toBeVisible({ timeout: 10_000 });
    await expect(
      mermaidBlock.locator(".mermaid-svg-wrapper svg"),
    ).toBeVisible({ timeout: 10_000 });

    // Enter edit mode
    await mermaidBlock.locator(".mermaid-svg-container").click();
    const mermaidCm = mermaidBlock.locator(".mermaid-edit-container .cm-editor");
    await expect(mermaidCm).toBeVisible({ timeout: 5_000 });

    // Place cursor on first line and toggle comment
    const cmContent = mermaidBlock.locator(".cm-content");
    await cmContent.click();
    await page.keyboard.press(`${MOD}+Home`);
    await page.keyboard.press(`${MOD}+/`);

    // First line should now be commented
    await expect(mermaidCm).toContainText("%% graph TD");

    // Toggle again to uncomment
    await page.keyboard.press(`${MOD}+/`);
    await expect(mermaidCm).not.toContainText("%% graph TD");
    await expect(mermaidCm).toContainText("graph TD");
  });
});

test.describe("Mermaid expand overlay", () => {
  test("inline toolbar appears on hover", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const mermaidBlock = editor.locator(".mermaid-block");
    await expect(mermaidBlock).toBeVisible({ timeout: 10_000 });
    await expect(mermaidBlock.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    const toolbar = mermaidBlock.locator(".mermaid-inline-toolbar");
    await expect(toolbar).toBeAttached();
    await expect(toolbar).toHaveCSS("opacity", "0");

    await mermaidBlock.locator(".mermaid-svg-container").hover();
    await expect(toolbar).toHaveCSS("opacity", "1");
  });

  test("clicking expand opens overlay, Esc closes it", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const mermaidBlock = editor.locator(".mermaid-block");
    await expect(mermaidBlock.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await mermaidBlock.locator(".mermaid-svg-container").hover();
    await mermaidBlock.locator(".mermaid-inline-toolbar button[aria-label='Expand diagram']").click();

    const overlay = page.locator(".mermaid-overlay");
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await expect(overlay.locator("svg")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(overlay).not.toBeVisible();
  });

  test("clicking backdrop closes overlay", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const mermaidBlock = editor.locator(".mermaid-block");
    await expect(mermaidBlock.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await mermaidBlock.locator(".mermaid-svg-container").hover();
    await mermaidBlock.locator(".mermaid-inline-toolbar button[aria-label='Expand diagram']").click();
    await expect(page.locator(".mermaid-overlay")).toBeVisible({
      timeout: 5_000,
    });

    await page.locator(".mermaid-overlay-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".mermaid-overlay")).not.toBeVisible();
  });

  test("close button in toolbar closes overlay", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const mermaidBlock = editor.locator(".mermaid-block");
    await expect(mermaidBlock.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await mermaidBlock.locator(".mermaid-svg-container").hover();
    await mermaidBlock.locator(".mermaid-inline-toolbar button[aria-label='Expand diagram']").click();
    await expect(page.locator(".mermaid-overlay")).toBeVisible({
      timeout: 5_000,
    });

    await page.locator('.mermaid-overlay-toolbar button[aria-label="Close"]').click();
    await expect(page.locator(".mermaid-overlay")).not.toBeVisible();
  });

  test("inline toolbar is hidden in edit mode", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const mermaidBlock = editor.locator(".mermaid-block");
    await expect(mermaidBlock.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await mermaidBlock.locator(".mermaid-svg-container").click();
    await expect(mermaidBlock.locator(".mermaid-edit-container")).toBeVisible({
      timeout: 5_000,
    });

    const toolbar = mermaidBlock.locator(".mermaid-inline-toolbar");
    await expect(toolbar).toBeHidden();
  });
});
