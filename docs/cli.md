# CLI reference

[Back to the README](../README.md) · [Extension guide](extensions.md) · [Troubleshooting](troubleshooting.md)

## Commands

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

In a terminal, `temper` shows a welcome box with common commands and exits.
`temper --help` and `temper help` show full help in a box; piped help stays plain text.

### Updates

```bash
temper update          # Check now, then ask before installing
temper update --check  # Check now and show instructions; never install
```

Interactive `temper`, `search`, `suggest`, `whois`, and `list` attempt a fresh check on
each invocation (at most 2 seconds); a failed check reports briefly and continues.
**Later** (default) continues the original command and skips only this invocation.
MCP, JSON, pipes, CI, help/version, `extensions`, and config/history skip automatic checks.

| Installation | Version query | Installation by Temper |
|---|---|---|
| Verified global npm / Homebrew | npm / Homebrew tap | After terminal confirmation |
| Local / linked / npx cache package | npm | Manual guidance only |
| Source checkout / unidentified binary without a release channel | None | Manual guidance only |

Detection uses the running installation; the command name `npx` alone does not identify it.
npm updates the same prefix. Homebrew refreshes metadata and asks again if the target changes.
There is no `--yes` option. After installation verification, Temper exits: **run your command again**.
Failure or cancellation does not imply rollback. Errors, warnings and installer prompts remain visible.
Set `TEMPER_NO_UPDATE_CHECK=1` to disable automatic checks; manual checks still work.
Queries send no domain names/history, but the version service sees connection metadata such as IP.
See [update behavior and output details](current.md#current-behavior-notes).

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j`/`k` | Move up/down |
| `Enter` | Choose a registrar to buy or confirm an unresolved result / select |
| `i` | WHOIS/RDAP detail |
| `/` | Filter results |
| `r` / `R` | Resume selected / visible unresolved candidates after confirmation |
| `u` | Toggle unresolved results, including in available-only mode |
| `a` | Add to watchlist |
| `s` | Suggest combinations |
| `h` | Search history |
| `w` | Watchlist |
| `esc` | Stop the current resume and keep results; otherwise back |
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

Navigate with `j`/`k`, press `Enter` to choose a registrar, `a` to add to watchlist, `/` to filter. Press `s` for suggestions, `h` for history, `w` for watchlist. `q` to quit. TUI mode shows one query at a time; use `--format json` for batch searches.

Use `r` to resume the selected retryable unresolved candidate, or `R` for those
in the current filtered list. Invalid input, unsupported routes, invalid responses and
damaged limit state require correction instead. Confirmation shows a maximum 120s budget.
Server waits still apply; candidates beyond the budget stay deferred. `Esc` stops
the resume while retaining prior results. Returning from history or another screen
preserves the current search in memory; exiting Temper ends that session. Resuming
updates its existing history entry without recreating a deleted entry.
Selecting a past history entry starts a new search using only its query, not its old options.

<p align="center"><img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/screenshots/search.png" width="600" /></p>


## JSON output

```bash
temper search gethalden --format json | jq '.[] | select(.status == "available" and .confidence != "low") | .domain'
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

Shows registrar, registration/expiry dates, nameservers, DNSSEC status, and EPP status codes. Search and detail share the same official RDAP/WHOIS routes. HTTPS RDAP verifies TLS certificates and negotiates HTTP/2 or HTTP/1.1; HTTP routes and WHOIS are not encrypted by this transport. Reviewed WHOIS profiles cover namespaces without a usable RDAP route, including `.cr`, `.sr` and `.sn`. Detailed results also include confidence and review reasons; a missing registration record is not presented as guaranteed purchase availability.

### Suggest

Generate name combinations and check `.com` availability. Press `Enter` on any name to check all 30 TLDs.

```bash
temper suggest gethalden                            # default prefixes + suffixes
temper suggest gethalden -p use,try -s app,hq       # custom prefixes/suffixes
```

Illustrative output; these are not current lookup results:

```text
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

The saved registrar preselects `temper init`; search still asks you to choose
`c`/`p`/`n`/`v`, and MCP `open_registrar` requires an explicit registrar.
Browser feedback confirms the OS opening request only, not that the page loaded.


## Themes

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
| **Default** | ⚫ Classic terminal colors |
| **Catppuccin Latte** | ☀️ Pastel light |
| **Rosé Pine Dawn** | 🌅 Warm natural light |


## Run from source

```bash
git clone https://github.com/jongjinchoi/temper-domains.git
cd temper-domains
bun ci
bun run src/index.ts search myproject
```

Development does not require an exact Bun or Node.js version beyond the dependencies' runtime requirements.
See [the development guide](current.md#main-commands) for checks and build commands.

## All command options

<!-- temper-options:start -->

### temper search

```text
Usage: temper search [options] <queries...>

Search domain availability across TLDs

Options:
  --tlds <tlds>            Only these comma-separated extensions (e.g.
                           design,studio,co.uk)
  --category <ids>         Search an industry classification (discover with
                           extensions --categories industry)
  --extended               Check 60 TLDs instead of 30
  -a, --only-available     Show only available domains
  -f, --format <format>    Output format (tui, json) (default: "tui")
  -t, --timeout <seconds>  Whole-search timeout including bootstrap (default:
                           automatic 5–30s)
  -h, --help               display help for command
```

### temper suggest

```text
Usage: temper suggest [options] [query]

Generate name combinations and check availability

Options:
  -p, --prefixes <prefixes>  Comma-separated prefixes (default:
                             get,use,try,my,go,join)
  -s, --suffixes <suffixes>  Comma-separated suffixes (default:
                             app,labs,hq,ly,dev,hub,run,kit)
  -h, --help                 display help for command
```

### temper init

```text
Usage: temper init [options]

Set up temper (registrar + theme)

Options:
  -h, --help  display help for command
```

### temper history

```text
Usage: temper history [options]

Show search history

Options:
  -h, --help  display help for command
```

### temper watch

```text
Usage: temper watch [options] <domain>

Add a domain to watchlist

Options:
  -h, --help  display help for command
```

### temper whois

```text
Usage: temper whois [options] <domain>

Show detailed WHOIS/RDAP info for a domain

Options:
  -f, --format <format>    Output format (tui, json) (default: "tui")
  -t, --timeout <seconds>  Timeout in seconds (default: "10")
  -h, --help               display help for command
```

### temper list

```text
Usage: temper list [options]

Show watchlist with current availability

Options:
  -h, --help  display help for command
```

### temper extensions

```text
Usage: temper extensions [options]

Discover extensions by industry, purpose and region (offline)

Options:
  --categories [facet]   Show navigation summary, or classifications for
                         industry, purpose or region
  --category <ids>       Filter by industry IDs (comma-separated)
  --purpose <ids>        Filter by website purpose IDs (comma-separated)
  --region <ids>         Filter by geographic association IDs (e.g. GB,KR)
  --query <suffix>       Find an extension (e.g. co.uk)
  --limit <count>        Page size (default: 50; maximum: 100)
  --cursor <cursor>      Continue the same filtered listing
  -f, --format <format>  Output format (text, json) (default: "text")
  -h, --help             display help for command

Examples:
  temper extensions --categories
  temper extensions --categories industry
  temper extensions --category design-arts
  temper extensions --purpose store
  temper extensions --region GB
  temper extensions --query co.uk
  temper search mybrand --tlds design,studio,co.uk
  temper search mybrand --category design-arts
```

### temper config

```text
Usage: temper config [options] [command]

Manage temper configuration

Options:
  -h, --help              display help for command

Commands:
  theme [options] [name]  Set or list themes
  help [command]          display help for command
```

### temper config theme

```text
Usage: temper config theme [options] [name]

Set or list themes

Options:
  --list      List available themes
  -h, --help  display help for command
```

### temper update

```text
Usage: temper update [options]

Check for a new version and update after confirmation

Options:
  --check     Query a known release channel and show guidance without installing
  -h, --help  display help for command

Automatic checks: interactive temper, search, suggest, whois and list; checked on every invocation.
Set TEMPER_NO_UPDATE_CHECK=1 to disable automatic checks.
Later skips only the current invocation. Updating requires a terminal; no --yes option.
Examples:
  temper update
  temper update --check
```

### temper mcp

```text
Usage: temper mcp [options]

Start MCP server over stdio

Options:
  -h, --help  display help for command
```

### temper help

```text
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

<!-- temper-options:end -->
