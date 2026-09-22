# README header — source files

The PNG banners at `assets/logo/header-light.png` and `header-dark.png`
are rendered from these SVGs. Edit the SVG to change wording, layout,
or colors — then rebuild.

The terminal panel is a simplified illustration, not a CLI screenshot or a live
lookup. It shows the first seven entries of the default 30-TLD bundle; the
extended bundle contains 60 TLDs. Keep these counts and entries aligned with
`src/checker/types.ts`, and example statuses with `scripts/media/fixture.ts`.
Do not add timing claims without supporting measurements.

## Rebuild

Requires `rsvg-convert` (macOS: `brew install librsvg`) and the three
fonts referenced by the SVGs installed on your system:

  * Space Grotesk — https://fonts.google.com/specimen/Space+Grotesk
  * JetBrains Mono — https://fonts.google.com/specimen/JetBrains+Mono
  * VT323 — https://fonts.google.com/specimen/VT323

On macOS, downloading the TTFs and dropping them into `~/Library/Fonts/`
is enough. All three are SIL Open Font License 1.1.

```bash
cd assets/logo/header
rsvg-convert -w 1280 -h 640 source-light.svg -o ../header-light.png
rsvg-convert -w 1280 -h 640 source-dark.svg  -o ../header-dark.png
```

Regenerate both PNGs after editing the SVGs, then visually inspect both themes
for matching content, readable text, and clipping before committing.

## Why two files

GitHub's `<picture>` tag in the root README.md swaps the image based on
the viewer's light/dark mode preference. Both banners keep the zine
metaphor (sticker tile, tilted CRT, flame underline) and only the
palette changes.
