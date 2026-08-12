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

  test("partial scroll into a large table survives the granularity change", async ({
    page,
    loadApp,
  }) => {
    // A table is many raw lines in source mode but ONE fold-widget block in
    // live preview; a position-only anchor would snap to the table start.
    let doc = "# Title\n\nIntro paragraph.\n\n";
    doc += "| Col A | Col B | Col C |\n| --- | --- | --- |\n";
    for (let r = 1; r <= 30; r++) {
      doc += `| cell a${r} | cell b${r} | cell c${r} |\n`;
    }
    doc += "\n";
    for (let p = 1; p <= 20; p++) {
      doc += `Paragraph ${p} below the table.\n\n`;
    }
    await loadApp({ openedFile: "/tmp/table.md", fileContent: doc });

    // Cursor below the table so it folds in live preview.
    await page.locator(".live-preview-editor .cm-line", { hasText: /^Paragraph 3 below/ }).click();
    await page.keyboard.press("End");

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({ timeout: 5_000 });

    // Scroll so the viewport top is well inside the raw table.
    await page.locator(".source-editor .cm-scroller").evaluate((el) => {
      el.scrollTop = 400;
    });
    await expect(
      page.locator(".source-editor .cm-line", { hasText: /^\| cell a1 \|/ })
    ).not.toBeInViewport();

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".live-preview-editor .cm-content")).toBeVisible({ timeout: 5_000 });

    // The rendered table's top must sit well above the viewport top — the
    // partial scroll into the table carried over instead of snapping to its
    // start (which would put the widget top at ~0).
    await expect
      .poll(
        () =>
          page.locator(".live-preview-editor .cm-scroller").evaluate((el) => {
            const widget = el.querySelector(".cm-table-preview");
            if (!widget) return 0;
            return widget.getBoundingClientRect().top - el.getBoundingClientRect().top;
          }),
        { timeout: 5_000 }
      )
      .toBeLessThan(-100);

    // And back: the widget block expands to raw lines again, with the
    // viewport top landing in the mid-table area instead of snapping to
    // the first or last row.
    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-editor")).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(
        () =>
          page.locator(".source-editor .cm-scroller").evaluate((el) => {
            const top = el.getBoundingClientRect().top;
            for (const line of el.querySelectorAll(".cm-line")) {
              if (line.getBoundingClientRect().bottom > top + 1) {
                const match = /^\| cell a(\d+) \|/.exec(line.textContent ?? "");
                return match ? Number(match[1]) : -1;
              }
            }
            return -1;
          }),
        { timeout: 5_000 }
      )
      .toBeGreaterThan(4);
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
