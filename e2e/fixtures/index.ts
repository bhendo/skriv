import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";
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

/**
 * Extract computed CSS property values from an element.
 * Returns a record of property names to their computed values.
 *
 * Usage:
 *   const styles = await getComputedStyles(locator, ['background-color', 'padding', 'font-size']);
 */
export async function getComputedStyles(
  locator: Locator,
  properties: string[],
): Promise<Record<string, string>> {
  return locator.evaluate((el, props) => {
    const computed = window.getComputedStyle(el);
    const result: Record<string, string> = {};
    for (const prop of props) {
      result[prop] = computed.getPropertyValue(prop);
    }
    return result;
  }, properties);
}

/**
 * Dump all style-related details about an element for debugging.
 * Returns computed styles, applied classes, and ancestor chain.
 */
export async function dumpStyleDiagnostics(
  locator: Locator,
  properties: string[],
): Promise<{
  tag: string;
  classes: string[];
  styles: Record<string, string>;
  ancestors: Array<{ tag: string; classes: string[] }>;
}> {
  return locator.evaluate(
    (el, props) => {
      const computed = window.getComputedStyle(el);
      const styles: Record<string, string> = {};
      for (const prop of props) {
        styles[prop] = computed.getPropertyValue(prop);
      }

      const ancestors: Array<{ tag: string; classes: string[] }> = [];
      let parent = el.parentElement;
      while (parent && ancestors.length < 10) {
        ancestors.push({
          tag: parent.tagName.toLowerCase(),
          classes: Array.from(parent.classList),
        });
        parent = parent.parentElement;
      }

      return {
        tag: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        styles,
        ancestors,
      };
    },
    properties,
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
