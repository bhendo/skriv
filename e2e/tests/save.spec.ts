import { test, expect, MOD, getMockWrites } from "../fixtures";

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

    await page.keyboard.press("End");
    await page.keyboard.type(" extra text");
    await expect(editor).toContainText("extra text");

    await page.keyboard.press(`${MOD}+s`);

    // Wait for the write to land
    await expect
      .poll(() => getMockWrites(page).then((w) => w.length), {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    const writes = await getMockWrites(page);
    const lastWrite = writes[writes.length - 1];
    expect(lastWrite.path).toBe("/tmp/test.md");
    expect(lastWrite.content).toContain("extra text");
  });

  test("Cmd+S with no file open does not crash", async ({
    page,
    loadApp,
  }) => {
    await loadApp();

    const editor = page.locator(".milkdown .editor");
    await editor.click();

    await page.keyboard.type("some text");
    await expect(editor).toContainText("some text");

    // Triggers Save As — dialog mock returns null (cancelled)
    await page.keyboard.press(`${MOD}+s`);

    const writes = await getMockWrites(page);
    expect(writes).toHaveLength(0);

    await expect(editor).toBeVisible();
    await page.keyboard.type(" still works");
    await expect(editor).toContainText("still works");
  });
});
