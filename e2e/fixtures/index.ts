import { test as base, expect } from "@playwright/test";
import { injectTauriMock, type TauriMockConfig } from "./tauri-mock";

export { expect };
export type { TauriMockConfig };

export const test = base.extend<{
  loadApp: (config?: TauriMockConfig) => Promise<void>;
}>({
  loadApp: async ({ page }, use) => {
    const loadApp = async (config: TauriMockConfig = {}) => {
      await injectTauriMock(page, config);
      await page.goto("/");
      // Wait for Milkdown editor to mount
      await page.waitForSelector(".milkdown .editor", { timeout: 10_000 });
    };
    await use(loadApp);
  },
});
