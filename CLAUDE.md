# BarelySig

> No license required. Asterisks included.

This file is loaded into every session, so it holds only what changes how
the code is worked on: decisions, rules, lessons, pointers — not status.
What a release did goes in its Release notes, why in a design note, what
is left in an issue. `src/claudeMd.test.ts` fails the build if it regains
a Status section or names a version other than `package.json`'s.

## What this is

Free, open-source, fully browser-based statistics and graphing for wet-lab
scientists — a GraphPad Prism alternative. Sibling of PlasmidPop
(`../PlasmidPop`), built the same way: no install, no backend, no account,
data never leaves the computer. Users are bench scientists who don't script.

**Principles, in priority order:** (1) correct numbers — every output
matches a reference implementation; (2) Prism-familiar workflow; (3)
publication-quality graphs with zero formatting; (4) private by default;
(5) the UI never freezes — heavy work runs off the main thread.

## Stack

- TypeScript strict, React 19 + Vite, ESLint `strictTypeChecked`, Prettier,
  `@/` → `src/`. Vitest (node env; `// @vitest-environment jsdom` for
  components), Playwright e2e. MIT.
- **Stats engine: WebR** in its own worker, PostMessage channel, no
  cross-origin isolation (note 01); WebR, R and package versions are pinned
  in `src/engine/lock.json`. Cancel = restart WebR, so analyses keep no
  state in R. Self-hosted in `public/webr/` via `npm run webr:fetch`. The
  app ships base R plus the short list in `scripts/webr/packages.json`;
  multcomp, dunn.test, fBasics, car, drc etc. are oracle-only.
- **Engine interface:** `runAnalysis(request): Promise<AnalysisResult>`,
  one typed request/result pair per analysis. No R code outside
  `src/engine` and `src/analyses`; keep WebR swappable behind it.
- **Graphs:** React-rendered SVG; D3 only for scales/axes/shape
  generators, never DOM. Default theme seaborn "ticks" style; themes are
  data (`GraphTheme`) under per-element overrides. Exports embed a figure
  recipe of *resolved* values, never just a theme name (note 05).
- **Data grid:** our own; flawless tab-separated paste from Excel is a
  requirement.
- **State:** one serializable project store; tables → analyses → results →
  graphs form an explicit DAG, recomputed automatically on edit.
- **Project file:** versioned JSON `.bsig` with migrations. Saving is
  download-only (never a kept File System Access handle); autosave to
  IndexedDB.
- Static GitHub Pages hosting; PWA (`vite-plugin-pwa`), WebR runtime-cached
  cache-first. No third-party requests besides self-hosted Matomo
  (`src/ui/analytics.ts`, `EVENTS` allow-list, never user data; unset env =
  no-op). A dependency published only as a tarball is vendored
  (`vendor/README.md`), never fetched from a CDN.

## Domain rules that cause bugs

- Missing values are `null`, never `0` or `NaN`, grid → engine → file.
- Raw replicates vs summary data (mean/SD/n): never feed means to a test
  expecting raw values, or treat an SD column as data.
- Paired tests pair by row; a missing value on either side drops the pair.
- Say SD vs SEM vs 95% CI on every error bar and results table.
- P-values formatted as Prism does (`P < 0.0001`); tiny p-values keep
  their magnitude through parsing.
- Asterisks: Prism thresholds (ns ≥ 0.05, * < 0.05, ** < 0.01,
  *** < 0.001, **** < 0.0001), configurable, stated on the graph.
- Multiple comparisons report the *adjusted* p and name the correction.
- Tails and Welch/Student defaults match Prism and are always stated.
- Text a user reads about statistics is part of correctness: "in either
  direction" for two-tailed, "no evidence of a difference", never "the
  same"; P never contradicts its asterisks.

## Correctness (non-negotiable)

No analysis ships without passing its validation tests.

- Each analysis has `src/analyses/<id>/oracle.R` calling `fixture(...)`
  per case; `npm run oracle:generate [id]` runs it in desktop R
  (`barelysig-r`) and writes `fixtures/<case>.json`. Never edit fixtures
  by hand. `npm run oracle:pin` matches the env's package versions to
  `public/webr/repo/lock.json`.
- `src/test/parity.test.ts` runs each fixture's recorded code in the app's
  WebR under Node vs desktop R; each analysis's own test runs app code on
  the same fixtures (`src/test/fixtures.ts` `mismatches()`). A `call`
  needing a reference-only package, or `parity = FALSE` (too slow for
  WebR), skips parity.
- Oracle references must be **independent** of the app's `analysis.R`
  (textbook formulas or another package). Summary-data cases are checked
  against raw values with that mean/SD/n. Fixture `options` carry the
  case's settings.
- Tolerance 1e-6 relative (absolute when expected is 0); Dunnett gets a
  looser stated one. Cover missing values, unequal n, ties, n = 2, zero
  variance, outliers, very small p-values.
