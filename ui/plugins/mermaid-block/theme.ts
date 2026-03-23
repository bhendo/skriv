const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

export interface MermaidThemeConfig {
  theme: "base";
  themeVariables: Record<string, string>;
}

function isDarkMode(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Build mermaid theme config using the 'base' theme with curated palettes.
 *
 * Uses theme: "base" because mermaid ignores themeVariables with "default"
 * or "dark" themes. The palettes are inspired by Crepe's warm brown/cream
 * tones but tuned for diagram readability and contrast.
 */
export function buildMermaidThemeConfig(): MermaidThemeConfig {
  const vars = isDarkMode()
    ? {
        // Dark palette — warm dark tones matching Crepe classic-dark
        background: "#1f1b16",
        primaryColor: "#3b342b",
        primaryTextColor: "#eae1d9",
        primaryBorderColor: "#9c8f80",
        secondaryColor: "#2a2520",
        secondaryTextColor: "#d3c4b4",
        secondaryBorderColor: "#9c8f80",
        tertiaryColor: "#332d25",
        lineColor: "#9c8f80",
        textColor: "#eae1d9",
        mainBkg: "#3b342b",
        nodeBorder: "#9c8f80",
        fontFamily: FONT_FAMILY,
      }
    : {
        // Light palette — warm cream tones matching Crepe classic
        background: "#fffdfb",
        primaryColor: "#fff1e5",
        primaryTextColor: "#1f1b16",
        primaryBorderColor: "#817567",
        secondaryColor: "#f9ecdf",
        secondaryTextColor: "#4f4539",
        secondaryBorderColor: "#817567",
        tertiaryColor: "#fff8f4",
        lineColor: "#817567",
        textColor: "#1f1b16",
        mainBkg: "#fff1e5",
        nodeBorder: "#817567",
        fontFamily: FONT_FAMILY,
      };

  return { theme: "base", themeVariables: vars };
}
