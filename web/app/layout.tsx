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
  author: {
    "@type": "Person",
    name: "Jongjin Choi",
    url: AUTHOR_URL,
    sameAs: ["https://github.com/jongjinchoi"],
  },
  codeRepository: GITHUB_URL,
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  softwareVersion: getVersion(),
  dateModified: new Date().toISOString().split("T")[0],
  downloadUrl: `${GITHUB_URL}/releases`,
  featureList: [
    "30 TLDs checked per search (59 with --extended)",
    "RDAP with WHOIS fallback",
    "MCP server for Claude and Cursor",
    "Interactive TUI with vim-style navigation",
    "JSON output for shell piping",
    "7 built-in themes",
    "Runs locally with zero telemetry",
  ],
  sameAs: [GITHUB_URL],
};

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I install temper?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "On macOS and Linux, run: brew install jongjinchoi/temper-domains/temper",
      },
    },
    {
      "@type": "Question",
      name: "What operating systems does temper support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "temper runs on macOS and Linux.",
      },
    },
    {
      "@type": "Question",
      name: "Is temper free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. temper is open-source software released under the Apache 2.0 license.",
      },
    },
    {
      "@type": "Question",
      name: "How many TLDs does temper check?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "30 TLDs by default. Use --extended for 59, --tlds for a custom comma-separated list, or --tld-preset for curated sets (tech, popular, startup, cheap).",
      },
    },
    {
      "@type": "Question",
      name: "What is MCP and how does temper use it?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MCP (Model Context Protocol) lets AI assistants like Claude and Cursor call external tools. Running 'temper mcp' starts a local stdio server exposing five tools: search_domain, suggest_domain, check_domain_availability, whois_domain, and open_registrar.",
      },
    },
  ],
};

const JSON_LD_HOWTO = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to install temper",
  description: "Install the temper CLI on macOS or Linux using Homebrew.",
  totalTime: "PT2M",
  supply: [
    {
      "@type": "HowToSupply",
      name: "A terminal with Homebrew installed",
    },
  ],
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Install Homebrew (skip if already installed)",
      text: "Visit https://brew.sh and follow the one-line installation command.",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Install temper",
      text: "Run: brew install jongjinchoi/temper-domains/temper",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Verify",
      text: "Run: temper --version",
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_HOWTO) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
