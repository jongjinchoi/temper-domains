<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/logo/header-dark.png">
    <img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/logo/header-light.png" alt="temper — Never leave your terminal to find a domain.">
  </picture>
</p>
<p align="center">
  <a href="https://github.com/jongjinchoi/temper-domains/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://github.com/jongjinchoi/temper-domains"><img src="https://img.shields.io/github/stars/jongjinchoi/temper-domains?style=social" alt="GitHub Stars"></a>
</p>
<p align="center">
  Search domains, check availability, and open purchase pages — all from your terminal.<br>
  Works as a CLI, or as an MCP server so Codex, Claude, and Cursor can search domains for you.
</p>
<p align="center">
  <a href="#install">Install</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#mcp">MCP</a> ·
  <a href="#themes">Themes</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/demo.gif" width="600" /></p>

---

## Why

AI coding tools can't check if a domain is available. Claude suggests a name, you open a browser, search manually, come back — the flow breaks every time.

**temper fixes this.** One command. 30 TLDs. Fast enough to stay in flow.

## Features

- **Private** — CLI and MCP queries run on your machine. No tracking, no telemetry. The hosted web demo uses a server-side API route for live checks.
- **Fast** — checks 30 TLDs by default with a 5s timeout. 59 with `--extended`.
- **MCP native** — Codex, Claude Code, Claude Desktop, and Cursor can search domains directly.
- **Keyboard-first** — vim-style navigation, single-key registrar selection.
- **Pipe-friendly** — `--format json` for scripting and automation.
- **Themeable** — 7 built-in themes (5 dark + 2 light).
- **Open source** — Apache 2.0. Zero telemetry.

## Install

```bash
# Homebrew (macOS/Linux) — no runtime needed
brew install jongjinchoi/temper-domains/temper

# npm (Node.js >= 18)
npm i -g temper-domains
temper search <name>

# One-off npm run without global install
npx -y temper-domains search <name>

# Or run from source (requires Bun)
bun install && bun run src/index.ts search <name>
```

## Usage

```
$ temper --help

Usage: temper [options] [command]

Never leave your terminal to find a domain.

Commands:
  search [options] <queries...>  Search domain availability across TLDs
  suggest [options] [query]      Generate name combinations and check availability
  whois <domain>                 Show detailed WHOIS/RDAP info for a domain
  init                           Set up temper (registrar + theme)
  history                        Show search history
  watch <domain>                 Add a domain to watchlist
  list                           Show watchlist with current availability
  show-presets                   Show available TLD presets
  config                         Manage temper configuration
  mcp                            Start MCP server over stdio
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j`/`k` | Move up/down |
| `Enter` | Buy domain / select |
| `i` | WHOIS/RDAP detail |
| `/` | Filter results |
| `a` | Add to watchlist |
| `s` | Suggest combinations |
| `h` | Search history |
| `w` | Watchlist |
| `esc` | Back |
| `q` | Quit |

### Search

```bash
temper search myproject                          # 30 default TLDs
temper search myproject --extended               # 59 TLDs
temper search myproject --tlds com,dev,io         # specific TLDs
temper search myproject --tld-preset tech         # preset: tech, popular, startup, cheap
temper search myproject -a                        # available only
temper search myproject -t 8                      # 8s timeout (default: 5)
temper search myproject --format json             # JSON output for piping
temper search localhoston writeholt --format json # multiple keywords in JSON mode
```

Navigate with `j`/`k`, press `Enter` to buy, `a` to add to watchlist, `/` to filter. Press `s` for suggestions, `h` for history, `w` for watchlist. `q` to quit. TUI mode shows one query at a time; use `--format json` for batch searches.

<p align="center"><img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/search.png" width="600" /></p>

#### TLD Presets

```bash
temper show-presets

  popular    com, net, org, io, co, app, dev, ai, me
  tech       io, ai, dev, app, gg, sh, tech, cloud, digital
  startup    com, io, co, ai, app, dev, xyz, so, gg
  cheap      xyz, fun, lol, top, site, online, store, shop, club
```

#### JSON output

```bash
temper search localhoston --format json | jq '.[] | select(.status == "available" and .confidence != "low") | .domain'
```

Availability rows can include `confidence`, `reason`, `rdapKey`,
`publicSuffix`, and `registrableDomain` fields. A low-confidence available
result should be reviewed with a registrar before treating it as purchasable.

### Whois

Look up detailed WHOIS/RDAP information for any domain. In search view, press `i` on any domain.

```bash
temper whois example.com                         # TUI view
temper whois example.com --format json           # JSON output
```

Shows registrar, registration/expiry dates, nameservers, DNSSEC status, and EPP status codes. Uses RDAP (RFC 9083) when available, falls back to WHOIS.

### Suggest

Generate name combinations and check `.com` availability. Press `Enter` on any name to check all 30 TLDs.

```bash
temper suggest localhoston                            # default prefixes + suffixes
temper suggest localhoston -p super,mega -s io,lab    # custom prefixes/suffixes
```

```
  BASE
    localhoston          ✗ taken

  PREFIX
    getlocalhoston       ✓ available
    uselocalhoston       ✓ available
    trylocalhoston       ✓ available
    ...

  SUFFIX
    localhostonapp       ✓ available
    localhostonlabs      ✓ available
    ...

  Summary: 13 available · 2 taken
```

Default prefixes: `get` `use` `try` `my` `go` `join`
Default suffixes: `app` `labs` `hq` `ly` `dev` `hub` `run` `kit`

