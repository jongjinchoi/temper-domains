interface Props {
  variant?: "flame" | "ink";
  size?: number;
  className?: string;
}

/**
 * temper brand mark — rounded square tile with a lowercase 't'.
 * Geometry approximates Space Mono 700 's' stem + crossbar so the
 * mark stays crisp at any pixel density without shipping a webfont.
 *
 * Two fills for reuse beyond the site (README, print, inverted contexts):
 *   - "flame" → flame square, paper 't'  (primary, used in Nav + favicon)
 *   - "ink"   → ink square, cream 't'    (monochrome fallback)
 */
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
      <rect x="12.5" y="3" width="7" height="26" fill={fg} />
      <rect x="4" y="9" width="24" height="4.5" fill={fg} />
    </svg>
  );
}
