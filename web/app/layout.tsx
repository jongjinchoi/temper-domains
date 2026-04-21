import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Space_Grotesk, VT323 } from "next/font/google";
import {
  AUTHOR_URL,
  GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
  getVersion,
} from "@/lib/temper-data";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | temper",
  },
  description: SITE_DESCRIPTION,
  applicationName: "temper",
  keywords: [
    "domain search",
    "cli",
    "terminal",
    "rdap",
    "whois",
    "mcp",
    "claude",
    "cursor",
    "developer tools",
  ],
  authors: [{ name: "Jongjin Choi", url: AUTHOR_URL }],
  creator: "Jongjin Choi",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "temper",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    // Image supplied by web/app/opengraph-image.tsx (file convention)
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // Image supplied by web/app/twitter-image.tsx (file convention)
  },
  alternates: {
    canonical: "/",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3ead3" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1612" },
  ],
};

/**
 * Run before paint: read the saved theme from localStorage and pin
 * it to <html data-theme> so there's no FOUC between system preference
 * and user override. Falls through silently if storage is blocked.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('temper-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "temper",
  description: SITE_DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", name: "Jongjin Choi", url: AUTHOR_URL },
  codeRepository: GITHUB_URL,
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  softwareVersion: getVersion(),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${retro.variable} ${grot.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
