<p align="center">
  <img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/logo/logo-dark.png" width="120" alt="temper">
</p>
<h1 align="center">temper</h1>
<p align="center">
  <a href="https://github.com/jongjinchoi/temper-domains/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://github.com/jongjinchoi/temper-domains"><img src="https://img.shields.io/github/stars/jongjinchoi/temper-domains?style=social" alt="GitHub Stars"></a>
</p>
<p align="center">
  <strong>Never leave your terminal to find a domain.</strong>
</p>
<p align="center">
  Search domains, check availability, and open purchase pages — all from your terminal.<br>
  Works as a CLI, or as an MCP server so Claude and Cursor can search domains for you.
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

**temper fixes this.** One command. 30 TLDs. Under 2 seconds.

## Features

- **Private** — all queries run on your machine. No server, no logs, no tracking.
- **Fast** — 30 TLDs in under 2 seconds. 59 with `--extended`.
- **MCP native** — Claude Code, Claude Desktop, and Cursor can search domains directly.
- **Keyboard-first** — vim-style navigation, single-key registrar selection.
- **Pipe-friendly** — `--format json` for scripting and automation.
- **Themeable** — 7 built-in themes (5 dark + 2 light).
- **Open source** — Apache 2.0. Zero telemetry.

## Install

```bash
# Homebrew (macOS/Linux) — no runtime needed
brew install jongjinchoi/temper-domains/temper

# Or run from source (requires Bun or Node.js >= 18)
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
  init                           Set up temper (registrar + theme)
  history                        Show search history
  watch <domain>                 Add a domain to watchlist
  list                           Show watchlist with current availability
  show-presets                   Show available TLD presets
  config                         Manage temper configuration
  mcp                            Start MCP server for Claude Code/Desktop
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j`/`k` | Move up/down |
| `Enter` | Buy domain / select |
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
temper search myproject -t 5                      # 5s timeout (default: 3)
temper search myproject --format json             # JSON output for piping
temper search localhoston dashflow calmbox             # multiple keywords
```

Navigate with `j`/`k`, press `Enter` to buy, `a` to add to watchlist, `/` to filter. Press `s` for suggestions, `h` for history, `w` for watchlist. `q` to quit.

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
temper search localhoston --format json | jq '.[] | select(.status == "available") | .domain'
```

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

> **Prerequisite:** Install temper first — `brew install jongjinchoi/temper-domains/temper`

### Claude Code

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
| `search_domain` | Check 30 or 59 TLDs for a name |
| `suggest_domain` | 15 name combinations × 5 TLDs |
| `check_domain_availability` | Verify a list of domains (up to 100) |
| `open_registrar` | Open purchase page in browser |

**Example: Brainstorm from scratch**

```
You:    "I'm building a health management app. Suggest domain names."

Claude: [generates candidates: wellbi, vitalo, medra, healix, ...]
        [calls search_domain for each]
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

All queries run locally. No data leaves your machine.

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
