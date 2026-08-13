import type { Locator } from "@playwright/test";
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

// Renders ~1325px wide with the flowchart spacing config — wider than the
// editor pane at the default 1280px viewport (#83).
const WIDE_MERMAID_CONTENT = `# Wide Diagram Test

\`\`\`mermaid
flowchart LR
    A[Open document] --> B{Valid path?}
    B -->|Yes| C[Render live preview]
    B -->|No| D[Show error dialog]
    C --> E[Watch file for changes]
\`\`\`
`;

const INVALID_MERMAID_CONTENT = `# Broken Diagram Test

\`\`\`mermaid
flowchart LR
    A[unterminated --> B
\`\`\`
`;

/** True when `inner`'s visual bounding box sits inside `outer`'s (1px tolerance). */
async function isInside(inner: Locator, outer: Locator): Promise<boolean> {
  const innerBox = await inner.boundingBox();
  const outerBox = await outer.boundingBox();
  if (!innerBox || !outerBox) return false;
  return (
    innerBox.x >= outerBox.x - 1 &&
    innerBox.y >= outerBox.y - 1 &&
    innerBox.x + innerBox.width <= outerBox.x + outerBox.width + 1 &&
    innerBox.y + innerBox.height <= outerBox.y + outerBox.height + 1
  );
}

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

test.describe("Mermaid layout width (#83)", () => {
  test("wide flowchart scales to fit without inflating the content plane", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: WIDE_MERMAID_CONTENT,
    });

    const block = page.locator(".cm-mermaid-block");
    const svg = block.locator(".mermaid-svg-wrapper svg");
    const container = block.locator(".mermaid-svg-container");
    await expect(svg).toBeVisible({ timeout: 10_000 });

    // The SVG's natural width must stay out of layout flow: the content
    // plane keeps the pane width instead of overflowing horizontally.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scroller = document.querySelector(".cm-scroller")!;
          return scroller.scrollWidth - scroller.clientWidth;
        })
      )
      .toBeLessThanOrEqual(1);

    // Fit-to-width: the transformed SVG sits inside the container
    // (bounding boxes account for the pan/zoom CSS transform). Poll
    // because panzoom attaches a frame after the render resolves.
    await expect.poll(() => isInside(svg, container)).toBe(true);

    // Round-trip: cursor into the fence and back out re-creates the
    // widget from the SVG cache; it must still fit.
    await container.click();
    await expect(page.locator(".cm-mermaid-block")).toHaveCount(0);
    await page.locator(".cm-line").first().click();
    await expect(svg).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => isInside(svg, container)).toBe(true);
  });

  test("invalid source shows the error state fully visible", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: INVALID_MERMAID_CONTENT,
    });

    const block = page.locator(".cm-mermaid-block");
    const error = block.locator(".mermaid-error");
    const container = block.locator(".mermaid-svg-container");
    await expect(error).toBeVisible({ timeout: 10_000 });

    // The error stays in flow so it grows the container past its 60px
    // min-height instead of being clipped by overflow: hidden.
    const containerBox = await container.boundingBox();
    expect(containerBox).not.toBeNull();
    expect(containerBox!.height).toBeGreaterThan(60);
    expect(await isInside(error, container)).toBe(true);
  });
});
