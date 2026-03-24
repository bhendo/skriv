import { test, expect } from "../fixtures";

test.describe("Editor rendering", () => {
  test("renders headings (h1, h2, h3)", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "# Heading One\n\n## Heading Two\n\n### Heading Three\n",
    });
    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator("h1")).toContainText("Heading One");
    await expect(editor.locator("h2")).toContainText("Heading Two");
    await expect(editor.locator("h3")).toContainText("Heading Three");
  });

  test("renders inline formatting (bold, italic, code)", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "This is **bold** and *italic* and `inline code` text.\n",
    });
    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator("strong")).toContainText("bold");
    await expect(editor.locator("em")).toContainText("italic");
    await expect(editor.locator("code")).toContainText("inline code");
  });

  test("renders unordered list (3 items)", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "- Apple\n- Banana\n- Cherry\n",
    });
    const editor = page.locator(".milkdown .editor");
    const listItems = editor.locator("ul .milkdown-list-item-block");
    await expect(listItems).toHaveCount(3);
    await expect(listItems.nth(0)).toContainText("Apple");
    await expect(listItems.nth(1)).toContainText("Banana");
    await expect(listItems.nth(2)).toContainText("Cherry");
  });

  test("renders ordered list (3 items)", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "1. First\n2. Second\n3. Third\n",
    });
    const editor = page.locator(".milkdown .editor");
    const listItems = editor.locator("ol .milkdown-list-item-block");
    await expect(listItems).toHaveCount(3);
    await expect(listItems.nth(0)).toContainText("First");
    await expect(listItems.nth(1)).toContainText("Second");
    await expect(listItems.nth(2)).toContainText("Third");
  });

  test("custom list items suppress native markers and keep tight block spacing", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "- First item\n- Second item\n",
    });

    const firstListItem = page
      .locator(".milkdown .editor .milkdown-list-item-block > .list-item")
      .first();
    await expect(firstListItem).toBeVisible();

    await expect(firstListItem).toHaveCSS("list-style-type", "none");
    await expect(firstListItem).toHaveCSS("display", "flex");

    const firstParagraph = firstListItem.locator(".children > p").first();
    await expect(firstParagraph).toHaveCSS("margin-top", "0px");
    await expect(firstParagraph).toHaveCSS("margin-bottom", "0px");
  });

  test("task list marker editor shows the full markdown prefix", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "- [ ] Todo\n- [x] Done\n",
    });

    const listItems = page.locator(".milkdown .editor .milkdown-list-item-block");

    await listItems.nth(0).locator(".children").click();
    await expect(listItems.nth(0).locator(".marker-input")).toHaveValue("- [ ]");
    const uncheckedWidth = await listItems
      .nth(0)
      .locator(".label-wrapper")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(uncheckedWidth).toBeGreaterThan(24);
    expect(uncheckedWidth).toBeLessThan(72);
    const uncheckedGap = await listItems.nth(0).evaluate((el) => {
      const label = el.querySelector(".label-wrapper");
      const children = el.querySelector(".children");
      if (!(label instanceof HTMLElement) || !(children instanceof HTMLElement)) {
        return null;
      }
      return children.getBoundingClientRect().left - label.getBoundingClientRect().right;
    });
    expect(uncheckedGap).not.toBeNull();
    expect(uncheckedGap!).toBeLessThanOrEqual(1);

    await listItems.nth(1).locator(".children").click();
    await expect(listItems.nth(1).locator(".marker-input")).toHaveValue("- [x]");
    const checkedWidth = await listItems
      .nth(1)
      .locator(".label-wrapper")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(checkedWidth).toBeGreaterThan(24);
    expect(checkedWidth).toBeLessThan(72);
  });

  test("ordered and numbered-task marker inputs have reasonable width", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Before\n\n1. Ordered\n",
    });

    // Click into the ordered item to enter editing mode
    const listItem = page.locator(".milkdown .editor .milkdown-list-item-block");
    await listItem.locator(".children").click();
    await expect(listItem.locator(".marker-input")).toHaveValue("1.");

    // Label wrapper should be wider than the 24px minimum but not excessively wide
    const wrapperWidth = await listItem
      .locator(".label-wrapper")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(wrapperWidth).toBeGreaterThan(24);
    expect(wrapperWidth).toBeLessThan(72);

    // Content should start close to the label (gap: 0 in editing mode)
    const gap = await listItem.evaluate((el) => {
      const label = el.querySelector(".label-wrapper");
      const children = el.querySelector(".children");
      if (!(label instanceof HTMLElement) || !(children instanceof HTMLElement)) return null;
      return children.getBoundingClientRect().left - label.getBoundingClientRect().right;
    });
    expect(gap).not.toBeNull();
    expect(gap!).toBeLessThanOrEqual(1);
  });

  test("clicking a task checkbox toggles the underlying markdown", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Before\n\n- [ ] Todo\n",
    });

    await page.locator(".milkdown .editor p").first().click();

    const taskCheckbox = page.locator(
      '.milkdown .editor .milkdown-list-item-block .label-wrapper[role="checkbox"]'
    );
    await expect(taskCheckbox).toHaveAttribute("aria-checked", "false");

    await taskCheckbox.click();
    await expect(taskCheckbox).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+m`);

    const sourceCm = page.locator(".source-editor .cm-editor");
    await expect(sourceCm).toBeVisible({ timeout: 5_000 });
    await expect(sourceCm).toContainText("- [x] Todo");
  });

  test("renders code block (CodeMirror)", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: '```js\nconsole.log("hello");\n```\n',
    });
    const editor = page.locator(".milkdown .editor");
    const cmEditor = editor.locator(".cm-editor");
    await expect(cmEditor).toBeVisible();
    await expect(cmEditor).toContainText('console.log("hello")');
  });

  test("renders blockquote", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "> This is a blockquote.\n",
    });
    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator("blockquote")).toContainText("This is a blockquote.");
  });

  test("renders horizontal rule", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Above the line.\n\n---\n\nBelow the line.\n",
    });
    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator("hr")).toBeVisible();
  });

  test("loads file content when openedFile is set", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/my-doc.md",
      fileContent: "# My Document\n\nSome paragraph text here.\n",
    });
    const editor = page.locator(".milkdown .editor");
    await expect(editor).toContainText("My Document");
    await expect(editor).toContainText("Some paragraph text here.");
  });

  test("shows placeholder when no file is opened", async ({ page, loadApp }) => {
    await loadApp();
    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator(".crepe-placeholder")).toBeVisible();
  });
});
