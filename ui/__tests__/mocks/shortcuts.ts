import { vi, type Mock } from "vitest";
import { SHORTCUTS, type ShortcutHandlers, type ShortcutId } from "../../utils/shortcuts";

export const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
export const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

/** Point isMacPlatform at a fixed user agent for the current test (undone by vi.restoreAllMocks). */
export function stubPlatform(userAgent: string): void {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
}

/** A mock handler for every registry shortcut, typed so hooks take it without casts. */
export function makeShortcutHandlers(): ShortcutHandlers & Record<ShortcutId, Mock> {
  return Object.fromEntries(SHORTCUTS.map((s) => [s.id, vi.fn()])) as ShortcutHandlers &
    Record<ShortcutId, Mock>;
}
