// SYNC SOURCES — change the source and rerun `bun test web/lib/__tests__/`
// before shipping a change to these values.
//
//   DEFAULT_TLDS_COUNT, EXTENDED_TLDS_COUNT  ← ../../src/checker/types.ts
//   THEMES (key + palette)                   ← ../../src/tui/theme.ts
//   THEMES (label + desc)                    ← ../../README.md + InitView.tsx
//   MCP_TOOLS                                ← ../../src/mcp/server.ts
//   COMMANDS, KEYMAP                         ← ../../src/index.ts + README.md

export const DEFAULT_TLDS_COUNT = 30;
export const EXTENDED_TLDS_COUNT = 59;

// Playground-only subset. Not synced with the CLI's DEFAULT_TLDS — this is
// tuned for what fits the CRT body without scrolling. All entries must
// remain a subset of EXTENDED_TLDS (enforced in __tests__/temper-data.test.ts).
export const PLAYGROUND_TLDS = [
  "com", "io", "dev", "app", "ai", "co", "xyz", "net",
  "sh", "org", "me", "so", "gg", "cloud", "tech",
] as const;

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

export const THEMES: Theme[] = [
  {
    key: "temper-forge",
    label: "Temper Forge",
    desc: "Fire × Iron",
    palette: { bg: "#1a1d23", fg: "#e8e6e3", accent: "#ff7a45", ok: "#64c896", tk: "#e64545", mu: "#6b7280" },
  },
  {
    key: "seoul-night",
    label: "Seoul Night",
    desc: "Neon × Han River",
    palette: { bg: "#14141f", fg: "#e8e3f0", accent: "#ff4d8d", ok: "#7ee787", tk: "#ff5e62", mu: "#5a5775" },
  },
  {
    key: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    desc: "Soft pastels",
    palette: { bg: "#1e1e2e", fg: "#cdd6f4", accent: "#cba6f7", ok: "#a6e3a1", tk: "#f38ba8", mu: "#6c7086" },
  },
  {
    key: "dracula",
    label: "Dracula",
    desc: "High contrast",
    palette: { bg: "#282a36", fg: "#f8f8f2", accent: "#bd93f9", ok: "#50fa7b", tk: "#ff5555", mu: "#6272a4" },
  },
  {
    key: "default",
    label: "Default",
    desc: "Terminal native",
    palette: { bg: "#000000", fg: "#ffffff", accent: "#af87ff", ok: "#00af00", tk: "#ff0000", mu: "#666666" },
  },
  {
    key: "catppuccin-latte",
    label: "Catppuccin Latte",
    desc: "Pastel light",
    palette: { bg: "#eff1f5", fg: "#4c4f69", accent: "#8839ef", ok: "#40a02b", tk: "#d20f39", mu: "#9ca0b0" },
  },
  {
    key: "rose-pine-dawn",
    label: "Rosé Pine Dawn",
    desc: "Warm natural light",
    palette: { bg: "#faf4ed", fg: "#464261", accent: "#907aa9", ok: "#286983", tk: "#b4637a", mu: "#9893a5" },
  },
];

export const MCP_TOOLS = [
  "search_domain",
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
    desc: "Check 30 TLDs (59 with --extended). Navigate with j/k. Enter to buy.",
    example: "$ temper search dashflow --tlds com,dev,io",
  },
  {
    slot: "CMD / 02",
    sig: { cmd: "suggest", arg: "<name>" },
    desc: "Generate prefix/suffix combinations. get·, try·, ·app, ·hq.",
    example: "$ temper suggest dashflow -p get,use -s app,hq",
  },
  {
    slot: "CMD / 03",
    sig: { cmd: "whois", arg: "<domain>" },
    desc: "Registrar, expiry, nameservers, DNSSEC, EPP. RDAP-first.",
    example: "$ temper whois example.com --format json",
  },
  {
    slot: "CMD / 04",
    sig: { cmd: "watch", arg: "<domain>" },
    desc: "Track availability. `temper list` shows the watchlist.",
    example: "$ temper watch dashflow.com",
  },
  {
    slot: "CMD / 05",
    sig: { cmd: "history" },
    desc: "Interactive search history. Re-run, remove, jump to whois.",
    example: "$ temper history",
  },
  {
    slot: "CMD / 06",
    sig: { cmd: "mcp" },
    desc: "Start the MCP server over stdio. For Claude/Cursor configs.",
    example: "$ temper mcp",
  },
];

export interface Keybind {
  keys: string[];
  action: string;
}

export const KEYMAP: Keybind[] = [
  { keys: ["j", "k"], action: "move" },
  { keys: ["↵"], action: "buy" },
  { keys: ["i"], action: "whois" },
  { keys: ["/"], action: "filter" },
  { keys: ["a"], action: "watch" },
  { keys: ["s"], action: "suggest" },
  { keys: ["h"], action: "history" },
  { keys: ["w"], action: "list" },
  { keys: ["esc"], action: "back" },
  { keys: ["q"], action: "quit" },
];

export const GITHUB_URL = "https://github.com/jongjinchoi/temper-domains";
export const INSTALL_CMD = "brew install jongjinchoi/temper-domains/temper";

export function getVersion(): string {
  return process.env.NEXT_PUBLIC_TEMPER_VERSION ?? "0.0.0";
}
