import { test, expect, MOD, getMockWrites } from "../fixtures";

const DOC = `# Heading

Some **bold** text.

| Name | Age |
| --- | ---: |
| Bob | 42 |

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`

- [ ] a task
`;

test.use({ livePreview: true });

test.describe("Live preview mode", () => {
  test("mounts the CodeMirror live-preview editor", async ({ page, loadApp }) => {
    await loadApp();
    await expect(page.locator(".live-preview-editor .cm-content")).toBeVisible();
    await expect(page.locator(".milkdown")).toHaveCount(0);
  });

  test("hides heading syntax until the cursor enters the line", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: DOC });

    const firstLine = page.locator(".cm-line").first();
    // Cursor on the heading line — no marks are hidden
    await firstLine.click();
    await expect(firstLine).toContainText("# Heading");
    await expect(firstLine.locator(".cm-hidden-token")).toHaveCount(0);

    // Cursor off the line — ProseMark hides the # mark (cm-hidden-token
    // collapses it via font-size: 0; the text stays in the DOM)
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(firstLine.locator(".cm-hidden-token")).not.toHaveCount(0);
  });

  test("renders GFM tables as a preview and unfolds on click", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: DOC });

    const preview = page.locator(".cm-table-preview");
    await expect(preview).toBeVisible();
    await expect(preview.locator("th").first()).toHaveText("Name");
    await expect(preview.locator("td").nth(1)).toHaveText("42");

    // Clicking the preview moves the cursor into the table, revealing source
    await preview.click();
    await expect(page.locator(".cm-table-preview")).toHaveCount(0);
    await expect(page.locator(".cm-content")).toContainText("| Name | Age |");
  });

  test("renders mermaid fences as SVG diagrams", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: DOC });

    const block = page.locator(".cm-mermaid-block");
    await expect(block).toBeVisible({ timeout: 10_000 });
    await expect(block.locator(".mermaid-svg-wrapper svg")).toBeVisible({ timeout: 10_000 });
  });

  test("renders task list checkboxes", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: DOC });
    await expect(page.locator(".cm-content input[type=checkbox]")).toBeVisible();
  });

  test("saves the document unchanged via Cmd+S", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: DOC });

    // Make an edit so the save has something to flush, then undo it
    await page.locator(".cm-content").click();
    await page.keyboard.type("x");
    await page.keyboard.press(`${MOD}+z`);

    await page.keyboard.press(`${MOD}+s`);
    await expect
      .poll(async () => (await getMockWrites(page)).length, { timeout: 5_000 })
      .toBeGreaterThan(0);

    const writes = await getMockWrites(page);
    expect(writes[writes.length - 1].content).toBe(DOC);
  });

  test("search works via the shared search bar", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: DOC });

    await page.locator(".cm-content").click();
    await page.keyboard.press(`${MOD}+f`);
    await page.locator(".search-input").fill("bold");
    await expect(page.locator(".search-count")).toContainText("1");
  });
});
