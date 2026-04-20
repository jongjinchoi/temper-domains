import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Space_Grotesk, VT323 } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

const retro = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-retro",
  display: "swap",
});

const grot = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-grot",
  display: "swap",
});

export const metadata: Metadata = {
  title: "temper — zine",
  description:
    "Never leave your terminal to find a domain. 30 TLDs, under 2 seconds, all private. Also an MCP server — so Claude and Cursor can search on your behalf.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${retro.variable} ${grot.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
