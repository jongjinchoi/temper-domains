interface Props {
  variant?: "flame" | "ink";
  size?: number;
  className?: string;
}

/**
 * temper brand mark — a rounded square tile containing the Space Mono
 * Bold lowercase 't' glyph, extracted as an SVG path so the mark
 * renders identically whether or not the Space Mono webfont has
 * loaded. Path is 32×32 viewBox, glyph occupies ~55% of the height
 * (generous padding, matches the sketches).
 *
 *   variant="flame" → flame tile, paper glyph (primary, Nav + favicon)
 *   variant="ink"   → ink tile, cream glyph (monochrome backup)
 */
const T_PATH =
  "M21.23 24.80L15.95 24.80Q15.09 24.80 14.55 24.25Q14.01 23.69 14.01 22.84L14.01 22.84L14.01 15.35L10.32 15.35L10.32 12.33L14.01 12.33L14.01 7.20L17.18 7.20L17.18 12.33L21.68 12.33L21.68 15.35L17.18 15.35L17.18 21.03Q17.18 21.78 17.86 21.78L17.86 21.78L21.23 21.78L21.23 24.80Z";

export default function Monogram({
  variant = "flame",
  size = 26,
  className,
}: Props) {
  // flame tile uses the theme token so it brightens in dark mode;
  // foreground + ink variant stay fixed so the brand reads identically
  // in every context (README, print, inverted).
  const bg = variant === "flame" ? "var(--flame)" : "#1e1a1f";
  const fg = variant === "flame" ? "#faf3df" : "#f3ead3";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="5" fill={bg} />
      <path d={T_PATH} fill={fg} />
    </svg>
  );
}
