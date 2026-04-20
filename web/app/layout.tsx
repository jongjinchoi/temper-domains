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

/**
 * Run before paint: read the saved theme from localStorage and pin
 * it to <html data-theme> so there's no FOUC between system preference
 * and user override. Falls through silently if storage is blocked.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('temper-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${retro.variable} ${grot.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
