# Extension discovery and selection

[Back to the README](../README.md) · [CLI reference](cli.md)


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
updates while browsing. See [catalog maintenance](current.md#extension-catalog-maintenance).

Each extension separates its lookup route from recorded server verification.
`response-confirmed` means a response was observed with the recorded checker and
route; `needs-recheck` means those changed, and `not-checked` means no matching
attempt has been recorded. `observed-error` preserves a failed observation.
These records do not guarantee current server availability or a purchase.
Classification records include the source, capture date and review rationale.
Unclassified entries remain browsable and selectable; a deferred review states
what was inspected or could not be retrieved.
