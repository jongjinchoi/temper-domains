interface Props {
  variant?: "flame" | "ink";
  size?: number;
  className?: string;
}

/**
 * temper brand mark — a rounded square tile containing a genuine
 * Space Mono 700 lowercase 't' rendered as SVG <text>. Falls back to
 * the system monospace only if Space Mono hasn't loaded (affects
 * first-paint of the favicon in some browsers; once the webfont is
 * cached the Nav render is exact).
 *
 *   variant="flame" → flame tile, paper glyph (primary, Nav + favicon)
 *   variant="ink"   → ink tile, cream glyph (monochrome backup)
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
      <text
        x="16"
        y="25"
        fill={fg}
        textAnchor="middle"
        style={{
          fontFamily:
            'var(--font-space-mono), "Space Mono", ui-monospace, Menlo, monospace',
          fontWeight: 700,
          fontSize: "26px",
        }}
      >
        t
      </text>
    </svg>
  );
}
