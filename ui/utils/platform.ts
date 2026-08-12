/**
 * Single home for platform checks. Tauri's webview user agent names the OS on
 * every supported platform; a function (not a module constant) so tests can
 * stub the userAgent getter per test.
 */
export function isMacPlatform(): boolean {
  return navigator.userAgent.includes("Mac");
}
