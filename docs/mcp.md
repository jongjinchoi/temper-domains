# MCP setup and tool reference

[Back to the README](../README.md) · [Lookup limits and recovery](troubleshooting.md)

temper runs as a local MCP server. Your AI assistant searches domains without you switching context.

> **Prerequisite:** Install temper first — `brew install jongjinchoi/temper-domains/temper` or `npm i -g temper-domains`.

### Codex

Codex stores MCP server configuration in `~/.codex/config.toml` and shares it between the Codex CLI and IDE extension. See [OpenAI's MCP guide](https://developers.openai.com/codex/mcp). Add temper with:

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

See [Claude Code's MCP guide](https://code.claude.com/docs/en/mcp).

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

See the [local MCP server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

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

## Tool contracts

Required fields are listed below; all other fields are optional. The server uses
stdio and does not expose an HTTP MCP endpoint. Client settings can impose their
own timeouts in addition to Temper's lookup budgets.

| Tool | Required input | Optional input and constraints | Result |
|---|---|---|---|
| `list_supported_tlds` | None | `view`: `presets` (default), `categories`, `extensions`. Categories accepts `facet`: industry/purpose/region only. Extensions accepts `query`, nonempty arrays `industries`/`purposes`/`regions`, `cursor`, integer `limit` 1–100 (default 50). Presets accepts no filters. Unknown fields are rejected. | JSON text and structured catalog/bundles; no availability requests. |
| `search_domain` | `name`: bare name | `extended` boolean or nonempty `tlds` array, never both. Explicit selection: at most 480 combinations. Unknown fields are rejected. | Lookup envelope with every requested candidate. |
| `search_names` | `names`: array of 1–8 bare names | Same selection rules; selected names × extensions must not exceed 480. Unknown fields are rejected. | Lookup envelope plus a per-name text summary. |
| `suggest_domain` | `name`: bare name | No configurable prefix/suffix arguments. | 15 combinations × com/dev/io/app/ai, with a lookup envelope. |
| `check_domain_availability` | `domains`: array of full domains, maximum 100 | `resume`: boolean; only for a user-requested retry of exact prior unresolved domains. No inferred suffixes. An empty array is accepted and returns no rows. | Lookup envelope; a resume makes one pass with a 30s budget. |
| `whois_domain` | `domain`: full domain | No timeout argument; lookup budget 10s. | Text details, confidence/review and lookup error/wait information. |
| `open_registrar` | `domain`: full domain; `registrar`: cloudflare/porkbun/namecheap/vercel | Registrar is required; saved setup preferences do not supply a default. | Text containing the URL and accepted/unconfirmed browser request; failure returns `isError`. No purchase is performed. |

Lookup envelopes contain `schemaVersion`, `rows`, `summary`, and `retryPlan` in
`structuredContent` and a JSON text item, alongside the human-readable text.
Input/operation errors return MCP errors or `isError`; partial lookup failures
remain represented in the rows. A completed call is not proof that every domain
was answered. [Retry eligibility and waits](troubleshooting.md) apply.

### Tools at a glance

| Tool | Description |
|------|-------------|
| `list_supported_tlds` | Browse bundles, classifications and supported extensions offline |
| `search_domain` | Check one bare name across 30, 60 or explicitly selected extensions |
| `search_names` | Check up to 8 bare names across default, extended or selected extensions |
| `suggest_domain` | 15 name combinations × 5 TLDs using RDAP/WHOIS |
| `check_domain_availability` | Check explicit full domains, or user-requested resume of exact prior unresolved domains (up to 100) |
| `whois_domain` | Detailed WHOIS/RDAP info (registrar, dates, nameservers) |
| `open_registrar` | Open purchase page in browser |

MCP output keeps uncertain results visible. Low-confidence availability is
reported as review instead of a final recommendation.
Search, suggestion and availability tools also return `structuredContent` with
`schemaVersion`, `rows`, `summary`, and `retryPlan`, plus the same payload as JSON
text. Use `resume: true` only when the user asks to resume exact unresolved names
from a prior result. Each resumed call makes one pass with a 30s lookup budget;
new limits stop queued work for that server while other servers continue. More
than 100 candidates require an explicit selection or split, never silent truncation
or automatic replay. A cancelled tool call may not deliver its in-progress results.

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
        The browser accepted the Cloudflare opening request.
        Page loading is not verified.
```

When temper runs as a local CLI or MCP server, queries run on your machine. The hosted website demo uses its own API route for live checks.
