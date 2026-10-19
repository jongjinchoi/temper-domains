import { DEFAULT_TLDS } from "../../src/checker/types.ts";
import { THEME_META, THEME_PALETTES, type ThemeName } from "../../src/tui/theme-meta.ts";

// SYNC SOURCES — change the source and rerun `bun test web/lib/__tests__/`
// before shipping a change to these values.
//
//   DEFAULT_TLDS_COUNT, EXTENDED_TLDS_COUNT  ← ../../src/checker/types.ts
//   DEMO_FIRST_TLDS                          ← hero demo first pass, verified ⊆ DEFAULT_TLDS
//   DEMO_MORE_TLDS                           ← the rest of DEFAULT_TLDS (derived)
//   THEMES (key, label, desc, palette)       ← ../../src/tui/theme-meta.ts (derived)
//   MCP_TOOLS                                ← ../../src/mcp/server.ts
//   COMMANDS, KEYMAP                         ← ../../src/index.ts + docs/cli.md

export const DEFAULT_TLDS_COUNT = 30;
export const EXTENDED_TLDS_COUNT = 60;
export const SEARCH_TIMEOUT_DESCRIPTION = "automatic 5–30s budget";

// Hero demo: a typed name checks DEMO_FIRST_TLDS first, and "check more" checks
// the remaining DEFAULT_TLDS, so the two passes together match the CLI's default
// 30. Each pass must fit one /api/check/ request (at most 20 TLDs). The cached
// example (/api/example/) checks HERO_DEMO_NAME against DEMO_FIRST_TLDS.
export const HERO_DEMO_NAME = "gethalden";
export const DEMO_FIRST_TLDS = [
  "com", "dev", "app", "ai", "co", "net", "org", "xyz", "me", "tv",
] as const;
export const DEMO_MORE_TLDS: readonly string[] = DEFAULT_TLDS.filter(
  (tld) => !(DEMO_FIRST_TLDS as readonly string[]).includes(tld),
);

export interface Theme {
  key: string;
  label: string;
  desc: string;
  palette: {
    bg: string;
    fg: string;
    accent: string;
    ok: string;
    tk: string;
    mu: string;
  };
}

// Web previews use the CLI palettes directly, so the two cannot drift.
const previewPalette = (key: ThemeName): Theme["palette"] => {
  const { base, text, primary, green, red, dim } = THEME_PALETTES[key];
  return { bg: base, fg: text, accent: primary, ok: green, tk: red, mu: dim };
};

export const THEMES: Theme[] = THEME_META.map(meta => ({ ...meta, palette: previewPalette(meta.key) }));

export const MCP_TOOLS = [
  "list_supported_tlds",
  "search_domain",
  "search_names",
  "suggest_domain",
  "check_domain_availability",
  "whois_domain",
  "open_registrar",
] as const;

export interface Command {
  slot: string;
  sig: { cmd: string; arg?: string };
  desc: string;
  example: string;
}

export const COMMANDS: Command[] = [
  {
    slot: "CMD / 01",
    sig: { cmd: "search", arg: "<name>" },
    desc: "Check 30 TLDs, 60 with --extended, or chosen extensions with --tlds.",
    example: "$ temper search gethalden --tlds com,dev,co.uk",
  },
  {
    slot: "CMD / 02",
    sig: { cmd: "suggest", arg: "<name>" },
    desc: "Generate prefix/suffix combinations. get·, try·, ·app, ·hq.",
    example: "$ temper suggest gethalden -p use,try -s app,hq",
  },
  {
    slot: "CMD / 03",
    sig: { cmd: "whois", arg: "<domain>" },
    desc: "Registrar, expiry, nameservers, DNSSEC, EPP. RDAP/WHOIS.",
    example: "$ temper whois example.com --format json",
  },
  {
    slot: "CMD / 04",
    sig: { cmd: "watch", arg: "<domain>" },
    desc: "Track availability. `temper list` shows the watchlist.",
    example: "$ temper watch gethalden.com",
  },
  {
    slot: "CMD / 05",
    sig: { cmd: "history" },
    desc: "Interactive search history. Re-run or remove previous searches.",
    example: "$ temper history",
  },
  {
    slot: "CMD / 06",
    sig: { cmd: "mcp" },
    desc: "Start the MCP server over stdio. For Codex/Claude/Cursor configs.",
    example: "$ temper mcp",
  },
  {
    slot: "CMD / 07",
    sig: { cmd: "extensions" },
    desc: "Browse supported extensions by industry, purpose or region. Offline, 50 per page (max 100).",
    example: "$ temper extensions --categories",
  },
  {
    slot: "CMD / 08",
    sig: { cmd: "update" },
    desc: "Check for a new version. Verified npm/Homebrew installs update after confirmation; --check only reports.",
    example: "$ temper update --check",
  },
];

