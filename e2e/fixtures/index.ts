import { test as base, expect, type Page } from "@playwright/test";
import { injectTauriMock, type TauriMockConfig } from "./tauri-mock";

export { expect };
export type { TauriMockConfig };

export const MOD = process.platform === "darwin" ? "Meta" : "Control";

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
      await page.waitForSelector(".milkdown .editor", { timeout: 10_000 });
    };
    await use(loadApp);
  },
});
