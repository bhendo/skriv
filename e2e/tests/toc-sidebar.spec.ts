// e2e/tests/toc-sidebar.spec.ts
import { test, expect, MOD } from "../fixtures";

const TOC_CONTENT = `# Introduction

Some introductory text here.

## Background

Background information and context.

### Details

Detailed explanation of the background.

## Architecture

How the system is built.

## Conclusion

Final thoughts.
`;

test.describe("TOC Sidebar", () => {
  test("Cmd+Shift+L toggles sidebar open and closed", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: TOC_CONTENT,
    });

    // Sidebar should be closed by default
    const sidebar = page.locator(".toc-sidebar");
    await expect(sidebar).toHaveClass(/toc-sidebar--collapsed/);

    // Open via shortcut
    await page.keyboard.press(`${MOD}+Shift+l`);
    await expect(sidebar).not.toHaveClass(/toc-sidebar--collapsed/);

    // Close via shortcut
    await page.keyboard.press(`${MOD}+Shift+l`);
    await expect(sidebar).toHaveClass(/toc-sidebar--collapsed/);
  });

  test("expand button opens sidebar when collapsed", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: TOC_CONTENT,
    });

    const expandBtn = page.locator(".toc-expand-button");
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    const sidebar = page.locator(".toc-sidebar");
    await expect(sidebar).not.toHaveClass(/toc-sidebar--collapsed/);
  });

  test("sidebar displays headings with correct hierarchy", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: TOC_CONTENT,
    });

    await page.keyboard.press(`${MOD}+Shift+l`);

    const sidebar = page.locator(".toc-sidebar");
    await expect(sidebar.locator(".toc-sidebar__item")).toHaveCount(5, { timeout: 5_000 });

    // Check heading text
    const items = sidebar.locator(".toc-sidebar__item");
    await expect(items.nth(0)).toContainText("Introduction");
    await expect(items.nth(1)).toContainText("Background");
    await expect(items.nth(2)).toContainText("Details");
    await expect(items.nth(3)).toContainText("Architecture");
    await expect(items.nth(4)).toContainText("Conclusion");
  });

  test("clicking a TOC entry scrolls to that heading", async ({ page, loadApp }) => {
    // Use a long document so scrolling is needed
    const longContent = TOC_CONTENT + "\n\nLots of filler text.\n".repeat(50) + "\n## Far Away Section\n\nEnd.\n";
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: longContent,
    });

    await page.keyboard.press(`${MOD}+Shift+l`);

    // Wait for headings to populate
    const sidebar = page.locator(".toc-sidebar");
    await expect(sidebar.locator(".toc-sidebar__item")).not.toHaveCount(0, { timeout: 5_000 });

    // Click "Far Away Section"
    await sidebar.locator(".toc-sidebar__item", { hasText: "Far Away Section" }).click();

    // Wait briefly for rAF from scrollToHeading to fire
    await page.waitForTimeout(500);

    // Verify the heading is now visible within the scroll container.
    // The scroll container is the overflow:auto div inside .editor-column.
    // We poll until the heading's top is within the container's visible rect.
    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            // Find the scroll container: first overflow:auto child in .editor-column
            const editorColumn = document.querySelector(".editor-column") as HTMLElement | null;
            if (!editorColumn) return false;
            let container: HTMLElement | null = null;
            for (const child of Array.from(editorColumn.children)) {
              const s = window.getComputedStyle(child);
              if (s.overflow === "auto" || s.overflowY === "auto" || s.overflow === "scroll" || s.overflowY === "scroll") {
                container = child as HTMLElement;
                break;
              }
            }
            if (!container) return false;
            const heading = document.querySelector(".milkdown .editor h2#far-away-section") as HTMLElement | null;
            if (!heading) return false;
            const containerRect = container.getBoundingClientRect();
            const headingRect = heading.getBoundingClientRect();
            return headingRect.top >= containerRect.top && headingRect.top < containerRect.bottom;
          });
        },
        { timeout: 5_000 },
      )
      .toBe(true);
  });

  test("TOC updates when a new heading is added", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "# First Heading\n\nSome text.\n",
    });

    await page.keyboard.press(`${MOD}+Shift+l`);

    const sidebar = page.locator(".toc-sidebar");
    await expect(sidebar.locator(".toc-sidebar__item")).toHaveCount(1, { timeout: 5_000 });

    // Click at the end of the editor and type a new heading
    const editor = page.locator(".milkdown .editor");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## New Heading");

    // Sidebar should update
    await expect(sidebar.locator(".toc-sidebar__item")).toHaveCount(2, { timeout: 5_000 });
    await expect(sidebar.locator(".toc-sidebar__item").nth(1)).toContainText("New Heading");
  });

  test("TOC works in source mode", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: TOC_CONTENT,
    });

    // Switch to source mode
    await page.keyboard.press(`${MOD}+m`);
    await page.waitForSelector(".source-editor", { timeout: 5_000 });

    // Open sidebar
    await page.keyboard.press(`${MOD}+Shift+l`);

    const sidebar = page.locator(".toc-sidebar");
    await expect(sidebar.locator(".toc-sidebar__item")).toHaveCount(5, { timeout: 5_000 });
    await expect(sidebar.locator(".toc-sidebar__item").nth(0)).toContainText("Introduction");
  });

  test("click-to-navigate works in source mode", async ({ page, loadApp }) => {
    const longContent = TOC_CONTENT + "\n\nFiller text.\n".repeat(50) + "\n## Far Away Section\n\nEnd.\n";
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: longContent,
    });

    // Switch to source mode
    await page.keyboard.press(`${MOD}+m`);
    await page.waitForSelector(".source-editor", { timeout: 5_000 });

    // Open sidebar
    await page.keyboard.press(`${MOD}+Shift+l`);

    const sidebar = page.locator(".toc-sidebar");
    await expect(sidebar.locator(".toc-sidebar__item")).not.toHaveCount(0, { timeout: 5_000 });

    // Click "Far Away Section"
    await sidebar.locator(".toc-sidebar__item", { hasText: "Far Away Section" }).click();

    // Verify the cursor moved to the heading line
    const cmContent = page.locator(".source-editor .cm-content");
    await expect(cmContent).toContainText("Far Away Section");
  });
});
