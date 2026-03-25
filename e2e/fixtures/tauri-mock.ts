import { type Page } from "@playwright/test";

/**
 * Mock responses keyed by Tauri command name.
 * Tests configure this before navigating.
 */
export interface TauriMockConfig {
  /** Response for get_opened_file — default: null (no file on launch) */
  openedFile?: string | null;
  /** Response for read_file — default: empty string */
  fileContent?: string;
  /** Response for get_file_info — default: basic file info */
  fileInfo?: { size: number; modified: number };
  /** Whether write_file should succeed — default: true */
  writeShouldSucceed?: boolean;
  /** Response for clipboard readText — default: "" (empty clipboard) */
  clipboardText?: string;
}

const DEFAULT_CONFIG: Required<TauriMockConfig> = {
  openedFile: null,
  fileContent: "",
  fileInfo: { size: 100, modified: 0 },
  writeShouldSucceed: true,
  clipboardText: "",
};

/**
 * Injects the Tauri mock into the page before app code loads.
 * Call this before page.goto().
 *
 * This mocks `window.__TAURI_INTERNALS__` and `window.__TAURI_EVENT_PLUGIN_INTERNALS__`
 * which are required by `@tauri-apps/api/core`, `@tauri-apps/api/event`,
 * `@tauri-apps/api/window`, and `@tauri-apps/plugin-dialog`.
 */
export async function injectTauriMock(
  page: Page,
  config: TauriMockConfig = {},
): Promise<void> {
  const merged = { ...DEFAULT_CONFIG, ...config };

  await page.addInitScript((cfg) => {
    const writes: Array<{ path: string; content: string }> = [];

    // Expose writes array so tests can read it
    (window as Record<string, unknown>).__TAURI_MOCK_WRITES__ = writes;

    // --- Callback system (mirrors @tauri-apps/api/mocks) ---
    const callbacks = new Map<number, (data: unknown) => void>();
    let nextEventId = 1;

    function transformCallback(
      callback?: (data: unknown) => void,
      once = false,
    ): number {
      const identifier = crypto.getRandomValues(new Uint32Array(1))[0];
      callbacks.set(identifier, (data: unknown) => {
        if (once) {
          callbacks.delete(identifier);
        }
        if (callback) callback(data);
      });
      return identifier;
    }

    function unregisterCallback(id: number) {
      callbacks.delete(id);
    }

    // --- Invoke handler ---
    async function invoke(
      cmd: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> {
      switch (cmd) {
        // App commands
        case "get_opened_file":
          return cfg.openedFile;

        case "read_file":
          return cfg.fileContent;

        case "get_file_info":
          return cfg.fileInfo;

        case "write_file": {
          if (!cfg.writeShouldSucceed) {
            throw new Error("Mock write failure");
          }
          writes.push({
            path: (args?.path as string) ?? "",
            content: (args?.content as string) ?? "",
          });
          return undefined;
        }

        case "write_new_file": {
          writes.push({
            path: (args?.path as string) ?? "",
            content: (args?.content as string) ?? "",
          });
          return undefined;
        }

        case "watch_file":
          return undefined;

        case "unwatch_file":
          return undefined;

        // Clipboard plugin
        case "plugin:clipboard-manager|read_text":
          return cfg.clipboardText;

        // Dialog plugin
        case "plugin:dialog|open":
          return null;

        case "plugin:dialog|save":
          return null;

        // Event plugin — listen returns an event ID
        case "plugin:event|listen":
          return nextEventId++;

        case "plugin:event|unlisten":
          return undefined;

        case "plugin:event|emit":
          return undefined;

        // Window plugin
        case "plugin:window|set_title":
          return undefined;

        case "plugin:window|title":
          return "Skriv";

        case "plugin:window|theme":
          return "light";

        case "plugin:window|get_all_windows":
          return [{ label: "main" }];

        case "plugin:window|scale_factor":
          return 1;

        case "plugin:window|inner_size":
          return { width: 1280, height: 720 };

        case "plugin:window|outer_size":
          return { width: 1280, height: 720 };

        case "plugin:window|is_fullscreen":
          return false;

        case "plugin:window|is_maximized":
          return false;

        case "plugin:window|is_focused":
          return true;

        case "plugin:window|is_visible":
          return true;

        case "plugin:window|create":
          return undefined;

        // Opener plugin
        case "plugin:opener|open_url":
          return undefined;

        case "plugin:opener|open_path":
          return undefined;

        default:
          console.warn(`[tauri-mock] unhandled command: ${cmd}`, args);
          return null;
      }
    }

    // --- Set up __TAURI_INTERNALS__ ---
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke,
      transformCallback,
      unregisterCallback,
      callbacks,
      convertFileSrc: (filePath: string, protocol = "asset") => {
        const path = encodeURIComponent(filePath);
        return `${protocol}://localhost/${path}`;
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
      },
    };

    // --- Set up __TAURI_EVENT_PLUGIN_INTERNALS__ ---
    (window as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, eventId: number) => {
        unregisterCallback(eventId);
      },
    };
  }, merged);
}
