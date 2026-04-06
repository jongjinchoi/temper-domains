import type { DomainStatus } from "../checker/types";

export interface ThemePalette {
  base: string;
  text: string;
  primary: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;
  dim: string;
  border: string;
  surface: string;
}

const PALETTES: Record<string, ThemePalette> = {
  "temper-forge": {
    base: "#1a1d23", text: "#e8e6e3", primary: "#ff7a45",
    green: "#64c896", red: "#e64545", yellow: "#ffbf47", blue: "#7a8fc4",
    dim: "#6b7280", border: "#4b5260", surface: "#2a2e36",
  },
  "seoul-night": {
    base: "#14141f", text: "#e8e3f0", primary: "#ff4d8d",
    green: "#7ee787", red: "#ff5e62", yellow: "#ffb84d", blue: "#5b8cff",
    dim: "#5a5775", border: "#454563", surface: "#252538",
  },
  "catppuccin-mocha": {
    base: "#1e1e2e", text: "#cdd6f4", primary: "#cba6f7",
    green: "#a6e3a1", red: "#f38ba8", yellow: "#f9e2af", blue: "#89b4fa",
    dim: "#6c7086", border: "#585b70", surface: "#313244",
  },
  "dracula": {
    base: "#282a36", text: "#f8f8f2", primary: "#bd93f9",
    green: "#50fa7b", red: "#ff5555", yellow: "#f1fa8c", blue: "#6272a4",
    dim: "#6272a4", border: "#4e516e", surface: "#44475a",
  },
  "default": {
    base: "#000000", text: "#ffffff", primary: "#af87ff",
    green: "#00af00", red: "#ff0000", yellow: "#ffff00", blue: "#5f87ff",
    dim: "#666666", border: "#4e4e4e", surface: "#262626",
  },
};

export const THEME_NAMES = Object.keys(PALETTES);

// Mutable theme object — setTheme() updates via Object.assign
// All components import { theme } and see the updated values
export const theme: ThemePalette = { ...PALETTES["temper-forge"] };

export function setTheme(name: string) {
  Object.assign(theme, PALETTES[name] ?? PALETTES["temper-forge"]);
}

interface StatusStyle {
  icon: string;
  color: string;
}

export function getStatusStyle(status: DomainStatus): StatusStyle {
  const styles: Record<DomainStatus, StatusStyle> = {
    available: { icon: "✓", color: theme.green },
    taken: { icon: "✗", color: theme.red },
    premium: { icon: "✓", color: theme.yellow },
    reserved: { icon: "✗", color: theme.blue },
    rate_limited: { icon: "⚠", color: theme.yellow },
    slow: { icon: "⚠", color: theme.yellow },
    error: { icon: "✗", color: theme.red },
  };
  return styles[status];
}
