interface Props {
  variant?: "flame" | "ink";
  size?: number;
  className?: string;
}

/**
 * temper brand mark — a rounded square tile containing the Space Mono
 * Bold lowercase 't' glyph, extracted as an SVG path so the mark
 * renders identically whether or not the Space Mono webfont has
 * loaded. Path is 32×32 viewBox, glyph occupies ~72% of the height.
 *
 *   variant="flame" → flame tile, paper glyph (primary, Nav + favicon)
 *   variant="ink"   → ink tile, cream glyph (monochrome backup)
 */
const T_PATH =
  "M22.85 27.52L15.93 27.52Q14.82 27.52 14.11 26.80Q13.40 26.07 13.40 24.95L13.40 24.95L13.40 15.14L8.56 15.14L8.56 11.19L13.40 11.19L13.40 4.48L17.55 4.48L17.55 11.19L23.44 11.19L23.44 15.14L17.55 15.14L17.55 22.58Q17.55 23.57 18.44 23.57L18.44 23.57L22.85 23.57L22.85 27.52Z";

export default function Monogram({
  variant = "flame",
  size = 26,
  className,
}: Props) {
  const bg = variant === "flame" ? "#e8461a" : "#1e1a1f";
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
