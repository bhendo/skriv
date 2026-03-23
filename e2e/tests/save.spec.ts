import { test, expect } from "../fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test.describe("Save keyboard shortcuts", () => {
  test("Cmd+S triggers write_file with editor content", async ({
    page,
    loadApp,
  }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Hello world\n",
    });

    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Move to end and type additional text
    await page.keyboard.press("End");
    await page.keyboard.type(" extra text");

    // Verify the new text is in the editor
    await expect(editor).toContainText("extra text");

    // Press Cmd+S to save
    await page.keyboard.press(`${MOD}+s`);

    // Check that write_file was called with the content
    await expect
      .poll(
        async () => {
          const writes = await page.evaluate(
            () =>
              (window as Record<string, unknown>).__TAURI_MOCK_WRITES__ as
                | Array<{ path: string; content: string }>
                | undefined,
          );
          return writes?.length ?? 0;
        },
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0);

    const writes = await page.evaluate(
      () =>
        (window as Record<string, unknown>).__TAURI_MOCK_WRITES__ as Array<{
          path: string;
          content: string;
        }>,
    );

    expect(writes.length).toBeGreaterThan(0);
    const lastWrite = writes[writes.length - 1];
    expect(lastWrite.path).toBe("/tmp/test.md");
    expect(lastWrite.content).toContain("extra text");
  });

  test("Cmd+S with no file open does not crash", async ({
    page,
    loadApp,
  }) => {
    // Load with no openedFile — untitled document
    await loadApp();

    const editor = page.locator(".milkdown .editor");
    await editor.click();

    // Type some text so the editor has content
    await page.keyboard.type("some text");
    await expect(editor).toContainText("some text");

    // Press Cmd+S — triggers Save As, dialog mock returns null (cancelled)
    await page.keyboard.press(`${MOD}+s`);

    // Verify no writes occurred (dialog was cancelled)
    const writes = await page.evaluate(
      () =>
        (window as Record<string, unknown>).__TAURI_MOCK_WRITES__ as Array<{
          path: string;
          content: string;
        }>,
    );
    expect(writes).toHaveLength(0);

    // Verify the app is still functional — editor is visible and interactive
    await expect(editor).toBeVisible();
    await page.keyboard.type(" still works");
    await expect(editor).toContainText("still works");
  });
});