export interface Keybind {
  keys: string[];
  action: string;
}

export const KEYMAP: Keybind[] = [
  { keys: ["j", "k"], action: "move" },
  { keys: ["↵"], action: "registrar" },
  { keys: ["r"], action: "resume selected" },
  { keys: ["R"], action: "resume visible" },
  { keys: ["u"], action: "unresolved" },
  { keys: ["i"], action: "whois" },
  { keys: ["/"], action: "filter" },
  { keys: ["a"], action: "watch" },
  { keys: ["s"], action: "suggest" },
  { keys: ["h"], action: "history" },
  { keys: ["w"], action: "list" },
  { keys: ["esc"], action: "stop resume / back" },
  { keys: ["q"], action: "quit" },
];

export const GITHUB_URL = "https://github.com/jongjinchoi/temper-domains";
export const INSTALL_CMD = "brew install jongjinchoi/temper-domains/temper";
export const RELEASES_URL = `${GITHUB_URL}/releases`;

export interface InstallMethod {
  title: string;
  note: string;
  command?: string;
  href?: string;
}

// Install claims follow README.md "Install" and the release workflow targets.
export const INSTALL_METHODS: InstallMethod[] = [
  { title: "Homebrew", note: "macOS and Linux. No separate runtime.", command: INSTALL_CMD },
  { title: "npm", note: "Any platform with Node.js 22.12.0 or newer.", command: "npm install -g temper-domains" },
  { title: "Just try it", note: "One-off run, no global install.", command: "npx -y temper-domains search myproject" },
  { title: "Release binaries", note: "macOS, Linux and Windows. No Node.js required.", href: RELEASES_URL },
];

export interface LoopStep {
  tag: string;
  title: string;
  body: string;
  media: { src: string; alt: string; caption: string };
}

// "The naming loop" cards. Behavior claims follow src/tui/SearchView.tsx,
// src/tui/SuggestView.tsx (suggestions check .com) and src/tui/WatchlistView.tsx.
// Media are the synthetic-lookup recordings copied from assets/screenshots/.
export const LOOP_STEPS: LoopStep[] = [
  {
    tag: "01 · SEARCH",
    title: `One name, ${DEFAULT_TLDS.length} TLDs.`,
    body: "Results stream in as each registry answers. `--extended` checks 60; `--tlds com,dev,co.uk` checks only the ones you list.",
    media: { src: "/media/search.gif", alt: "temper search results streaming in a terminal", caption: "temper search" },
  },
  {
    tag: "02 · SUGGEST",
    title: ".com taken? Try get·, use·, ·app.",
    body: "Press `s`, or run `temper suggest`, to generate prefix and suffix combinations and check their .com. Press enter on one to check all 30 TLDs.",
    media: { src: "/media/suggest.gif", alt: "temper suggest checking name combinations", caption: "temper suggest" },
  },
  {
    tag: "03 · CHOOSE",
    title: "Pick a registrar, open its page.",
    body: "On an available domain, enter lists registrars and opens the one you pick in your browser. Nothing is bought until you buy it there.",
    media: { src: "/media/registrar.gif", alt: "Choosing a registrar for an available domain", caption: "↵ registrar" },
  },
  {
    tag: "04 · KEEP",
    title: "Not ready? Watch it.",
    body: "`a` adds the selected domain to your watchlist, and `temper list` rechecks every watched domain. `temper whois` shows a taken domain's registrar and expiry.",
    media: { src: "/media/watchlist.gif", alt: "temper list rechecking a watchlist", caption: "temper list" },
  },
];

