import { test, expect, MOD } from "../fixtures";

const FOLDER_FILES = [
  { name: "alpha.md", path: "/notes/alpha.md" },
  { name: "current.md", path: "/notes/current.md" },
];

test.describe("Sidebar", () => {
  test("lists folder files with the current file highlighted", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/notes/current.md",
      fileContent: "# Current\n",
      folderFiles: FOLDER_FILES,
    });

    const sidebar = page.locator(".sidebar");
    await expect(sidebar.getByRole("button", { name: "alpha.md" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "current.md" })).toHaveClass(/active/);
  });

  test("blank window shows recents only", async ({ page, loadApp }) => {
    await loadApp({
      recentFiles: ["/elsewhere/history.md"],
      folderFiles: FOLDER_FILES,
    });

    const sidebar = page.locator(".sidebar");
    await expect(sidebar.getByRole("button", { name: "history.md" })).toBeVisible();
    // No file open — the folder section must not render
    await expect(sidebar.getByRole("button", { name: "alpha.md" })).toHaveCount(0);
  });

  test("clicking a file opens it in place", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/notes/current.md",
      fileContents: {
        "/notes/current.md": "# Current\n",
        "/notes/alpha.md": "# Alpha\n",
      },
      folderFiles: FOLDER_FILES,
    });

    const editor = page.locator(".live-preview-editor .cm-content");
    await expect(editor).toContainText("Current");

    await page.locator(".sidebar").getByRole("button", { name: "alpha.md" }).click();

    await expect(editor).toContainText("Alpha");
  });

  test("dirty buffer + Cancel keeps the current document", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/notes/current.md",
      fileContents: {
        "/notes/current.md": "# Current\n",
        "/notes/alpha.md": "# Alpha\n",
      },
      folderFiles: FOLDER_FILES,
      messageResponse: "Cancel",
    });

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");
    await expect(editor).toContainText("edited");

    await page.locator(".sidebar").getByRole("button", { name: "alpha.md" }).click();

    // Cancel → still on the modified current document
    await expect(editor).toContainText("edited");
    await expect(editor).not.toContainText("Alpha");
  });

  test("dirty buffer + Don't Save replaces the document", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/notes/current.md",
      fileContents: {
        "/notes/current.md": "# Current\n",
        "/notes/alpha.md": "# Alpha\n",
      },
      folderFiles: FOLDER_FILES,
      messageResponse: "Don't Save",
    });

    const editor = page.locator(".live-preview-editor .cm-content");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");
    await expect(editor).toContainText("edited");

    await page.locator(".sidebar").getByRole("button", { name: "alpha.md" }).click();

    await expect(editor).toContainText("Alpha");
    await expect(editor).not.toContainText("edited");
  });

  test("mod+B toggles sidebar visibility", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/notes/current.md",
      fileContent: "# Current\n",
      folderFiles: FOLDER_FILES,
    });

    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();

    await page.keyboard.press(`${MOD}+b`);
    await expect(sidebar).toHaveCount(0);

    await page.keyboard.press(`${MOD}+b`);
    await expect(sidebar).toBeVisible();
  });

  test("on-screen button toggles sidebar visibility", async ({ page, loadApp }) => {
    await loadApp({
      openedFile: "/notes/current.md",
      fileContent: "# Current\n",
      folderFiles: FOLDER_FILES,
    });

    const sidebar = page.locator(".sidebar");
    const toggle = page.getByRole("button", { name: "Toggle sidebar" });
    await expect(sidebar).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await toggle.click();
    await expect(sidebar).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(sidebar).toBeVisible();
  });
});
