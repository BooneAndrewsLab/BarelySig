# 25. UI font: bundle Archivo or keep the system font?

Written 2026-09-27 before building #58.

## What was asked

The layout mockups use Archivo (the wordmark's typeface) for the
interface, but the app currently sets the system font stack (note 03
decided against webfonts). Decide whether to bundle Archivo to match
the mockups everywhere, at the cost of one more precached file.

## Decision: bundle Archivo

Note 03's "no webfonts" call (repeated in the root `CLAUDE.md`'s stack
list, "no third-party requests besides Matomo … no webfonts, no CDNs")
meant no *third-party-hosted* fonts — a page that reaches out to
`fonts.googleapis.com` or similar at runtime, which would be both a
privacy leak (an outside request on every load) and a offline-support
gap (GitHub Pages, no network guarantee on a lab PC). It was never a
rule against a custom font as such: the graph font already set this
precedent. `scripts/make-graph-font.py` self-hosts a subsetted Arimo as
`public/fonts/arimo-{400,700}.woff`, built from a vendored source
(`design/fonts/Arimo[wght].ttf`) and precached by the PWA — no CDN, no
runtime request, no license cost (OFL). A second small, subsetted,
self-hosted file is negligible next to the WebR runtime this project
already ships (tens of MB, note 01); it doesn't reopen the third-party
question note 03 actually closed.

Archivo itself is free to bundle this way: OFL-1.1
(`design/fonts/Archivo-OFL.txt`), the same family the wordmark already
uses (`design/logo/README.md`), so no new licensing surface. Bundling
it also lets the mockups and the shipped app agree pixel-for-pixel,
which the system font stack (Segoe UI / San Francisco / Roboto — a
different typeface per OS) never can.

## What was built

- **Source, vendored:** `design/fonts/Archivo[wdth,wght].ttf`, the same
  variable font `scripts/make-wordmark.py` outlines the wordmark from
  (that script previously took the source as a command-line argument
  and left it unvendored; it now defaults to this file). Verified
  byte-for-byte against the font used to generate the checked-in
  `src/ui/logoWordmark.ts` — regenerating it from the newly-vendored
  copy produces an identical file.
  `design/fonts/Archivo-OFL.txt` carries its licence; the pre-existing
  Arimo license/metadata files were renamed `Arimo-OFL.txt` /
  `Arimo-METADATA.pb` now that the directory holds two fonts.
- **`scripts/make-ui-font.py`** (modelled on `make-graph-font.py`):
  writes `public/fonts/archivo-ui.woff2`. One difference from the graph
  font: it ships as a **single variable-weight file** rather than
  static instances per weight. The UI sets font-weight 400 through 700
  across `theme.css`/`help.css` (including the odd 650 for the
  wordmark-adjacent brand mark); baking a static instance per value used
  would mean five-plus files for a handful of extra kilobytes of
  variation data. The width axis is pinned to 100 (upright — the
  wordmark's 88 is a condensed display cut, wrong for body text) and the
  weight axis's range is trimmed to 380-720 (a little slack past
  400-700) rather than left at the source's full 100-900, since nothing
  in the UI asks outside that band. Subset to Latin, Latin-1, Latin
  Extended-A and the punctuation/symbols the interface's own copy uses
  (checked against every non-ASCII character literal under `src/ui`).
  Archivo has no Greek or geometric-shapes glyphs, so the notebook
  section disclosure triangle (`▸`/`▾`) and any stray Greek letter fall
  back to the system font per-glyph — normal for a subset webfont,
  and no different from Arimo's own gaps. Output: 37.9 KB.
- **Wired into the CSS:** `src/ui/theme.css` gets an `@font-face` for
  `'Archivo UI'` (`font-weight: 380 720`, so the browser maps every
  weight in range to the one variable file; `font-display: swap` so
  first paint never blocks on the font), and `--font-ui` becomes
  `'Archivo UI', system-ui, -apple-system, 'Segoe UI', Roboto,
  sans-serif` — Archivo first, the same system stack as the fallback it
  already was.
- **PWA precache:** `vite.config.ts`'s `globPatterns` gained the
  `woff`/`woff2` extensions. This was actually a latent gap for the
  *graph* font too — `arimo-{400,700}.woff` lived under `public/` and
  was never matched by the previous pattern
  (`**/*.{js,css,html,svg,png,webmanifest}`), so neither font was
  precached before this change; both now are.
- **Design note index:** this note added to `docs/design/README.md`.

## Why this doesn't contradict note 03

Note 03 recorded "System UI font (no webfonts, CLAUDE.md)" for the data
grid specifically, written when the app had no self-hosted font
infrastructure at all. The infrastructure note 05 then built for graphs
(self-hosted, subsetted, precached, OFL) is exactly the shape this note
reuses for the interface. The root `CLAUDE.md`'s "no webfonts" line
under Stack has been read the same way ever since 05: it rules out a
*third-party* webfont request, not a bundled one.

## What wasn't changed

`src/graphs/text/metrics.json` and the graph font (Arimo) are untouched
— they're a different typeface for a different surface (exported
figures matching Arial's metrics for journals), unrelated to this
decision.
