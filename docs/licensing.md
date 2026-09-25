# License and corresponding source

Copyright fromzeroagain OÜ. Temper's own code in this checkout is licensed under
**GNU Affero General Public License, version 3 only (`AGPL-3.0-only`)**.
The unmodified [LICENSE](../LICENSE) is the legal text; this guide is a summary.
Third-party code, data and assets retain their original licenses and notices.

## What this means

- Commercial use is allowed. The license does not prohibit competing products.
- Redistribution must satisfy the applicable notice, license and corresponding
  source requirements. Corresponding source includes necessary build scripts.
- If you modify the program and let users interact with it remotely over a
  network, AGPL section 13 requires offering those users the corresponding
  source of your version. Merely making API requests does not automatically
  relicense an independent caller's entire codebase.
- There is no warranty, subject to the terms of the license.
- Copies already released under Apache-2.0, including v0.6.2 and earlier,
  retain their original terms. Starting with v0.7.0, new releases use
  AGPL-3.0-only. This does not replace old release files or change the license
  of an already installed copy.

See [AGPL sections 1, 4–6 and 13](https://opensource.org/license/agpl-3.0).

## Obtain and rebuild the source

Released npm packages identify their build in `dist/npm/SOURCE.md`. Standalone
archives carry `SOURCE.md` beside the executable. It names the actual build
commit and `temper-source-<commit>.tar.gz` release asset, including for npm
recovery builds made from a later workflow commit. The source manifest records
the included files and hashes. Local dirty builds are labeled as snapshots and
have no claimed public source URL.

After extracting the corresponding archive:

```sh
bun ci
bun run catalog:verify
bun run build:npm
# Native development build, for example:
bun run build.ts bun-darwin-arm64
# Website:
bun run web:build
```

The archived source includes `bun.lock`, tests, scripts, web source, notices and
the preserved catalog inputs under `data-sources/catalog/`. Building consumes
the bundled catalog; regenerating it is described in [catalog maintenance](current.md#extension-catalog-maintenance).
Installation fetches the exact locked dependencies from npm. The lockfile
records their integrity; [legal/inventory.json](https://github.com/jongjinchoi/temper-domains/blob/main/legal/inventory.json)
records the reviewed versions and source locations. npm dependencies remain
external to the npm JavaScript bundle. They are not relicensed as Temper code.

A source archive rebuild is labeled as a local snapshot. Ordinary compilation
works without Git or a source manifest. Public packaging verifies the actual
commit and rejects changes to included source inputs; unrelated local notes do
not block it. Hosted web builds identify their source using deployment metadata.

## Third-party boundaries

[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) preserves collected license
texts, copyright notices and source references. The dependency inventory covers
all lock entries, including non-host optional packages; an uninstalled package's
metadata alone is not a completed notice review.

- Public Suffix List data retains MPL-2.0 and its source attribution. The saved
  input is provided with the source archive. IANA and registrar data retain
  provenance; the project's AGPL declaration is not a claim of ownership of
  those organizations' material.
- Space Grotesk, JetBrains Mono and VT323 retain SIL OFL-1.1. Website font files
  and rendered brand assets do not change those font licenses.
- Bun's executable bundles include Bun and linked third-party libraries.
  Bun documents statically linked JavaScriptCore/WebKit and its rebuild/relink
  procedure in its versioned [license information](https://github.com/oven-sh/bun/blob/bun-v1.4.2/LICENSE.md).
  Building Temper's TypeScript alone does not verify those obligations.

## Distribution review status

The linked-library notice and source/relink review for the Bun version used to
build a native release is not complete. This records an unverified area, not a
finding that Bun conflicts with AGPL or that an existing distribution violates
a license.
Tests and builds do not by themselves settle license obligations.

The collected web inventory also identifies packages without shipped license
texts and non-host optional binaries; see the inventory's open review items.
Review the actual deployment platform before distributing those binaries.
Previously published artifacts and the live website are not changed by edits
in this checkout. Follow [the release checklist](release.md) before publishing.
