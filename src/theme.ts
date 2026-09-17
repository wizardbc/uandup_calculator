import { createContext, useEffect, useState } from "react";

export const THEMES = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["classic", "Classic"],
  ["high-contrast", "High contrast"],
] as const;
export type Theme = (typeof THEMES)[number][0];
const storageKey = "mathai.theme";
export function isTheme(value: unknown): value is Theme {
  return THEMES.some(([theme]) => theme === value);
}
export function initialThemePreference(): Theme | null {
  const requested = new URLSearchParams(location.search).get("theme");
  if (isTheme(requested)) return requested;
  try {
    const saved = localStorage.getItem(storageKey);
    if (isTheme(saved)) return saved;
  } catch {
    // Embedded browsers may disable storage. The calculator still works.
  }
  return null;
}
export function saveTheme(theme: Theme | null) {
  try {
    if (theme === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, theme);
  } catch {
    // Keep the selection for this session when storage is unavailable.
  }
}
export const ThemeContext = createContext<Theme>("classic");
export function useTheme() {
  const [preference, setPreference] = useState(initialThemePreference);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const theme: Theme = preference ?? (systemDark ? "dark" : "light");
  return {
    theme,
    followsSystem: preference === null,
    changeTheme: (next: Theme | null) => {
      setPreference(next);
      saveTheme(next);
    },
  };
}
export function graphPalette(theme: Theme) {
  if (theme === "classic")
    return {
      paper: "#fff",
      major: "#999",
      minor: "#e0e0e0",
      polar: "#bbb",
      ink: "#000",
      trace: "#000",
      traceOutline: "#fff",
    };
  if (theme === "dark")
    return {
      paper: "#111827",
      major: "#526078",
      minor: "#283448",
      polar: "#526078",
      ink: "#e7edf7",
      trace: "#fff",
      traceOutline: "#111827",
    };
  if (theme === "high-contrast")
    return {
      paper: "#05070a",
      major: "#8290a4",
      minor: "#364154",
      polar: "#8290a4",
      ink: "#fff",
      trace: "#ffe36b",
      traceOutline: "#000",
    };
  return {
    paper: "#fff",
    major: "#a7b2c4",
    minor: "#e2e8f0",
    polar: "#a7b2c4",
    ink: "#263850",
    trace: "#173f77",
    traceOutline: "#fff",
  };
}

// Preserve stored colors, adapting dark strokes only for visibility.
export function visiblePlotColor(color: string, theme: Theme): string {
  if (theme === "classic" || theme === "light") return color;
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (!match) return color;
  const hex =
    match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (values: number[]) =>
    values
      .map((v) => {
        const n = v / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  const paper =
    theme === "dark" ? luminance([17, 24, 39]) : luminance([5, 7, 10]);
  for (let step = 0; step <= 20; step++) {
    const mixed = rgb.map((v) => Math.round(v + ((255 - v) * step) / 20));
    const value = luminance(mixed);
    if ((Math.max(value, paper) + 0.05) / (Math.min(value, paper) + 0.05) >= 3)
      return step === 0
        ? color
        : `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return color;
}

// Choose the more legible symbol ink on a displayed plot-color swatch.
export function plotSymbolColor(color: string, theme: Theme): string {
  if (theme === "classic") return "#fff";
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(
    visiblePlotColor(color, theme),
  );
  if (!match) return "#fff";
  const hex =
    match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  const luminance = [0, 2, 4]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  return luminance > Math.sqrt(0.05 * 1.05) - 0.05 ? "#000" : "#fff";
}
