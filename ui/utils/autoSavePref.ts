/**
 * Auto-save preference, on by default. Lives in localStorage until the
 * settings view (#20) exists; read at decision time (not cached in React
 * state) so every window of the app follows a toggle immediately.
 */

const AUTO_SAVE_KEY = "skriv:auto-save";

export function loadAutoSavePref(): boolean {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) !== "0";
  } catch {
    // localStorage can throw in locked-down webviews; fail toward the default.
    return true;
  }
}

export function storeAutoSavePref(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, enabled ? "1" : "0");
  } catch {
    // Nothing to do: the toggle simply won't persist.
  }
}
