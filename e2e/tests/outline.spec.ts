import { test, expect, MOD } from "../fixtures";

const SHORT_DOC = "# One\n\nIntro text\n\n## Two\n\nMore text\n\n### Three\n";

// Anchored: hasText strings match case-insensitive substrings, which would
// also hit "…of section N…" paragraph lines. The optional "# " covers the
// syntax marks live preview reveals once the cursor lands on the heading.
function headingLine(n: number): RegExp {
  return new RegExp(`^(# )?Section ${n}$`);
}

function longDoc(sections: number): string {
  let doc = "";
  for (let i = 1; i <= sections; i++) {
    doc += `# Section ${i}\n\n`;
    for (let p = 1; p <= 25; p++) {
      doc += `Paragraph ${p} of section ${i}, long enough to make each section scroll.\n\n`;
    }
  }
  return doc;
}

test.describe("Outline", () => {
  test("lists headings in order with hierarchy indentation", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: SHORT_DOC });

    await page.getByRole("tab", { name: "Outline" }).click();

    const items = page.locator(".outline-item");
    await expect(items).toHaveText(["One", "Two", "Three"]);
    await expect(items.nth(0)).toHaveCSS("padding-left", "8px");
    await expect(items.nth(1)).toHaveCSS("padding-left", "20px");
    await expect(items.nth(2)).toHaveCSS("padding-left", "32px");
  });

  test("clicking a heading scrolls it into view, repeatedly", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: longDoc(8) });
    await page.getByRole("tab", { name: "Outline" }).click();

    await page.locator(".outline-item", { hasText: "Section 7" }).click();
    await expect(
      page.locator(".live-preview-editor .cm-line", { hasText: headingLine(7) })
    ).toBeInViewport();

    await page.locator(".outline-item", { hasText: "Section 2" }).click();
    await expect(
      page.locator(".live-preview-editor .cm-line", { hasText: headingLine(2) })
    ).toBeInViewport();

    await page.locator(".outline-item", { hasText: "Section 7" }).click();
    await expect(
      page.locator(".live-preview-editor .cm-line", { hasText: headingLine(7) })
    ).toBeInViewport();
  });

  test("updates as headings are typed", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: SHORT_DOC });
    await page.getByRole("tab", { name: "Outline" }).click();
    await expect(page.locator(".outline-item")).toHaveCount(3);

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    // Select-all then ArrowRight: cross-platform jump to the end of the doc
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type("\n## Brand New");

    await expect(page.locator(".outline-item", { hasText: "Brand New" })).toBeVisible();
    await expect(page.locator(".outline-item")).toHaveCount(4);
  });

  test("works in source mode", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: longDoc(6) });
    await page.getByRole("tab", { name: "Outline" }).click();

    await page.keyboard.press(`${MOD}+m`);
    await expect(page.locator(".source-editor .cm-content")).toBeVisible();

    await expect(page.locator(".outline-item")).toHaveCount(6);
    await page.locator(".outline-item", { hasText: "Section 5" }).click();
    await expect(
      page.locator(".source-editor .cm-line", { hasText: headingLine(5) })
    ).toBeInViewport();
  });

  test("scroll-spy highlights the section in view", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: longDoc(8) });
    await page.getByRole("tab", { name: "Outline" }).click();

    const active = page.locator(".outline-item[aria-current='true']");

    // Top of the document → first section
    await expect(active).toHaveText("Section 1");

    // Clicking a heading scrolls to it; the resulting scroll drives the highlight
    await page.locator(".outline-item", { hasText: "Section 5" }).click();
    await expect(active).toHaveText("Section 5");

    // Bottom of the document → last section, even if too short to reach the top
    await page.evaluate(() => {
      const scroller = document.querySelector(".cm-scroller");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    await expect(active).toHaveText("Section 8");
  });

  test("mod+shift+L cycles: show outline, then hide sidebar", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: SHORT_DOC });

    const sidebar = page.locator(".sidebar");
    const outlineTab = page.getByRole("tab", { name: "Outline" });
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole("tab", { name: "Files" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    // Visible on Files → switch to Outline
    await page.keyboard.press(`${MOD}+Shift+l`);
    await expect(outlineTab).toHaveAttribute("aria-selected", "true");

    // Visible on Outline → hide
    await page.keyboard.press(`${MOD}+Shift+l`);
    await expect(sidebar).toHaveCount(0);

    // Hidden → show on Outline
    await page.keyboard.press(`${MOD}+Shift+l`);
    await expect(sidebar).toBeVisible();
    await expect(outlineTab).toHaveAttribute("aria-selected", "true");
  });

  test("tab choice survives hiding and showing the sidebar", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/notes/doc.md", fileContent: SHORT_DOC });

    await page.getByRole("tab", { name: "Outline" }).click();
    await page.keyboard.press(`${MOD}+b`);
    await expect(page.locator(".sidebar")).toHaveCount(0);

    await page.keyboard.press(`${MOD}+b`);
    await expect(page.getByRole("tab", { name: "Outline" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.locator(".outline-item")).toHaveCount(3);
  });

  test("empty document shows the no-headings state", async ({ page, loadApp }) => {
    await loadApp();

    await page.getByRole("tab", { name: "Outline" }).click();

    await expect(page.locator(".sidebar").getByText("No headings")).toBeVisible();
  });
});
