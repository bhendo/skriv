import { test, expect } from "../fixtures";

test.describe("Editor rendering", () => {
  test("renders headings", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "# Heading One\n\n## Heading Two\n\n### Heading Three\n",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toContainText("Heading One");
    await expect(editor).toContainText("Heading Two");
    await expect(editor).toContainText("Heading Three");
    // Cursor-scoped fold behavior is covered in live-preview.spec.ts
  });

  test("renders inline formatting", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Prose first.\n\nThis is **bold** and *italic* and `inline code` text.\n",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toContainText("bold");
    await expect(editor).toContainText("italic");
    await expect(editor).toContainText("inline code");
  });

  test("renders list markers as bullets", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "- Apple\n- Banana\n- Cherry\n",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toContainText("Apple");
    await expect(editor).toContainText("Cherry");
    await expect(editor.locator(".cm-rendered-list-mark").first()).toBeAttached();
  });

  test("renders fenced code with syntax highlighting", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: '```js\nconsole.log("hello");\n```\n',
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toContainText('console.log("hello")');
    await expect(editor.locator(".cm-fenced-code-line-first")).toBeAttached();
  });

  test("renders blockquote with border styling", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "> This is a blockquote.\n",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toContainText("This is a blockquote.");
    await expect(editor.locator(".cm-blockquote-line").first()).toBeAttached();
  });

  test("renders horizontal rule as a widget", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Above the line.\n\n---\n\nBelow the line.\n",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor.locator(".cm-horizontal-rule-container")).toBeAttached();
  });

  test("loads file content when openedFile is set", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/my-doc.md",
      fileContent: "# My Document\n\nSome paragraph text here.\n",
    });
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toContainText("My Document");
    await expect(editor).toContainText("Some paragraph text here.");
  });

  test("shows placeholder ghost text when no file is opened", async ({ page, loadApp }) => {
    await loadApp();
    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor.locator(".cm-placeholder")).toBeVisible();
  });
});
