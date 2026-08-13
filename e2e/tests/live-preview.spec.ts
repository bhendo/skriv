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

test.describe("Live preview syntax folding", () => {
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

  test("renders task list checkboxes", async ({ page, loadApp }) => {
    await loadApp({ openedFile: "/tmp/test.md", fileContent: DOC });
    await expect(page.locator(".cm-content input[type=checkbox]")).toBeVisible();
  });

  test("cycles bullet glyphs by nesting depth, leaving task marks alone", async ({
    page,
    loadApp,
  }) => {
    const listDoc = [
      "# Lists",
      "",
      "- level one",
      "  - level two",
      "    - level three",
      "      - level four",
      "  - [ ] nested task",
      "",
    ].join("\n");
    await loadApp({ openedFile: "/tmp/test.md", fileContent: listDoc });

    // Cursor loads on the heading line, so every list mark below is folded.
    // The task item's mark is not: it renders a checkbox, not a glyph.
    await expect(page.locator(".cm-rendered-list-mark")).toHaveCount(4);
    const marks = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".cm-line"))
        .map((line) => ({
          glyph: line.querySelector(".cm-rendered-list-mark")?.textContent ?? null,
          text: line.textContent ?? "",
        }))
        .filter((mark) => mark.glyph !== null)
    );
    expect(marks.map((m) => m.glyph)).toEqual(["•", "◦", "▪", "•"]);
    expect(marks[0].text).toContain("level one");
    expect(marks[1].text).toContain("level two");
    expect(marks[2].text).toContain("level three");
    expect(marks[3].text).toContain("level four");

    const taskLine = page.locator(".cm-line", { hasText: "nested task" });
    await expect(taskLine.locator("input[type=checkbox]")).toBeVisible();
    await expect(taskLine.locator(".cm-rendered-list-mark")).toHaveCount(0);
  });

  test("saves the document byte-identical via Cmd+S", async ({ page, loadApp }) => {
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
});
