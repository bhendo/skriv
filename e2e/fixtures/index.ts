import { test as base, expect, type Page } from "@playwright/test";
import { injectTauriMock, type TauriMockConfig } from "./tauri-mock";

export { expect };
export type { TauriMockConfig };

export const MOD = process.platform === "darwin" ? "Meta" : "Control";

/** Markdown doc of `sections` numbered sections, each tall enough to scroll. */
export function longDoc(sections: number): string {
  let doc = "";
  for (let i = 1; i <= sections; i++) {
    doc += `# Section ${i}\n\n`;
    for (let p = 1; p <= 25; p++) {
      doc += `Paragraph ${p} of section ${i}, long enough to make each section scroll.\n\n`;
    }
  }
  return doc;
}

// Anchored: hasText strings match case-insensitive substrings, which would
// also hit "…of section N…" paragraph lines. The optional "# " covers raw
// source-mode lines and the syntax marks live preview keeps in the DOM.
export function headingLine(n: number): RegExp {
  return new RegExp(`^(# )?Section ${n}$`);
}

export async function getMockWrites(
  page: Page,
): Promise<Array<{ path: string; content: string }>> {
  return page.evaluate(
    () =>
      ((window as Record<string, unknown>).__TAURI_MOCK_WRITES__ as Array<{
        path: string;
        content: string;
      }>) ?? [],
  );
}

export const test = base.extend<{
  loadApp: (config?: TauriMockConfig) => Promise<void>;
}>({
  loadApp: async ({ page }, use) => {
    const loadApp = async (config: TauriMockConfig = {}) => {
      await injectTauriMock(page, config);
      await page.goto("/");
      await page.waitForSelector(".live-preview-editor .cm-content", { timeout: 10_000 });
    };
    await use(loadApp);
  },
});
