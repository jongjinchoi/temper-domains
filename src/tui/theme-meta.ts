// Theme data is shared by the CLI and website without React, Ink or the mutable active theme.
export const THEME_META = [
  { key: "temper-forge", label: "Temper Forge", desc: "Fire × Iron" },
  { key: "seoul-night", label: "Seoul Night", desc: "Neon × Han River" },
  { key: "catppuccin-mocha", label: "Catppuccin Mocha", desc: "Soft pastels" },
  { key: "dracula", label: "Dracula", desc: "High contrast" },
  { key: "default", label: "Default", desc: "Classic terminal colors" },
  { key: "catppuccin-latte", label: "Catppuccin Latte", desc: "Pastel light" },
  { key: "rose-pine-dawn", label: "Rosé Pine Dawn", desc: "Warm natural light" },
] as const;

export type ThemeName = typeof THEME_META[number]["key"];


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
  lavender: string;
  peach: string;
  maroon: string;
  sapphire: string;
}

// Read-only source palettes; the CLI copies one into its active theme object.
export const THEME_PALETTES: Readonly<Record<ThemeName, Readonly<ThemePalette>>> = {
  "temper-forge": {
    base: "#1a1d23", text: "#e8e6e3", primary: "#ff7a45",
    green: "#64c896", red: "#e64545", yellow: "#ffbf47", blue: "#7a8fc4",
    dim: "#6b7280", border: "#4b5260", surface: "#2a2e36",
    lavender: "#9ba5c4", peach: "#ff9566", maroon: "#d66565", sapphire: "#6a9cc4",
  },
  "seoul-night": {
    base: "#14141f", text: "#e8e3f0", primary: "#ff4d8d",
    green: "#7ee787", red: "#ff5e62", yellow: "#ffb84d", blue: "#5b8cff",
    dim: "#5a5775", border: "#454563", surface: "#252538",
    lavender: "#a89eff", peach: "#ff8a5c", maroon: "#ff8aa5", sapphire: "#67b7ff",
  },
  "catppuccin-mocha": {
    base: "#1e1e2e", text: "#cdd6f4", primary: "#cba6f7",
    green: "#a6e3a1", red: "#f38ba8", yellow: "#f9e2af", blue: "#89b4fa",
    dim: "#6c7086", border: "#585b70", surface: "#313244",
    lavender: "#b4befe", peach: "#fab387", maroon: "#eba0ac", sapphire: "#74c7ec",
  },
  "dracula": {
    base: "#282a36", text: "#f8f8f2", primary: "#bd93f9",
    green: "#50fa7b", red: "#ff5555", yellow: "#f1fa8c", blue: "#6272a4",
    dim: "#6272a4", border: "#4e516e", surface: "#44475a",
    lavender: "#bd93f9", peach: "#ffb86c", maroon: "#ff79c6", sapphire: "#8be9fd",
  },
  "default": {
    base: "#000000", text: "#ffffff", primary: "#af87ff",
    green: "#00af00", red: "#ff0000", yellow: "#ffff00", blue: "#5f87ff",
    dim: "#666666", border: "#4e4e4e", surface: "#262626",
    lavender: "#af87ff", peach: "#ff8700", maroon: "#ff5f5f", sapphire: "#00afff",
  },
  "catppuccin-latte": {
    base: "#eff1f5", text: "#4c4f69", primary: "#8839ef",
    green: "#40a02b", red: "#d20f39", yellow: "#df8e1d", blue: "#1e66f5",
    dim: "#9ca0b0", border: "#acb0be", surface: "#ccd0da",
    lavender: "#7287fd", peach: "#fe640b", maroon: "#e64553", sapphire: "#209fb5",
  },
  "rose-pine-dawn": {
    base: "#faf4ed", text: "#464261", primary: "#907aa9",
    green: "#286983", red: "#b4637a", yellow: "#ea9d34", blue: "#56949f",
    dim: "#9893a5", border: "#cecacd", surface: "#f4ede8",
    lavender: "#907aa9", peach: "#ea9d34", maroon: "#b4637a", sapphire: "#56949f",
  },
};
