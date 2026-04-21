import { ImageResponse } from "next/og";
import { DEFAULT_TLDS_COUNT, SITE_TITLE } from "@/lib/temper-data";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = SITE_TITLE;

// Satori needs TTF/OTF — jsdelivr mirrors Google Fonts in those formats.
const GROT_700 =
  "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-700-normal.ttf";
const MONO_400 =
  "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.ttf";
const MONO_700 =
  "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-700-normal.ttf";

const T_GLYPH_PATH =
  "M21.23 24.80L15.95 24.80Q15.09 24.80 14.55 24.25Q14.01 23.69 14.01 22.84L14.01 22.84L14.01 15.35L10.32 15.35L10.32 12.33L14.01 12.33L14.01 7.20L17.18 7.20L17.18 12.33L21.68 12.33L21.68 15.35L17.18 15.35L17.18 21.03Q17.18 21.78 17.86 21.78L17.86 21.78L21.23 21.78L21.23 24.80Z";

export default async function OpengraphImage() {
  const [grot, mono, monoBold] = await Promise.all([
    fetch(GROT_700).then((r) => r.arrayBuffer()),
    fetch(MONO_400).then((r) => r.arrayBuffer()),
    fetch(MONO_700).then((r) => r.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1a1612",
          color: "#f3ead3",
          display: "flex",
          flexDirection: "column",
          padding: "70px 80px",
          fontFamily: "Space Grotesk",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", transform: "rotate(-2deg)" }}>
            <svg width={80} height={80} viewBox="0 0 32 32">
              <rect width="32" height="32" rx="5" fill="#ff6a3a" />
              <path d={T_GLYPH_PATH} fill="#1a1612" />
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
            }}
          >
            <span style={{ fontSize: 64, fontWeight: 700 }}>temper</span>
            <span
              style={{
                color: "#9a8d75",
                fontSize: 22,
                fontFamily: "JetBrains Mono",
                fontWeight: 400,
              }}
            >
              / domains
            </span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            marginTop: 80,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            terminal-first
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#ff6a3a",
            }}
          >
            domain search.
          </div>
        </div>

        {/* Tagline with highlight */}
        <div
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "center",
            fontFamily: "JetBrains Mono",
            fontSize: 24,
            color: "#f3ead3",
          }}
        >
          <span
            style={{
              background: "#ff6a3a",
              color: "#1a1612",
              padding: "4px 12px",
              fontWeight: 700,
            }}
          >
            {DEFAULT_TLDS_COUNT} TLDs
          </span>
          <span style={{ marginLeft: 14 }}>
            · under 2 seconds · MCP-native for Claude and Cursor
          </span>
        </div>

        {/* Spacer pushes the terminal to the bottom */}
        <div style={{ display: "flex", marginTop: "auto" }} />

        {/* Terminal prompt — abstract, NO specific domain names */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: "JetBrains Mono",
            fontSize: 26,
            color: "#ffa370",
          }}
        >
          <span style={{ color: "#ff6a3a", fontWeight: 700 }}>&gt;</span>
          <span>temper search</span>
          <div
            style={{
              width: 14,
              height: 26,
              background: "#ffa370",
              marginLeft: 6,
            }}
          />
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
      fonts: [
        {
          name: "Space Grotesk",
          data: grot,
          weight: 700,
          style: "normal",
        },
        {
          name: "JetBrains Mono",
          data: mono,
          weight: 400,
          style: "normal",
        },
        {
          name: "JetBrains Mono",
          data: monoBold,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
