import { test, expect } from "../fixtures";

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

test.describe("Mermaid diagram rendering", () => {
  test("renders mermaid block as SVG", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const block = page.locator(".cm-mermaid-block");
    await expect(block).toBeVisible({ timeout: 10_000 });
    await expect(block.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mermaid SVG contains diagram nodes", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const svgWrapper = page.locator(".cm-mermaid-block .mermaid-svg-wrapper");
    await expect(svgWrapper.locator("svg")).toBeVisible({ timeout: 10_000 });

    await expect(svgWrapper).toContainText("Start");
    await expect(svgWrapper).toContainText("End");
  });

  test("non-mermaid code blocks render as plain fences", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: JS_CODE_BLOCK,
    });

    await expect(page.locator(".cm-mermaid-block")).toHaveCount(0);
    await expect(page.locator(".live-preview-editor .cm-content")).toContainText(
      'console.log("hello")'
    );
  });

  test("clicking the diagram reveals the fence source", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const block = page.locator(".cm-mermaid-block");
    await expect(block.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await block.locator(".mermaid-svg-container").click();

    // The widget unfolds to the raw fence for editing
    await expect(page.locator(".cm-mermaid-block")).toHaveCount(0);
    await expect(page.locator(".live-preview-editor .cm-content")).toContainText("graph TD");
  });
});

test.describe("Mermaid expand overlay", () => {
  test("inline toolbar appears on hover", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const block = page.locator(".cm-mermaid-block");
    await expect(block.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    const toolbar = block.locator(".mermaid-inline-toolbar");
    await expect(toolbar).toBeAttached();
    await expect(toolbar).toHaveCSS("opacity", "0");

    await block.locator(".mermaid-svg-container").hover();
    await expect(toolbar).toHaveCSS("opacity", "1");
  });

  test("clicking expand opens overlay, Esc closes it", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const block = page.locator(".cm-mermaid-block");
    await expect(block.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await block.locator(".mermaid-svg-container").hover();
    await block.locator(".mermaid-inline-toolbar button[aria-label='Expand diagram']").click();

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

    const block = page.locator(".cm-mermaid-block");
    await expect(block.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await block.locator(".mermaid-svg-container").hover();
    await block.locator(".mermaid-inline-toolbar button[aria-label='Expand diagram']").click();
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

    const block = page.locator(".cm-mermaid-block");
    await expect(block.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });

    await block.locator(".mermaid-svg-container").hover();
    await block.locator(".mermaid-inline-toolbar button[aria-label='Expand diagram']").click();
    await expect(page.locator(".mermaid-overlay")).toBeVisible({
      timeout: 5_000,
    });

    await page.locator('.mermaid-overlay-toolbar button[aria-label="Close"]').click();
    await expect(page.locator(".mermaid-overlay")).not.toBeVisible();
  });
});
