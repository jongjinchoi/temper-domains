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

Screenshots and recordings show the source revision recorded in
[the capture manifest](assets/screenshots/manifest.json), using synthetic lookup
responses for demonstration. They are not current domain availability checks;
an installed release may differ from the development source shown here.

---

## Why

Generating a name does not tell you whether its domain is registered. Temper
lets you check candidates in your terminal or through your AI assistant's MCP tools.

**temper fixes this.** One command. 30 TLDs. Fast enough to stay in flow.

## Features

- **Private** — CLI and MCP queries run on your machine. No tracking, no telemetry. The hosted web demo uses a server-side API route for live checks.
- **Fast** — checks 30 TLDs by default with an automatic 5–30s search budget. 60 with `--extended`.
- **MCP native** — Codex, Claude Code, Claude Desktop, and Cursor can search domains directly.
- **Keyboard-first** — vim-style navigation, single-key registrar selection.
- **Pipe-friendly** — `--format json` for scripting and automation.
- **Themeable** — 7 built-in themes (5 dark + 2 light).
- **Open source** — Apache 2.0. Zero telemetry.

## Install

```bash
# Homebrew (macOS/Linux) — no runtime needed
brew install jongjinchoi/temper-domains/temper

# npm (Node.js >= 22.12.0)
npm i -g temper-domains
temper search <name>

# One-off npm run without global install
npx -y temper-domains search <name>

# Or run from source (requires Bun)
bun ci && bun run src/index.ts search <name>
```

The npm package requires Node.js 22.12.0 or newer; standalone binaries do not
require Node.js. Development does not require a specific Bun or Node.js version
beyond the dependencies' runtime requirements.

## Usage

<!-- temper-help:start -->

```text
$ temper --help

Usage: temper [options] [command]

Never leave your terminal to find a domain.

Options:
  -V, --version                  output the version number
  -h, --help                     display help for command

Commands:
  search [options] <queries...>  Search domain availability across TLDs
  suggest [options] [query]      Generate name combinations and check
                                 availability
  init                           Set up temper (registrar + theme)
  history                        Show search history
  watch <domain>                 Add a domain to watchlist
  whois [options] <domain>       Show detailed WHOIS/RDAP info for a domain
  list                           Show watchlist with current availability
  extensions [options]           Discover extensions by industry, purpose and
                                 region (offline)
  config                         Manage temper configuration
  update [options]               Check for a new version and update after
                                 confirmation
  mcp                            Start MCP server over stdio
  help [command]                 display help for command
```

<!-- temper-help:end -->

### Updates

```bash
temper update          # Check now, then ask before installing
temper update --check  # Check now and show instructions; never install
```

Interactive `temper`, `search`, `suggest`, `whois`, and `list` check for a newer
stable version on every invocation. Automatic checks wait at most 2 seconds;
if a check fails, Temper reports it briefly and continues the original command.
Choose **Later** (the default) to skip the update for this invocation only.
After updating, an equal installed/published version produces no notice; a newer
published version produces a new notice. Set `TEMPER_NO_UPDATE_CHECK=1` to disable
automatic checks. Manual checks bypass this opt-out. MCP, JSON, pipes, CI,
help/version, `extensions`, and configuration/history commands do not perform
automatic update checks.

In a terminal, `temper` shows a welcome box with common commands and exits.
Both `temper --help` and `temper help` show the full commands and options in a box.
Piped output remains plain text.

Updates require a terminal and explicit confirmation; there is no `--yes` option.
Verified global npm installs update the displayed version in the same prefix.
Verified Homebrew installs run `brew update`, then upgrade
`jongjinchoi/temper-domains/temper`; Homebrew's normal metadata refresh, pin,
dependency and cleanup rules apply. If refreshed metadata changes the target
version, Temper asks again. Local packages, `npx`, downloaded binaries, and
unknown installation methods receive instructions instead of an automatic install.
After an update, Temper verifies the installed version and exits; run your original
command again. Failed or interrupted installers report failure without claiming
an automatic rollback. Installer quiet options reduce ordinary output; on macOS
and Linux, the system `script` utility also filters known routine lines while
preserving the installer terminal, warnings, unknown output, and input prompts.
No installation transcript is saved. Without that utility (including Windows),
Temper preserves direct terminal access and the installer's quiet output.

