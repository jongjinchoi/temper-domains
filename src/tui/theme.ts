import { THEME_META, THEME_PALETTES, type ThemeName, type ThemePalette } from "./theme-meta.ts";
import type { DomainStatus } from "../checker/types.ts";

export const THEME_NAMES: string[] = THEME_META.map(theme => theme.key);

// Mutable theme object — setTheme() updates via Object.assign
// All components import { theme } and see the updated values
const defaultPalette = THEME_PALETTES["temper-forge"];
export const theme: ThemePalette = { ...defaultPalette } as ThemePalette;

export function setTheme(name: string) {
  Object.assign(theme, THEME_PALETTES[name as ThemeName] ?? THEME_PALETTES["temper-forge"]);
}

interface StatusStyle {
  icon: string;
  color: string;
}

export function getStatusStyle(status: DomainStatus): StatusStyle {
  const styles: Record<DomainStatus, StatusStyle> = {
    available: { icon: "✓", color: theme.green },
    taken: { icon: "✗", color: theme.red },
    premium: { icon: "◆", color: theme.peach },
    reserved: { icon: "◉", color: theme.sapphire },
    rate_limited: { icon: "⚠", color: theme.yellow },
    slow: { icon: "⚠", color: theme.yellow },
    error: { icon: "⚠", color: theme.yellow },
  };
  return styles[status];
}
