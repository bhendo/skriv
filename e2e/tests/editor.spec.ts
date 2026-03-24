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