Version checks contact the npm registry or the Temper Homebrew tap on GitHub,
according to the installation method. They send no searched domain names or
search history. These services can see normal connection metadata such as your
IP address. Version checks do not reuse cached results or previous postponements.
Installation locks remain under `~/.temper/cache/`.
Existing releases gain this feature only after installing a release containing it.

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
temper search myproject --extended               # 60 TLDs
temper search myproject --tlds com,design,co.uk   # only selected extensions
temper search myproject --category design-arts   # industry classification
temper search myproject -a                        # available only
temper search myproject -t 8                      # 8s whole-search limit, including bootstrap
temper search myproject --format json             # JSON output for piping
temper search gethalden writeholt --format json   # multiple keywords in JSON mode
```

Navigate with `j`/`k`, press `Enter` to buy, `a` to add to watchlist, `/` to filter. Press `s` for suggestions, `h` for history, `w` for watchlist. `q` to quit. TUI mode shows one query at a time; use `--format json` for batch searches.

<p align="center"><img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/search.png" width="600" /></p>

#### Discover extensions

The bundled catalog contains **756 supported extensions** in the September 22,
2026 snapshot. It combines offering evidence from Porkbun, Dynadot and Gandi
with registration-boundary checks and known RDAP/WHOIS routes. This is not a
claim that every registry has answered a live lookup or that every name can be
purchased. Lookup results may differ from final purchase availability.

```bash
temper extensions                              # 50 per page; no domain lookup
temper extensions --limit 100                  # max page size, not total catalog size
temper extensions --limit 100 --cursor '<nextCursor>'
temper extensions --categories                 # industry / purpose / region overview
temper extensions --categories industry        # names, descriptions and counts
temper extensions --categories purpose
temper extensions --categories region
temper extensions --category design-arts
temper extensions --purpose store
temper extensions --region GB
temper extensions --query co.uk --format json
```

Each classification has inclusion reasons and sources. Memberships can overlap;
unclassified entries remain discoverable and selectable. Multiple IDs in one
facet are ORed; different facets are ANDed. Region means geographic association.
Registration eligibility is not collected, displayed or used to gate searches.

Use `--tlds` to search chosen suffixes, including composite suffixes such as
`co.uk` and supported IDNs. Direct selection outside the catalog is checked
against known registration boundaries and lookup routes. A normal domain or a
PRIVATE hosting suffix cannot be used as a registration extension. Unknown
boundaries and unsupported routes have separate errors.

`--category` searches only an industry's extensions, with a maximum of 480
name × extension combinations. It cannot be combined with `--tlds` or
`--extended`. Existing `--tlds` precedence over `--extended` is retained;
the new category limit does not apply to existing explicit CLI `--tlds` searches.
Requests are never silently shortened to fit. The previous named presets and
their commands have been replaced; there are no compatibility aliases.

The default 30 and extended 60 are quick-search bundles within the catalog.
Extended includes all default entries plus 30 additions. They are curated search
bundles, not a global search-popularity ranking.

Default 30:

```text
.com .net .org .xyz .top
.info .shop .online .store .site
.vip .sbs .app .biz .pro
.bond .lol .click .cfd .dev
.live .space .asia .icu .ai
.io .co .me .tv .cc
```

Additional 30 (extended = default + additional):

```text
.club .tech .cyou .cloud .life
.world .fun .mobi .blog .digital
.work .art .link .website .autos
.one .help .buzz .lat .studio
.skin .win .bet .run .today
.makeup .beer .email .ink .design
```

Catalog browsing is offline and does not write user settings or search history.
Maintainers explicitly refresh the bundled data; users do not download catalog
updates while browsing. See [catalog maintenance](docs/current.md#extension-catalog-maintenance).

Each extension separates its lookup route from recorded server verification.
`response-confirmed` means a response was observed with the recorded checker and
route; `needs-recheck` means those changed, and `not-checked` means no matching
attempt has been recorded. `observed-error` preserves a failed observation.
These records do not guarantee current server availability or a purchase.
Classification records include the source, capture date and review rationale.
Unclassified entries remain browsable and selectable; a deferred review states
what was inspected or could not be retrieved.

#### JSON output

```bash
temper search gethalden --format json | jq '.[] | select(.status == "available" and .confidence != "low") | .domain'
```

Availability rows can include `confidence`, `reason`, `rdapKey`,
`publicSuffix`, and `registrableDomain` fields. A low-confidence available
result should be reviewed with a registrar before treating it as purchasable.

#### Lookup limits and partial results

CLI/MCP searches choose a 5–30s total budget based on the current server queue.
This is a client policy, not a promise that every registry will answer. An explicit
`search --timeout` sets a strict whole-search limit, including bootstrap loading.
Each network request has up to 5s after dispatch, within the remaining total time;
detailed lookups retain a 10s total limit. The hosted demo keeps a 3s total limit.

Results keep the existing status values and JSON array format. Optional
`attempts`, `queueTimeMs`, `terminationReason`, `retryAt`, and `retryAtSource` fields distinguish a
request that never started, a timeout, cancellation, and server rate limits.
RDAP `responseTime` includes queueing and retry waits; `queueTimeMs` isolates
the queue portion.
MCP summaries separate requested, attempted, answered, and unresolved domains
and show actual elapsed time. A completed stream can contain unresolved results.
`available` means no registration record was found; confirm purchase availability,
premium pricing, and restrictions with a registrar.

Local CLI and MCP commands share server cooldowns in
`~/.temper/state/lookup-limits.json`. A server's `Retry-After`, including a
24-hour wait, survives command restarts. If no valid wait is provided, Temper
waits 60, 120, 240, 480, then 900 seconds after repeated limits, adding 0–5
seconds of jitter. These are client policy values, not registry quotas.
Repeating a search during the wait does not increase that backoff. After the
wait, a new user request sends one probe first; no background retry runs.

`terminationReason: "server_cooldown"` with `attempts: 0` means that domain was
not queried because of a previous server limit. `retryAt` is the earliest retry
time in UTC, not a promise of success; `retryAtSource` is `server` or
`client_policy`. TUI search, suggestion and detail views and MCP output explain
the wait. HTTP 503 remains a service error. Other servers can continue.

The state file contains server coordination metadata, not domain names or
response bodies. Commands using the same home coordinate at most two requests
per server and 300ms between starts. A damaged, inaccessible or busy state file
returns `limit_state_error` instead of sending an uncoordinated request. Preserve
and repair a damaged file; do not delete it to bypass a wait. If a command dies
while holding the short file lock, first confirm no Temper processes are running,
then remove only `lookup-limits.json.lock`. Request leases otherwise expire or
are reclaimed after their process exits. Different homes, machines and hosted
web instances do not share this local state; the web demo uses memory only.

### Whois

Look up detailed WHOIS/RDAP information for any domain. In search view, press `i` on any domain.

```bash
temper whois example.com                         # TUI view
temper whois example.com --format json           # JSON output
```

Shows registrar, registration/expiry dates, nameservers, DNSSEC status, and EPP status codes. Search and detail share the same official RDAP/WHOIS routes. RDAP negotiates HTTP/2 or HTTP/1.1 over verified TLS; reviewed WHOIS profiles cover namespaces without a usable RDAP route, including `.cr`, `.sr` and `.sn`. Detailed results also include confidence and review reasons; a missing registration record is not presented as guaranteed purchase availability.

### Suggest

Generate name combinations and check `.com` availability. Press `Enter` on any name to check all 30 TLDs.

```bash
temper suggest gethalden                            # default prefixes + suffixes
temper suggest gethalden -p use,try -s app,hq       # custom prefixes/suffixes
```

```
  BASE
    gethalden            ✗ taken

  PREFIX
    usegethalden         ✓ available
    trygethalden         ✓ available
    mygethalden          ✓ available
    ...

  SUFFIX
    gethaldenapp         ✗ taken
    gethaldenlabs        ✓ available
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
temper watch gethalden.com    # add a domain to watchlist from CLI
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