- Compare defaults and outputs with Prism (GraphPad's guides); record
  intentional differences in the design note.

## Tooling and releasing

- Node: `export PATH=$HOME/Programs/miniconda3/envs/node/bin:$PATH`
- `npm run check` gates every commit: `npm run check && git commit …`. It
  runs typecheck, lint, format, WebR staging and the tests; the slow parity
  suite only when analysis/engine/harness files changed vs origin/main
  (`PARITY=1` forces, `npm run test:parity` runs it alone; CI and releases
  always run it; note 44). `npm run e2e` runs Playwright against a
  production build.
- R oracle: `mamba run -n barelysig-r Rscript …` (R at WebR's version;
  packages from CRAN inside the env). Record package versions in fixtures
  and check the package exists for WebR. Run `oracle:generate` with the
  node env on PATH (it runs Prettier).
- WebR pin `src/engine/lock.json`: change only with
  `npm run webr:fetch -- --update-lock`, then `oracle:pin`,
  `oracle:generate` and the parity test.
- Font/brand scripts (`scripts/make-*.py`, `make-icons.sh`,
  `seaborn-reference.py`) need Python with fonttools (see each script);
  sources and their READMEs in `design/`.
- **Releasing:** current is 1.0.0 (2026-09-28). Bump `package.json` and
  `CITATION.cff` together, add `docs/releases/X.Y.Z.md`, publish a GitHub
  Release; **the site deploys only then** (`deploy.yml`) and the release
  gets a Zenodo DOI under the concept DOI in `CITATION.cff`. A push to
  main reaches no user until a release carries it.

## Where things are written down

- **Design notes `docs/design/NN-*.md`** (index: its README): what was
  asked, what was built and why. Write one *before* implementing anything
  significant; "note N" / "item N" in code means that note, read it before
  changing that area.
- **Open work:** GitHub Issues and milestones
  (`gh api repos/BooneAndrewsLab/BarelySig/milestones`); the numbered
  milestones go in order. Never a to-do list here or in a note.
- **User guide:** `docs/guide/NN-*.md`, bundled by `src/ui/help/guide.ts`
  (`GUIDE` lists the pages, `ANALYSIS_PAGE` maps each analysis kind to
  its page).
- **What a release did:** GitHub Releases and `docs/releases/`.

```
src/model      typed tables, project, dependency graph
src/engine     worker, WebR bridge
src/analyses   one folder per analysis: types, R snippet, parser, oracle, fixtures
src/graphs     renderers, formatting model, export
src/ui         app shell, navigator, grid, inspectors, help, analytics
src/io         save/load, imports
scripts/       wordmark, fonts, icons, R oracle, simulations, WebR staging
design/        logo, icon and font sources (each with a README)
```

## Lessons (things that bit)

- **WebR returns a named number as an object** (`{"1": 0.36}`): `unname()`
  anything from `table()`, `cbind(i, …)` or named vectors.
- **A statistic whose true value is 0** is rounding noise; nudge fixture
  data off such points. Compute SS as distances between fits, not RSS
  differences.
- **Randomised QMC can't give small P** (mvtnorm cancels digits): Dunnett
  and T3 use fixed Gauss-Legendre rules (note 06).
- **R 4.6 `wilcox.test`** gives exact P with ties; check it on untied data
  only.
- **nlme nesting:** don't use `~1 | a/b` when `a` is fixed; collapse
  group×replicate into one factor, then `~1 | unit` (note 13).
- **Huynh-Feldt/Geisser-Greenhouse** are in base `stats` (`anova.mlm`,
  `test = "Spherical"`); clamp epsilons to `[1/(k−1), 1]` (note 17).
- **Oracle/app disagree by ~1/K on one family of P?** Suspect a count
  mismatch in what feeds the shared math (note 17).
- **Simulate a test's false-positive rate before choosing it** (note 14,
  `scripts/sim/`).
- **Adding an analysis kind:** grep every place kinds are matched
  (results view, brackets, margin notes, Analyze dialog, `.bsig`) —
  `kind === X && <View/>` isn't exhaustive and compiles clean.
- **First analysis to load a package:** test it in a real dev-server
  browser, not just `npm run test` (Vite's SPA fallback once hid a 404).
- **Property tests:** when a model type gains fields, make
  `src/test/modelArbitraries.ts` generate them (and count that it does);
  break the code once to prove a new test can fail. Serialisers write
  fields explicitly in a fixed order (`bsig.ts`).
- **Performance:** test with real-sized files (thousands of rows); graphs
  are cached per input object (`src/graphs/cache.ts`), so keep derived
  objects identity-stable. Measure freezes in a production build before
  moving work (note 11).
- **jsdom lacks** `ResizeObserver`, `matchMedia` (stubbed in
  `src/test/setup.ts`), canvas, `Blob.stream()`; IndexedDB is
  `fake-indexeddb`. UI tests stub the engine with
  `setResults(new ResultsBridge(store, { runner }))`.
- **Stale dev server** after many edits or a `webr:fetch`: restart Vite.
- **Prettier rewrites `*italic*` as `_italic_`** in Markdown; the guide
  parser reads both and guide lists stay flat.

## Conventions

- One short-lived branch per issue, fast-forwarded into `main` when green;
  hotfixes from the last release tag. Small commits, `Fixes #N`.
- Any user-visible change updates its user-guide page in the same commit;
  a new analysis gets a page (or section) and an `ANALYSIS_PAGE` entry.
- File follow-ups as issues, not "not yet" lists in notes.
- No `any`; discriminated unions for table, analysis and graph types.
- Write UI text for a grad student with no statistics background: plain
  language, jargon explained in place.
