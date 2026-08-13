import { test, expect, MOD, getMockWrites, waitForWrite } from "../fixtures";

// Auto-save debounce is 1s (AUTO_SAVE_DEBOUNCE_MS); waitForWrite polls with a
// comfortable multiple so slow CI never flakes.

test.describe("Auto-save", () => {
  test("saves after typing stops, without Cmd+S", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Hello world\n",
    });

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" auto saved");
    await expect(editor).toContainText("auto saved");

    const writes = await waitForWrite(page);
    const lastWrite = writes[writes.length - 1];
    expect(lastWrite.path).toBe("/tmp/test.md");
    expect(lastWrite.content).toContain("auto saved");
  });

  test("does not save when the preference is off", async ({ page, loadApp }) => {
    // Registered before loadApp's goto, so it runs ahead of app code.
    await page.addInitScript(() => localStorage.setItem("skriv:auto-save", "0"));
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Hello world\n",
    });

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" not auto saved");
    await expect(editor).toContainText("not auto saved");

    // Well past the debounce interval: nothing may land on its own.
    await page.waitForTimeout(2_500);
    expect(await getMockWrites(page)).toHaveLength(0);

    // Manual save still works with the preference off.
    await page.keyboard.press(`${MOD}+s`);
    await waitForWrite(page, 5_000);
  });

  test("source mode survives an auto-save", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "# Title\n\nBody\n",
    });

    const livePreview = page.locator(".live-preview-editor .cm-content");
    await livePreview.click();
    await page.keyboard.press(`${MOD}+m`);

    const sourceEditor = page.locator(".source-editor .cm-content");
    await expect(sourceEditor).toBeVisible();

    await sourceEditor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited in source");

    const writes = await waitForWrite(page);
    expect(writes[writes.length - 1].content).toContain("edited in source");

    // The regression this guards: the save echo used to reset sourceMode,
    // remounting live preview and dropping the cursor mid-typing.
    await expect(sourceEditor).toBeVisible();
    await expect(page.locator(".live-preview-editor")).toHaveCount(0);

    // The buffer is still live for further edits.
    await page.keyboard.type(" and still typing");
    await expect(sourceEditor).toContainText("and still typing");
  });

  test("saves immediately on window blur", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/tmp/test.md",
      fileContent: "Hello world\n",
    });

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" blurred");
    await expect(editor).toContainText("blurred");

    // Simulate the native window losing focus. The write must land well
    // before the 1s debounce would have fired on its own.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));

    const writes = await waitForWrite(page, 500);
    expect(writes[writes.length - 1].content).toContain("blurred");
  });
});
