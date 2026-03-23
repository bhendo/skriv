import { test, expect } from "../fixtures";

test("editor loads and is interactive", async ({ page, loadApp }) => {
  await loadApp();
  const editor = page.locator(".milkdown .editor");
  await expect(editor).toBeVisible();
  // On fresh launch with no file, editor shows empty with Crepe placeholder
  await expect(editor.locator(".crepe-placeholder")).toBeVisible();
});

test("editor loads file content when file is provided", async ({
  page,
  loadApp,
}) => {
  await loadApp({
    openedFile: "/tmp/test.md",
    fileContent: "# Welcome to Skriv\n\nHello world.\n",
  });
  const editor = page.locator(".milkdown .editor");
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Welcome to Skriv");
});
