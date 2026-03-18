import { useState, useEffect } from "react";

export type ThemeId = "classic" | "classic-dark";

const themeModules: Record<ThemeId, () => Promise<{ default: string }>> = {
  classic: () => import("@milkdown/crepe/theme/classic.css?inline"),
  "classic-dark": () => import("@milkdown/crepe/theme/classic-dark.css?inline"),
};

const STYLE_ID = "crepe-theme";

function getSystemTheme(): ThemeId {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "classic-dark" : "classic";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(getSystemTheme);

  // Follow system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? "classic-dark" : "classic");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Load and inject theme CSS
  useEffect(() => {
    themeModules[theme]().then((mod) => {
      let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
      }
      el.textContent = mod.default;
    });
  }, [theme]);

  return { theme };
}
