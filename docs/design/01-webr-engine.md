# 01. WebR engine: channel, hosting, packages

Done, 2026-09-24 (#1, #2). Spike code: branch `spike/webr` (`spike/webr.ts`,
`scripts/spike/`, `.github/workflows/spike.yml`).

## What was asked

Can WebR run the app's statistics from a static GitHub Pages site, which
cannot send COOP/COEP headers? How long does it take to start, which
channel should it use, and are the R packages we need available?

## Decisions

- **WebR 0.6.0 (R 4.6.0), PostMessage channel, no cross-origin
  isolation.** It works in Chromium, Firefox and WebKit on a page served
  exactly as Pages serves one, and the shared-memory channel is no faster
  for our workload (numbers below). No `coi-serviceworker`, no COOP/COEP;
  the PWA worker (#15) only caches.
- **No worker of our own around WebR.** WebR already runs R in its own Web
  Worker and the main thread only holds proxies, so "the main thread
  never blocks" holds as is. `src/engine/webr.ts` starts it; the typed
  `runAnalysis` layer (#14) sits on top on the main thread.
- **Cancel = restart.** Without `SharedArrayBuffer`, `webR.interrupt()`
  does nothing. A runaway analysis is cancelled by closing WebR and
  starting a new one (~2 s). Analyses must therefore be restartable and
  must not keep state in R between calls.
- **Self-hosted, everything.** `scripts/webr/fetch.ts` (run before
  `dev`/`build`) copies the runtime from `node_modules/webr/dist` into
  `public/webr/` and builds a CRAN-like repository in `public/webr/repo/`
  from the WebR repository: the packages in `scripts/webr/packages.json`
  and their `Depends`/`Imports` closure (not `LinkingTo`, which is
  compile-time only), MD5-checked, versions written to
  `public/webr/repo/lock.json`. A user's browser never talks to
  r-wasm.org. Downloads are cached in `node_modules/.cache/webr-repo`.
- **Packages are loaded per analysis, on first use**, not at start-up.

## Packages: what ships and what only checks

All eight packages we planned on exist as WebR 4.6 binaries. What they
cost, with their dependency closure:

| Package | Closure | Size |
|---|---|---|
| mvtnorm | 1 | 0.6 MB |
| emmeans | 5 | 3.6 MB |
| fBasics | 7 | 5.9 MB |
| survival | 3 | 11.2 MB |
| multcomp | 10 | 23.8 MB |
| dunn.test | 52 | 54.6 MB (1.4.0 imports `scrutiny`, i.e. most of the tidyverse) |
| car | 69 | 79.4 MB |
| drc | 77 | 92.0 MB |

So the app ships **base R + mvtnorm + emmeans** (5 packages, 3.6 MB), and
survival joins in Phase 2. multcomp, dunn.test, fBasics, car and drc live
only in the desktop oracle env (`barelysig-r`): where the app does in a few
lines of R what one of them does (Dunn's test, D'Agostino-Pearson K²,
Brown-Forsythe, Dunnett via `mvtnorm` directly), the fixtures compare our
R with that package. "Correct numbers" is kept by the oracle, not by
shipping 100 MB.

**Version skew.** The WebR repository lags CRAN (mvtnorm 1.2-4 vs 1.4-2
on CRAN, emmeans 2.0.3 vs 2.0.4). The oracle env must hold the versions in
`lock.json` for anything the app runs; #3 pins them.

**Dunnett needs a seed.** mvtnorm's deterministic `Miwa()` algorithm only
computes normal probabilities; Dunnett's test uses multivariate *t*, so
it goes through `GenzBretz()`, a randomised quasi-Monte Carlo method. Set
the seed and `abseps` explicitly, and give Dunnett fixtures a tolerance
around 1e-5 absolute rather than 1e-6 relative (#25).

## Measurements

Built with `BASE_PATH=/BarelySig/`, served by `scripts/spike/serve.mjs`
(no COOP/COEP, `Cache-Control: max-age=600`, ETags, gzip — as Pages), or
with `--isolated` for COOP/COEP. `scripts/spike/measure.mjs` loads the
spike page in Playwright, cold (new profile) then warm (reload), and
counts bytes on the server. GitHub Actions `ubuntu-latest`, 2026-09-24:

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| WebR init, cold / warm | 2.5 / 2.4 s | 2.1 / 1.3 s | 2.3 / 2.1 s |
| first `t.test` | 12 ms | 5 ms | 7 ms |
| JS↔R round trip (100 small calls) | 2.4 ms | 1.7 ms | 1.9 ms |
| install mvtnorm | 0.24 s | 0.15 s | 0.16 s |
| install emmeans + first two-way `pairs(emmeans())` | 1.4 s | 0.8 s | 1.1 s |
| bytes, cold / warm | 16.6 / 12.0 MB | 16.6 / 0 MB | 16.6 / 12.1 MB |

- SharedArrayBuffer on an isolated page: the same within noise (Chromium
  warm init 2.0 s vs 2.5 s; everything else equal). Not worth isolation.
- A local Gentoo desktop (Chromium, Firefox): init 3.0–3.4 s cold.
- `t.test(c(1,2,3,4,6), c(3,4,5,7,9), var.equal = TRUE)$p.value` =
  0.11983600770125553 in every browser and in desktop R 4.6.0, all 17
  digits.
- Chromium and WebKit re-download ~12 MB on a warm load (their HTTP cache
  does not keep the large files); Firefox keeps everything. The PWA cache
  (#15) makes warm loads free everywhere instead of relying on it.

## Not yet

- Confirm GitHub Pages actually gzips `.wasm` and the `.so`/`.data.gz`
  files when the site is first published (#36). If not, cold transfer
  grows (R.wasm is 18 MB raw).
- First-load progress indicator: WebR reports nothing during `init()`;
  progress has to come from our own fetches (the PWA worker can prefetch
  with progress) (#14, #15).