export interface FaqItem {
  q: string;
  a: string;
}

// Shown on the page and emitted as FAQPage JSON-LD (app/layout.tsx), so the
// structured data always matches the visible answers.
export const FAQ: FaqItem[] = [
  {
    q: "Does temper buy domains?",
    a: "No. temper checks availability over RDAP or WHOIS and opens the registrar you choose. Confirm purchase availability and price with that registrar.",
  },
  {
    q: "How do I install temper?",
    a: "On macOS and Linux, run: brew install jongjinchoi/temper-domains/temper. On any platform with Node.js 22.12.0 or newer, run: npm i -g temper-domains.",
  },
  {
    q: "What operating systems does temper support?",
    a: "temper runs on macOS, Linux, and Windows through release binaries or npm. Homebrew installation supports macOS and Linux.",
  },
  {
    q: "Is temper free?",
    a: "Yes. temper is open-source software released under the AGPL-3.0-only license.",
  },
  {
    q: "How many TLDs does temper check?",
    a: "30 TLDs by default. Use --extended for 60, --tlds for chosen extensions including co.uk, or --category for an industry. Use temper extensions to browse the full supported catalog by industry, purpose and region.",
  },
  {
    q: "What is MCP and how does temper use it?",
    a: "MCP (Model Context Protocol) lets AI assistants like Codex, Claude, and Cursor call external tools. Running 'temper mcp' starts a local stdio server exposing seven tools: list_supported_tlds, search_domain, search_names, suggest_domain, check_domain_availability, whois_domain, and open_registrar.",
  },
  {
    q: "Does temper track my searches?",
    a: "The CLI and local MCP server add no telemetry. Lookups go to registry RDAP/WHOIS servers, which receive the queried domain and connection metadata. Update checks contact npm or GitHub without sending domain names or history. The demo on this page sends names to its server-side API.",
  },
  {
    q: "Can I use the results in scripts?",
    a: "Yes. temper search <name> --format json prints results you can pipe into jq or your own tools.",
  },
];

export function getVersion(): string {
  return process.env.NEXT_PUBLIC_TEMPER_VERSION ?? "0.0.0";
}

// ─── Site identity ─────────────────────────────────────────────────────────
// Source of truth for page metadata, OG tags, sitemap, robots. Change
// SITE_URL in one place when migrating to a custom domain.

export const SITE_URL = "https://temper.domains";
export const SITE_TITLE = "temper — terminal-first domain search";
export const SITE_TAGLINE = "terminal-first domain search";
export const SITE_DESCRIPTION =
  "Never leave your terminal to find a domain. 30 TLDs by default with an " +
  "automatic 5–30s budget, no telemetry in the CLI/MCP flow. Also an MCP server — so " +
  "Codex, Claude, and Cursor can search on your behalf.";

// ─── Colophon ──────────────────────────────────────────────────────────────
// Imprint data for the "judge the craft" block that sits between Cta and
// Footer. Zine tradition: last-page masthead declaring who made this, with
// what, where, and when.

export const AUTHOR_URL = "https://jongjinchoi.com";

export interface SideProject {
  name: string;
  url: string;
}

export const AUTHOR_PRODUCTS: readonly SideProject[] = [
  { name: "Decker", url: "https://rundecker.com" },
  { name: "Holt", url: "https://writeholt.com" },
  { name: "Halden", url: "https://gethalden.com" },
] as const;

export const COLOPHON_LOCATION = "GANGHWA";
export const COLOPHON_YEAR = 2026;

export const TYPEFACES = [
  "Space Grotesk",
  "JetBrains Mono",
  "VT323",
] as const;

export const BUILD_STACK = ["Next.js", "Ink + React", "Bun"] as const;
