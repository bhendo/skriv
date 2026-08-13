import type { Page } from "@playwright/test";
import { test, expect, MOD, getMockWrites } from "../fixtures";

// The document is the markdown source, so the assertions go through the save
// mock: Cmd+S writes the exact buffer, indentation and markers included.
async function saveAndReadDoc(page: Page, previousWrites: number) {
  await page.keyboard.press(`${MOD}+s`);
  await expect
    .poll(() => getMockWrites(page).then((w) => w.length), { timeout: 5_000 })
    .toBeGreaterThan(previousWrites);
  const writes = await getMockWrites(page);
  return writes[writes.length - 1].content;
}

test.describe("List-aware Tab/Shift-Tab (#85)", () => {
  test("Tab nests and renumbers an ordered item; Shift-Tab restores it", async ({
    page,
    loadApp,
  }) => {
    const source = "1. one\n2. two\n3. three\n4. four\n";
    await loadApp({ openedFile: "/tmp/test.md", fileContent: source });
    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.getByText("three").click();

    await page.keyboard.press("Tab");
    expect(await saveAndReadDoc(page, 0)).toBe("1. one\n2. two\n   1. three\n3. four\n");

    await page.keyboard.press("Shift+Tab");
    expect(await saveAndReadDoc(page, 1)).toBe(source);
  });
});
