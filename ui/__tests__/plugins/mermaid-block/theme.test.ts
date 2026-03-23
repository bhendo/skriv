import { describe, it, expect, vi } from "vitest";
import { buildMermaidThemeConfig } from "../../../plugins/mermaid-block/theme";

describe("buildMermaidThemeConfig", () => {
  it("always uses base theme", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() })
    );

    const config = buildMermaidThemeConfig();
    expect(config.theme).toBe("base");
    expect(config.themeVariables.fontFamily).toContain("apple-system");
  });

  it("uses light palette colors in light mode", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() })
    );

    const config = buildMermaidThemeConfig();
    expect(config.themeVariables.background).toBe("#fffdfb");
    expect(config.themeVariables.primaryColor).toBe("#fff1e5");
    expect(config.themeVariables.textColor).toBe("#1f1b16");
  });

  it("uses dark palette colors in dark mode", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() })
    );

    const config = buildMermaidThemeConfig();
    expect(config.themeVariables.background).toBe("#1f1b16");
    expect(config.themeVariables.primaryColor).toBe("#3b342b");
    expect(config.themeVariables.textColor).toBe("#eae1d9");
  });
});
