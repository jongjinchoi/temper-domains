<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/logo/header-dark.png">
    <img src="https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/assets/logo/header-light.png" alt="temper — Never leave your terminal to find a domain.">
  </picture>
</p>
<p align="center">
  <a href="https://github.com/jongjinchoi/temper-domains/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" alt="License"></a>
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
This recording uses synthetic lookup responses; it does not show current domain availability.
[Recording details](https://github.com/jongjinchoi/temper-domains/blob/main/assets/screenshots/manifest.json).

## Install

Choose one:

```bash
# Homebrew — macOS or Linux, no separate runtime
brew install jongjinchoi/temper-domains/temper

# npm — Node.js 22.12.0 or newer
npm install -g temper-domains
```

For a one-off run without a global installation:

```bash
npx -y temper-domains search myproject
```

Standalone release binaries do not require Node.js.
[Run from source](https://github.com/jongjinchoi/temper-domains/blob/main/docs/cli.md#run-from-source).

## Usage

Start with a name:

```bash
temper search myproject
```

Temper checks 30 extensions by default. Use `j` / `k` to move, `Enter` to
choose a registrar, `i` for domain details, and `q` to quit.
Opening a registrar page does not purchase a domain.

```bash
temper search myproject --extended          # 60 extensions
temper search myproject --tlds com,io,dev    # choose extensions
temper suggest myproject                   # prefix/suffix ideas
temper search myproject --format json       # scriptable results
```

Running `temper` shows common commands. Use `temper --help` or
`temper search --help` for command options.

## Features

- **Extension discovery:** browse supported extensions by industry, purpose or region.
- **Name suggestions:** try prefixes and suffixes around a candidate.
- **Domain details:** inspect registrar, dates and nameservers with `temper whois`.
- **Watchlist and history:** save candidates and revisit earlier searches.
- **JSON output:** pipe results into your own tools.
- **Local MCP server:** let your AI assistant search domains.
- **Keyboard navigation and themes:** work in your terminal.

[All commands and shortcuts](https://github.com/jongjinchoi/temper-domains/blob/main/docs/cli.md)
· [Extension filters](https://github.com/jongjinchoi/temper-domains/blob/main/docs/extensions.md)

<a id="themes"></a>
Choose from 7 themes with `temper init` or `temper config theme --list`.
[Theme gallery](https://github.com/jongjinchoi/temper-domains/blob/main/docs/cli.md#themes).

## Updates

```bash
temper update          # Check now; ask before installing
temper update --check  # Check and show guidance without installing
```

Interactive `temper`, `search`, `suggest`, `whois` and `list` also check for updates.
**Later** continues your command and skips the update only for that invocation.

Temper can update verified global npm and Homebrew installations after confirmation.
Local, linked and npx-cache installations receive manual guidance.
After a successful update, run your command again.
Set `TEMPER_NO_UPDATE_CHECK=1` to disable automatic checks.

[Installation rules and failure behavior](https://github.com/jongjinchoi/temper-domains/blob/main/docs/cli.md#updates)

## MCP

Install Temper first, then configure your MCP client to start a local stdio server:

```text
command: temper
args: ["mcp"]
```

This is the command/arguments pair; each client has its own configuration format.
It runs the same server as `temper mcp`.

[Codex](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#codex)
· [Claude Code](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#claude-code)
· [Claude Desktop](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#claude-desktop)
· [Cursor](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#cursor)
· [Windsurf](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#windsurf)
· [Cline](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#cline-extension)
· [VS Code](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#vs-code-built-in-mcp-support)

Then ask, for example: “Find domains for myproject.”

[Tool inputs, results and limits](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#tool-contracts)

## Before you rely on a result

- **Availability is a lookup result.** It does not guarantee a purchase, price,
  registration eligibility or trademark clearance. Confirm with the registrar.
- **An unresolved lookup is not an available domain.** Timeouts and rate limits
  can leave partial results. Resume eligible results when the server wait permits.
- **Queries reach external providers.** CLI and local MCP run on your machine;
  providers receive the queried domain and connection metadata. Temper adds no telemetry.
- **The hosted demo runs on a server.** Submitted names go to its API for lookup.
  Local CLI history and watchlist stay on your machine.
- **Update checks contact the release channel.** They send no domain names or
  history, but npm or GitHub can see connection metadata.

[Errors, recovery and privacy details](https://github.com/jongjinchoi/temper-domains/blob/main/docs/troubleshooting.md)

## Documentation

- [CLI reference](https://github.com/jongjinchoi/temper-domains/blob/main/docs/cli.md) — all options, settings and keyboard shortcuts.
- [Extensions](https://github.com/jongjinchoi/temper-domains/blob/main/docs/extensions.md) — discovery, filters and selection.
- [Troubleshooting](https://github.com/jongjinchoi/temper-domains/blob/main/docs/troubleshooting.md) — partial results, limits and recovery.
- [MCP](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md) — client setup and tool contracts.

## Contributing

Issues and pull requests are welcome.
[Development and checks](https://github.com/jongjinchoi/temper-domains/blob/main/docs/current.md#main-commands).

## License

AGPL-3.0-only. Commercial use is allowed; distribution and modified network
versions carry source-sharing requirements.
[License and source details](https://github.com/jongjinchoi/temper-domains/blob/main/docs/licensing.md).