<p align="center"><img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/suggest.png" width="600" /></p>

### Watchlist & History

```bash
temper history                # interactive search history (re-search, remove)
temper list                   # interactive watchlist (refresh, remove)
temper watch localhoston.com  # add a domain to watchlist from CLI
```

In search view, press `a` to add a domain to your watchlist, `h` to view history, `w` to view watchlist.

### Setup

```bash
temper init                           # first-time setup (registrar + theme)
temper config theme seoul-night       # change theme
temper config theme --list            # list themes
```

<h2 id="mcp">MCP</h2>

temper runs as a local MCP server. Your AI assistant searches domains without you switching context.

> **Prerequisite:** Install temper first — `brew install jongjinchoi/temper-domains/temper` or `npm i -g temper-domains`.

### Codex

Codex stores MCP server configuration in `~/.codex/config.toml` and shares it between the Codex CLI and IDE extension. Add temper with:

```bash
codex mcp add temper -- temper mcp
```

In the Codex TUI, run `/mcp` to confirm the server is active.

You can also edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.temper]
command = "temper"
args = ["mcp"]
```

If you prefer not to install globally, use `npx` as the command and pass `["-y", "temper-domains", "mcp"]` as args in MCP clients that support explicit command/args configuration.

### Claude Code

Pick one based on how you want temper available:

**All projects (recommended):**

```bash
claude mcp add --scope user --transport stdio temper -- temper mcp
```

**Current folder only:**

```bash
claude mcp add --transport stdio temper -- temper mcp
```

### Claude Desktop

Settings → Developer → Edit Config:

```json
{
  "mcpServers": {
    "temper": {
      "command": "temper",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor

Settings → Tools & Integrations → New MCP Server (command type):

```json
{
  "mcpServers": {
    "temper": {
      "command": "temper",
      "args": ["mcp"]
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "temper": {
      "command": "temper",
      "args": ["mcp"]
    }
  }
}
```

### VS Code (Cline)

Command Palette → `MCP: Add server` → stdio → `temper mcp`

---

**Tools:**

| Tool | Description |
|------|-------------|
| `search_domain` | Check 30 or 59 TLDs for one bare name |
| `search_names` | Check up to 8 bare name candidates across default or extended TLDs |
| `suggest_domain` | 15 name combinations × 5 TLDs using RDAP/WHOIS |
| `check_domain_availability` | Verify explicit full domains only (up to 100) |
| `whois_domain` | Detailed WHOIS/RDAP info (registrar, dates, nameservers) |
| `open_registrar` | Open purchase page in browser |

MCP output keeps uncertain results visible. Low-confidence availability is
reported as review instead of a final recommendation.

**Example: Brainstorm from scratch**

```
You:    "I'm building a health management app. Suggest domain names."

Claude: [generates candidates: wellbi, vitalo, medra, healix, ...]
        [calls search_names for generated bare names]
        [calls suggest_domain for top picks]

        Top Pick: wellbi.app
        - Short, pronounceable, .app TLD fits mobile apps
        - getwellbi.com also available

        ⚠ Medra means "fear" in Spanish — avoid for global use
        💡 Check @wellbi on social media before registering
```

**Example: Search with a name**

```
You:    "Find domains for localhoston"

Claude: [calls search_domain]
        localhoston.com is taken, but these are available:
        - localhoston.dev, localhoston.app, localhoston.io
```

For names without a TLD, temper checks the default 30 TLDs first and treats
`.com` as the first result to interpret. Use extended search only when the
default set is not enough.

**Example: Check specific domains**

```
You:    "Check getlocalhoston.com and trylocalhoston.com"

Claude: [calls check_domain_availability]
        ✓ getlocalhoston.com — available
        ✓ trylocalhoston.com — available
```

**Example: Buy a domain**

```
You:    "Open Cloudflare for getlocalhoston.com"

Claude: [calls open_registrar]
        Done. Cloudflare opened in your browser.
```

When temper runs as a local CLI or MCP server, queries run on your machine. The hosted website demo uses its own API route for live checks.

<h2 id="themes">Themes</h2>

| | |
|---|---|
| ![Temper Forge](https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/theme-temper-forge.png) | ![Seoul Night](https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/theme-seoul-night.png) |
| ![Catppuccin Mocha](https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/theme-catppuccin-mocha.png) | ![Dracula](https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/theme-dracula.png) |
| ![Default](https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/theme-default.png) | ![Catppuccin Latte](https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/theme-catppuccin-latte.png) |
| ![Rosé Pine Dawn](https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/theme-rose-pine-dawn.png) | |

| Theme | |
|-------|---|
| **Temper Forge** | 🔥 Flame orange on dark steel |
| **Seoul Night** | 🌃 Neon pink, Han River blue |
| **Catppuccin Mocha** | 🎨 Soft pastels |
| **Dracula** | 🧛 High contrast |
| **Default** | ⚫ Terminal native |
| **Catppuccin Latte** | ☀️ Pastel light |
| **Rosé Pine Dawn** | 🌅 Warm natural light |

## Contributing

```bash
git clone https://github.com/jongjinchoi/temper-domains.git
cd temper-domains
bun install
bun run src/index.ts search <name>    # run locally
bun test                               # run tests
```

Issues and pull requests are welcome.

## License

Apache 2.0 — see [LICENSE](./LICENSE)

---

<p align="center">
  <strong>temper</strong> — forged in the terminal. 🔥
</p>
