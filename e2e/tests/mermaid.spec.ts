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

    // Mermaid block should be visible
    const mermaidBlock = editor.locator(".mermaid-block");
    await expect(mermaidBlock).toBeVisible({ timeout: 10_000 });

    // SVG should be rendered inside the wrapper
    const svg = editor.locator(".mermaid-svg-wrapper svg");
    await expect(svg).toBeVisible({ timeout: 10_000 });
  });

  test("mermaid SVG contains diagram nodes", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: MERMAID_CONTENT,
    });

    const editor = page.locator(".milkdown .editor");

    // Wait for the SVG to render
    const svgWrapper = editor.locator(".mermaid-svg-wrapper");
    await expect(svgWrapper.locator("svg")).toBeVisible({ timeout: 10_000 });

    // The SVG should contain text from the diagram definition
    await expect(svgWrapper).toContainText("Start");
    await expect(svgWrapper).toContainText("End");
  });

  test("non-mermaid code blocks render normally", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: JS_CODE_BLOCK,
    });

    const editor = page.locator(".milkdown .editor");

    // No mermaid block should exist
    await expect(editor.locator(".mermaid-block")).toHaveCount(0);

    // CodeMirror editor should be visible (Crepe renders code blocks via CodeMirror)
    const cmEditor = editor.locator(".cm-editor");
    await expect(cmEditor).toBeVisible();
  });
});
