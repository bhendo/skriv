import { test, expect, MOD, longDoc } from "../fixtures";
import type { Locator } from "@playwright/test";

const WIDTH = 1600;

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("editor not laid out");
  return b;
}

// #90: the scroll region spans the pane, not just the prose column — the
// scrollbar sits at the window edge and wheel/clicks in the margins reach
// the editor. The wide viewport gives the column side margins to hit.
test.describe("Scroll region spans the pane (#90)", () => {
  test.use({ viewport: { width: WIDTH, height: 900 } });

  test("scroller reaches the window edge; content column is centered", async ({
    page,
    loadApp,
  }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: longDoc(5) });

    const scrollerBox = await box(page.locator(".live-preview-editor .cm-scroller"));
    const contentBox = await box(page.locator(".live-preview-editor .cm-content"));

    // Scroller spans from the sidebar to the window's right edge.
    expect(scrollerBox.x + scrollerBox.width).toBeGreaterThanOrEqual(WIDTH - 1);
    // The prose column is narrower than the scroller and centered inside it.
    const leftMargin = contentBox.x - scrollerBox.x;
    const rightMargin = scrollerBox.x + scrollerBox.width - (contentBox.x + contentBox.width);
    expect(leftMargin).toBeGreaterThan(40);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(2);
  });

  test("margin gestures reach the editor: wheel, click, shift-click", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: longDoc(10) });

    const scroller = page.locator(".live-preview-editor .cm-scroller");
    const scrollerBox = await box(scroller);
    const contentBox = await box(page.locator(".live-preview-editor .cm-content"));

    // A point in the empty left margin, between pane edge and prose column.
    const marginX = scrollerBox.x + (contentBox.x - scrollerBox.x) / 2;
    const midY = scrollerBox.y + scrollerBox.height / 2;

    await page.mouse.move(marginX, midY);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.mouse.click(marginX, midY);
    await expect(page.locator(".live-preview-editor .cm-content")).toBeFocused();

    // Margin events are re-dispatched into CodeMirror's own mouse handling,
    // so gestures keep full semantics: shift-click extends the selection.
    await page.keyboard.down("Shift");
    await page.mouse.click(marginX, midY - 150);
    await page.keyboard.up("Shift");
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString().length ?? 0))
      .toBeGreaterThan(0);
  });

  test("source mode: full-width scroller with the gutter beside the column", async ({
    page,
    loadApp,
  }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: longDoc(5) });
    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({ timeout: 5_000 });

    const scrollerBox = await box(page.locator(".source-editor .cm-scroller"));
    const gutterBox = await box(page.locator(".source-editor .cm-gutters"));
    const contentBox = await box(page.locator(".source-editor .cm-content"));

    expect(scrollerBox.x + scrollerBox.width).toBeGreaterThanOrEqual(WIDTH - 1);
    // Gutter is pulled in beside the centered column, not pinned far left,
    // and sits flush against the content.
    expect(gutterBox.x).toBeGreaterThan(scrollerBox.x + 40);
    expect(Math.abs(gutterBox.x + gutterBox.width - contentBox.x)).toBeLessThan(2);
  });
});
