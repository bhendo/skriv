import { test, expect, MOD, longDoc, headingLine } from "../fixtures";

const CONTENT = "# Hello\n\nA paragraph with **bold** text.\n";

test.describe("Source mode toggle (Cmd+M)", () => {
  test("Cmd+M switches to source mode (raw CodeMirror)", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await expect(page.locator(".live-preview-editor .cm-content")).toBeVisible();

    await page.keyboard.press(`${MOD}+m`);

    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".live-preview-editor")).toHaveCount(0);

    await expect(sourceCm).toContainText("# Hello");
    await expect(sourceCm).toContainText("**bold**");
  });

  test("Cmd+M toggles back to live preview and preserves content", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: CONTENT,
    });

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({
      timeout: 5_000,
    });

    await page.keyboard.press(`${MOD}+m`);

    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".source-editor")).toHaveCount(0);

    await expect(editor).toContainText("Hello");
    await expect(editor).toContainText("bold");
  });

  test("edits in source mode are preserved when toggling back", async ({ page, loadApp }) => {
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

    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(editor).toContainText("New Section");
    await expect(editor).toContainText("Hello");
  });
});

test.describe("Position preserved across mode toggle (#65)", () => {
  const PARAGRAPHS =
    "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";

  test("cursor survives a round trip and typing continues in place", async ({
    page,
    loadApp,
  }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: PARAGRAPHS });

    // Anchored regex: hasText is a case-insensitive substring match.
    await page
      .locator(".live-preview-editor .cm-line", { hasText: /^Second paragraph\.$/ })
      .click();
    await page.keyboard.press("End");

    await page.keyboard.press(`${MOD}+m`);
    const activeLine = page.locator(".source-editor .cm-activeLine");
    await expect(activeLine).toBeVisible({ timeout: 5_000 });
    await expect(activeLine).toHaveText("Second paragraph.");

    // Focus was restored too: type without clicking first.
    await page.keyboard.type(" Edited.");
    await expect(activeLine).toHaveText("Second paragraph. Edited.");

    await page.keyboard.press(`${MOD}+m`);
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 5_000 });

    await page.keyboard.type(" Again.");
    await expect(
      page.locator(".live-preview-editor .cm-line", {
        hasText: /^Second paragraph\. Edited\. Again\.$/,
      })
    ).toBeVisible();
  });

  test("scroll position is preserved without moving the cursor", async ({
    page,
    loadApp,
  }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: longDoc(8) });

    const lastLine = /^Paragraph 25 of section 8/;
    const preview = page.locator(".live-preview-editor .cm-scroller");
    await expect(preview).toBeVisible();
    // Scroll to the bottom without touching the cursor (it stays at offset 0).
    await preview.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.locator(".live-preview-editor .cm-line", { hasText: lastLine })).toBeInViewport();

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({ timeout: 5_000 });

    // Same content visible, not scrolled back to the top-of-document cursor.
    await expect(page.locator(".source-editor .cm-line", { hasText: lastLine })).toBeInViewport();
    await expect(
      page.locator(".source-editor .cm-line", { hasText: headingLine(1) })
    ).not.toBeInViewport();

    // The restore anchors the top visible line, and the modes fit different
    // numbers of lines per screen — so assert on that line, not the bottom.
    const topLineText = await page.locator(".source-editor .cm-scroller").evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      for (const line of el.querySelectorAll(".cm-line")) {
        const text = line.textContent ?? "";
        if (text.trim() && line.getBoundingClientRect().bottom > top + 1) return text;
      }
      return "";
    });
    expect(topLineText).not.toBe("");

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".live-preview-editor .cm-content")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator(".live-preview-editor .cm-line", { hasText: topLineText })
    ).toBeInViewport();
    await expect(
      page.locator(".live-preview-editor .cm-line", { hasText: headingLine(1) })
    ).not.toBeInViewport();
  });
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
