// Renders icon.svg to a 1024px PNG, then regenerates every platform icon
// asset via `pnpm tauri icon`. Run with `make icon`.
//
// Playwright's Chromium does the rasterizing because the SVG leans on
// filters resvg (the renderer behind `tauri icon <svg>`) doesn't fully
// support: feTurbulence grain, the feComposite carve chain, and a
// mix-blend-mode overlay. Requires the e2e browser install:
// `pnpm exec playwright install chromium`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const iconsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(iconsDir, "..", "..");
const tmp = mkdtempSync(join(tmpdir(), "skriv-icon-"));
const out = join(tmp, "icon-1024.png");

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.goto("file://" + join(iconsDir, "icon.svg"));
  await page.screenshot({ path: out, omitBackground: true });
  await browser.close();

  execFileSync("pnpm", ["tauri", "icon", out], { stdio: "inherit", cwd: repoRoot });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