Add the following to `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json`
for all projects. See [Cursor's MCP documentation](https://cursor.com/docs/mcp).

```json
{
  "mcpServers": {
    "temper": {
      "type": "stdio",
      "command": "temper",
      "args": ["mcp"]
    }
  }
}
```

### Windsurf

Open your client's MCP configuration and add the local server below. Follow the
[client's MCP instructions](https://docs.windsurf.com/windsurf/cascade/mcp) for
your installed version; that documentation currently redirects to Devin Desktop,
whose configuration path should not be assumed to apply to older Windsurf versions.

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

### Cline extension

In the Cline panel, open **MCP Servers → Configure → Configure MCP Servers**.
Add `temper` under `mcpServers` in the opened JSON, using the local-server
configuration above. See [Cline's MCP documentation](https://docs.cline.bot/mcp/mcp-overview).

### VS Code built-in MCP support

For VS Code's own MCP support, add this to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "temper": {
      "type": "stdio",
      "command": "temper",
      "args": ["mcp"]
    }
  }
}
```

VS Code uses `servers` here; Cline uses its separate `mcpServers` configuration.
See [VS Code's MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

---

**Tools:**

| Tool | Description |
|------|-------------|
| `list_supported_tlds` | Browse bundles, classifications and supported extensions offline |
| `search_domain` | Check one bare name across 30, 60 or explicitly selected extensions |
| `search_names` | Check up to 8 bare names across default, extended or selected extensions |
| `suggest_domain` | 15 name combinations × 5 TLDs using RDAP/WHOIS |
| `check_domain_availability` | Verify explicit full domains only (up to 100) |
| `whois_domain` | Detailed WHOIS/RDAP info (registrar, dates, nameservers) |
| `open_registrar` | Open purchase page in browser |

MCP output keeps uncertain results visible. Low-confidence availability is
reported as review instead of a final recommendation.

**Example: Discover supported extensions**

Ask "Which domain extensions do you support?" No arguments to
`list_supported_tlds` returns the default 30, additional 30 and combined 60,
plus the full catalog count and discovery guidance. Use
`{"view":"extensions","limit":100}` for the full catalog, following `nextCursor`
with the same filters. Pages default to 50, maximum 100. The initial 756 entries
span eight 100-entry pages (last page: 56).

Use `{"view":"categories"}` for facet navigation, or add
`"facet":"industry"`, `"purpose"` or `"region"` for category descriptions and
counts. Filter extension pages with `industries`, `purposes`, `regions` or
`query`. These calls make no network requests or domain availability checks.

For selected searches:

```json
{"name":"mybrand","tlds":["com","co.uk"]}
```

Use `search_names` with `names` for multiple names. Only the selected extensions
are queried; defaults are not appended. Maximum selected combinations: 480.
Do not combine `tlds` with `extended`, even `extended:false`. Invalid inputs and
unknown options fail before lookup. Selected results retain every requested
domain and any failures, timeouts or missing responses.

**Example: Brainstorm from scratch**

The conversations below are illustrative. Actual lookup results vary. Name
suggestions and branding comments come from the assistant, not Temper's checks.

```
You:    "I'm building a health management app. Suggest domain names."

Claude: [generates candidates: wellbi, vitalo, medra, healix, ...]
        [calls search_names for generated bare names]
        [calls suggest_domain for top picks]

        Top Pick: wellbi.app
        - Short, pronounceable, .app TLD fits mobile apps
        - getwellbi.com also available

        💡 Check @wellbi on social media before registering
```

**Example: Search with a name**

```
You:    "Find domains for gethalden"

Claude: [calls search_domain]
        gethalden.com is taken, but these are available:
        - gethalden.dev, gethalden.app, gethalden.io
```

For names without a TLD, temper checks the default 30 TLDs first and treats
`.com` as the first result to interpret. Use extended search only when the
default set is not enough.

**Example: Check specific domains**

```
You:    "Check usegethalden.com and trygethalden.com"

Claude: [calls check_domain_availability]
        ✓ usegethalden.com — available
        ✓ trygethalden.com — available
```

**Example: Buy a domain**

```
You:    "Open Cloudflare for usegethalden.com"

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
