import { test, expect } from "../fixtures";

const MERMAID_CONTENT = `# Diagram Test

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`
`;

const JS_CODE_BLOCK = `# Code Test

\`\`\`js
console.log("hello");
\`\`\`
`;

test.describe("Mermaid diagram rendering", () => {
  test("renders mermaid block as SVG", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator(".mermaid-block")).toBeVisible({
      timeout: 10_000,
    });
    await expect(editor.locator(".mermaid-svg-wrapper svg")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mermaid SVG contains diagram nodes", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");
    const svgWrapper = editor.locator(".mermaid-svg-wrapper");
    await expect(svgWrapper.locator("svg")).toBeVisible({ timeout: 10_000 });

    await expect(svgWrapper).toContainText("Start");
    await expect(svgWrapper).toContainText("End");
  });

  test("non-mermaid code blocks render normally", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: JS_CODE_BLOCK,
    });

    const editor = page.locator(".milkdown .editor");
    await expect(editor.locator(".mermaid-block")).toHaveCount(0);
    await expect(editor.locator(".cm-editor")).toBeVisible();
  });
});
