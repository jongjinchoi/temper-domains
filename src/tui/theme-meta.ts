// Display metadata is shared without importing React, Ink or mutable palettes.
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
