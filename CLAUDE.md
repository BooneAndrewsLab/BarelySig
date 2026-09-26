# BarelySig — Project Handoff

> No license required. Asterisks included.

## What this is

BarelySig is a free, open-source, fully browser-based statistics and
graphing tool for wet-lab scientists, positioned as an alternative to
GraphPad Prism. Sibling of PlasmidPop (`../PlasmidPop`, a browser-based
SnapGene alternative) and built the same way: no install, no backend, no
account, and the user's data never leaves their computer.

**Who it's for:** bench scientists (grad students, postdocs, technicians,
PIs) who want a bar graph with error bars and significance asterisks, a
t-test or ANOVA they can trust, or an EC50 from a dose-response curve. They
do not script and should never need to.

**Principles, in priority order:**

1. **Correct numbers.** Every statistical output matches a reference
   implementation. A wrong p-value in a published paper is the worst
   possible outcome for this project.
2. **Prism-familiar workflow.** Pick a table type, enter data, click an
   analysis, get a linked graph. A Prism user feels at home in minutes.
3. **Publication-quality graphs.** Click any graph element to format it;
   export vector graphics a journal will accept. A graph with zero
   formatting already looks publishable.
4. **Private by default.** All computation runs locally. No accounts, no
   uploads; usage statistics are coarse and anonymous (see Analytics).
5. **Fast enough on a lab laptop.** The UI never freezes; heavy
   computation runs off the main thread.

## Stack (decided)

- **Language:** TypeScript everywhere, strict (see `tsconfig.base.json`).
- **UI:** React 19 + Vite. Config mirrors PlasmidPop: ESLint
  `strictTypeChecked`, Prettier, `@/` → `src/`, `BASE_PATH` for the Pages
  base, `__APP_VERSION__` from `package.json`.
- **Stats engine:** an established runtime in WebAssembly, not hand-written
  statistics — hand-rolled tests invite subtle errors (tie and continuity
  corrections, df approximations, multiple-comparison adjustments).
  **WebR** 0.6.0 (R 4.6.0), PostMessage channel, no cross-origin isolation
  (item 01). WebR runs R in its own worker; cancel = restart WebR (no
  interrupt without `SharedArrayBuffer`), so analyses keep no state in R
  between calls. Self-hosted: `npm run webr:fetch` (before dev/build)
  stages the runtime and a pinned package repository in `public/webr/`.
  The app ships **base R + mvtnorm + emmeans** only
  (`scripts/webr/packages.json`), loaded per analysis on first use;
  heavier reference packages (multcomp, dunn.test, fBasics, car, drc) are
  oracle-only, used to check our own R.
- **Engine interface:** `runAnalysis(request: AnalysisRequest):
  Promise<AnalysisResult>`, one request/result type pair per analysis. No R
  code outside `src/engine` and `src/analyses`. Each analysis module holds
  input validation, the R snippet, result parsing into typed output, and
  its validation fixtures.
- **Graphs:** React-rendered SVG; D3 for scales, axis math and shape
  generators only, never D3 DOM manipulation. SVG is the source of truth,
  so vector export is direct.
- **Data grid:** our own. Prism tables (grouped subcolumns, summary-data
  columns, typed headers) don't fit off-the-shelf grids. Keyboard
  navigation, multi-cell selection and **flawless tab-separated paste from
  Excel** are requirements — that is how most users will enter data.
- **State:** one serializable project store (tables, analyses, graphs and
  the dependency graph).
- **Project file:** versioned plain JSON, extension `.bsig`, with schema
  migrations. Zip it only if it ever has to embed binary assets.
- **Saving: download only**, as PlasmidPop (its item 24): a project leaves
  the app as a download, never through a kept File System Access handle,
  so every browser behaves the same. `showSaveFilePicker` may be used for
  that one write where it exists; the handle is dropped straight after.
  Opening reads a `File`. Autosave to IndexedDB is what protects work.
- **Hosting:** static files on GitHub Pages; no server, database or API.
  Autosave to IndexedDB. GitHub Pages can't set COOP/COEP headers, so
  `SharedArrayBuffer` is unavailable unless `coi-serviceworker` is used.
  Large assets (the WebR runtime) are fetched once, cached, and self-hosted
  with the site, with a clear first-load progress indicator.
- **PWA**, as PlasmidPop (`vite-plugin-pwa`): installable and offline.
  Here it pays for itself — the WebR runtime and packages (tens of MB) are
  downloaded once and served from cache after, and the app works on a lab
  PC with flaky network. The app shell is precached; WebR files are
  runtime-cached (cache-first, keyed by WebR version) so they don't block
  the service worker's install. There is one service worker per scope, so
  if the spike picks cross-origin isolation, the PWA worker adds the
  COOP/COEP headers itself instead of a separate `coi-serviceworker`.
- **No third-party requests** besides Matomo: no webfonts (the wordmark is
  outlined by `scripts/make-wordmark.py`), no CDNs.
- **Analytics:** Matomo, self-hosted, as in PlasmidPop
  (`src/ui/analytics.ts`, ported from there). Page views and coarse
  feature events from the `EVENTS` allow-list (e.g. "ran t-test", "exported
  svg"), never data values, titles, file names or anything the user typed.
  Cookieless, honours Do-Not-Track, IP anonymisation on. Build-time config
  `VITE_MATOMO_URL`, `VITE_MATOMO_SITE_ID`; unset = no-op, so local and CI
  builds never phone home.
- **Licence:** MIT (`LICENSE`, `package.json`), matching PlasmidPop.
- **Tests:** Vitest (node env by default; `// @vitest-environment jsdom`
  for components); Playwright for end-to-end workflows once there is UI.

## Typed data tables (the central idea)

The user picks a **table type** when creating a table; it fixes the layout,
which analyses are offered and which graphs are available.

| Table type | Layout | Typical use | Phase |
|---|---|---|---|
| Column | Each column a group; rows are replicates | t-test, one-way ANOVA | MVP |
| Grouped | Row factor × column factor, subcolumns for replicates | Two-way ANOVA, grouped bars | MVP |
| XY | X column, Y data sets, optional replicate subcolumns | Dose-response, time courses, regression | 2 |
| Contingency | Counts in a rows × columns grid | Chi-square, Fisher's exact | 2 |
| Survival | Time, event/censored, group | Kaplan-Meier, log-rank | 2 |
| Parts of whole | Values that sum to a total | Pie/donut | Later |
| Nested | Groups containing subgroups | Nested t-test / ANOVA | Later |
| Multiple variables | Rows are cases, columns variables | Correlation matrices, multiple regression | Later |

- Discriminated unions per table type; serializable to JSON.
- Tables hold raw replicates **or** summary data (mean with SD/SEM and n).
  Analyses know which they receive; tests valid from summary data (e.g.
  t-test from mean/SD/n) support it, as Prism does.
- Column/row titles, units and per-data-set colours live on the table, not
  the graph.

**Live linking.** Data tables, analyses, results, graphs and layouts form
an explicit DAG in the project model (not ad-hoc event wiring):
`Data table → Analysis → Results → Graph → Layout`, plus tables plotted
directly. Editing a cell invalidates everything downstream; recomputation
is automatic and debounced. Analyses can chain (normalize → fit).

## Domain rules that cause bugs

- Missing values are `null`, never `0` or `NaN`, from the grid through the
  engine to the file. An empty cell and a zero are different data.
- Replicates vs summary data: never feed means to a test that expects raw
  values, or treat an SD column as data.
- Paired tests pair by row; a row with a missing value on either side
  drops out of the pair, not just one side.
- SD vs SEM vs 95% CI: say which on every error bar and results table.
- P-values: report exactly as Prism formats them (e.g. `P < 0.0001`, not
  `0`); very small p-values keep their magnitude through parsing — never
  round-trip through a format that underflows or truncates.
- Significance asterisks: Prism's default thresholds (ns ≥ 0.05, * < 0.05,
  ** < 0.01, *** < 0.001, **** < 0.0001) with a user-configurable scheme,
  and the scheme is stated on the graph's legend/notes.
- Multiple comparisons: the reported p is the *adjusted* one, and the
  results say which correction was used.
- One-tailed vs two-tailed and Welch vs Student: defaults match Prism and
  are always stated in the results.

## Correctness (non-negotiable)

**No analysis ships without passing its validation tests.**

- **Oracle.** Each analysis has `src/analyses/<id>/oracle.R`, which calls
  `fixture(name, input, expr, setup, packages, tolerance, note)` per case;
  `npm run oracle:generate [id]` runs it in desktop R (`barelysig-r`, R
  4.6.0, the version WebR ships) and writes
  `src/analyses/<id>/fixtures/<case>.json`: `input` (named columns, `null`
  = empty cell), `expected` (17 significant digits; `"NaN"`/`"Inf"` as
  strings), `reference` (R version, package versions, the `setup` and
  `call` code verbatim), `tolerance`, `note`. Never edit fixtures by hand.
- **Package versions match WebR.** `npm run oracle:pin` installs into the
  env exactly the versions in `public/webr/repo/lock.json` (from the CRAN
  archive where needed), plus the reference-only packages.
- **Two tests read every fixture.** `src/test/parity.test.ts` runs the
  recorded code in the app's own WebR (under Node, `src/test/webrNode.ts`)
  and compares with desktop R — engine drift is caught before any app code
  runs. Each analysis's own test then runs the app's code on the same
  fixtures. Comparison: `src/test/fixtures.ts` `mismatches()`.
- Cross-check against the worked examples in GraphPad's Statistics Guide
  and Curve Fitting Guide where they exist.
- Tolerance: 1e-6 relative for statistics and p-values (absolute when the
  expected value is 0). Relative comparison keeps tiny p-values honest: 0
  against 1e-18 fails. Dunnett (randomised QMC) gets a looser, stated one.
- Edge cases in every fixture set: missing values, unequal group sizes,
  ties, n = 2, zero variance, extreme outliers, very small p-values.
- CI runs them on every push; a failing validation test blocks release.

## Graphs

- **MVP:** Column tables — dot plot (scatter with mean ± error), bars with
  error bars and optional points, box-and-whisker, violin. Grouped tables —
  grouped bars (interleaved or separated). Error bars SD, SEM, 95% CI,
  range.
- **Significance brackets** drawn from analysis results. Heavily used —
  make it excellent.
- **Click-to-format:** axis, tick labels, title, data set, error bars,
  legend, brackets. Axis range, ticks, log scale, number format; fonts,
  sizes, colours, line widths, symbols, fills, bar widths, spacing.
- **Look: modern and slick, seaborn-grade.** The default theme is the
  seaborn "ticks" style rather than Prism's: despined (no top/right axis
  lines), light outward ticks, generous whitespace, a clean sans-serif,
  no chart junk. Colour-blind-safe categorical palette by default (in the
  spirit of seaborn's `colorblind`/`deep`), perceptual sequential and
  diverging maps (viridis-family) for continuous data. Bars and boxes get
  a soft fill with a darker edge of the same hue; points are slightly
  translucent with a thin edge, so overplotting reads. A graph with zero
  formatting must look like it came out of a well-tuned seaborn script
  *and* satisfy journals (vector, font sizes ≥ 6–7 pt at final size, line
  widths that survive reduction).
  - Seaborn-inspired plot kinds are first class, not afterthoughts:
    beeswarm/strip for individual points (no overlap, deterministic
    layout), violins from KDE with inner quartiles or points, box +
    points, point-and-error ("pointplot") summaries, and raincloud later.
  - Themes are data: a `GraphTheme` object (fonts, sizes, palette, line
    widths, despine, grid) applied under per-element overrides. Ship
    "Modern" (default) and "Classic" (Prism-like, boxed axes) at least;
    user-saved styles come later.
  - Record the style decisions and a reference figure in a design note
    before M4; compare against seaborn renders of the same data.
- **Export:** SVG and PNG (300/600 DPI) with exact physical size (in/cm)
  for journal column widths; PDF/TIFF later.
- **Reproducible figures (#43):** every export embeds its *figure
  recipe* (the graph, what it depends on, the resolved theme, app and
  engine versions), so opening the exported SVG/PNG restores the exact
  setup — on by default, with a checkbox to leave the data out. Every
  export also says in its file metadata (never on the image) that it was
  made with BarelySig, which version, and where to open it to edit. The
  `.bsig` keeps an export history of frozen recipes. Store
  resolved values, never just a theme name — changing a default must never
  change an old figure.

## Milestones

On GitHub (`gh api repos/BooneAndrewsLab/BarelySig/milestones`), one issue
per piece of work, versioned as PlasmidPop's are:

| Milestone | Headline |
|---|---|
| 0.1 — Foundations | WebR spike (note 01), package availability, R oracle + fixture harness |
| 0.2 — Data model | Note 02; Column + Grouped tables, dependency graph, `.bsig` |
| 0.3 — Data entry | App shell, own grid, Excel paste, summary data, undo, autosave |
| 0.4 — Analysis pipeline | Engine worker, PWA cache, descriptive stats, t-tests, results sheets |
| 0.5 — First graph | Style note, renderer, bar/beeswarm, brackets, SVG/PNG export |
| 0.6 — MVP statistics | Nonparametric, one-/two-way ANOVA + post-hoc, normality, test chooser |
| 1.0 — Formatting and first release | Inspector, box/violin, grouped bars, guide, e2e, public release |
| Phase 2 — Serious contender | Split into versions after 1.0 |

**Phase 2:** XY tables with nonlinear regression (dose-response library,
EC50/IC50 with CIs, constraints, shared parameters, extra sum-of-squares /
AICc comparison; validated against R and the Curve Fitting Guide); linear
regression and correlation; contingency (chi-square, Fisher's exact);
survival (Kaplan-Meier, log-rank); multi-graph layouts with panel labels;
**Prism `.pzfx` import** (XML; a major adoption lever).

**Later:** Nested and Multiple-variables tables, parts-of-whole graphs, axis
breaks, saved graph styles and journal templates, PDF/TIFF, normalize /
transform / baseline analyses, feeds from sibling tools (plate layouts,
qPCR, plate readers).

**Non-goals for now:** full Prism parity, real-time collaboration, cloud
storage, accounts, mobile-first layouts (tablets must not break; desktop is
the target).

## Status (2026-09-26)

- Repo: `BooneAndrewsLab/BarelySig`, private, **not published yet**.
  `deploy.yml` is ready: on a published GitHub Release it runs the check
  and the e2e tests at the Pages base, builds with the Matomo env
  (`VITE_MATOMO_URL=https://boonelab.ccbr.utoronto.ca/matomo/`,
  `VITE_MATOMO_SITE_ID=7`) and deploys. Version 1.0.0, `CITATION.cff`,
  release notes in `docs/releases/1.0.0.md`. Left to the user (#36):
  make the repo public, enable Pages (source: GitHub Actions), connect
  Zenodo, publish the release; then add the DOI to `CITATION.cff`.
- Scaffold done: Vite/React/TS, ESLint, Prettier, Vitest, CI, logo
  lockup page, Matomo module (no site id yet).
- `barelysig-r` conda env created (R 4.6.0 + oracle packages).
- Milestones and issues #1–#42 on GitHub.
- 0.1 done: WebR spike (item 01, #1, #2); R oracle, fixture harness and
  engine parity test (#3).
- 0.2 done: design note 02 accepted (#4); typed tables, named edits,
  invariants and analysis-input selectors (#5); derived dependency
  graph, input hashes and debounced recompute (#6); `.bsig` with
  migrations and fast-check round trips (#7).
- 0.3 (data entry, note 03): app shell and navigator (#8), own data grid
  with Excel keys (#9), paste/copy (#10, code done; open until real
  clipboard captures replace the constructed fixtures, see the issue),
  summary data incl. mean with limits (#11), undo/redo (#12), autosave to
  IndexedDB, open and download (#13). `npm run dev`, then `/?capture`
  records a clipboard as a fixture.
- 0.4 (analysis pipeline, note 04): engine over WebR with cancel,
  restart and plain errors, packages pinned in `src/engine/lock.json`
  (#14); PWA with WebR cached on first use (#15); descriptive statistics
  (#16) and t tests (#17) with oracle fixtures; results sheets, the
  Analyze dialog and saved results (#18).
- 0.5 (first graphs, note 05): Modern and Classic themes with Arimo
  (Arial metrics) bundled; pure layout → scene → one SVG serialiser;
  bars and beeswarm dots with error bars from R (a graph's virtual
  summary analysis); significance brackets from t tests; SVG/PNG export
  at physical size; figure recipes embedded in exports and an export
  history (#43). Follow-ups: #44 (real clipboard captures), #45 (drag
  brackets), #46 (engine-change comparison).
- `webr:fetch` skips when `public/webr/.stamp` matches; never rebuild
  `public/webr/` under a running dev server by hand (it then serves
  index.html for the package files).
- Close project (#47): back to the start screen, which lists the
  projects kept in this browser.
- 0.6 done (MVP statistics, note 06): Mann-Whitney and Wilcoxon with
  exact P even with ties (#24); one-way ANOVA with Tukey, Dunnett, Šidák,
  Bonferroni, and Games-Howell / Dunnett T3 / Tamhane T2 after Welch
  (#25); Kruskal-Wallis with Dunn (#26); two-way ANOVA, Type III, with
  comparisons per row/column (#27); normality tests, offered alongside
  parametric tests (#28); "Help me choose" in the Analyze dialog (#29).
  Brackets come from every pairwise analysis, one per comparison.
  Follow-ups: #48 (exact Spearman), #49 (exact Kruskal-Wallis), #50
  (repeated measures, Friedman), #51, #52 (two-way edge cases).
- 1.0 built (note 07): click-to-format inspector and draggable brackets
  (#30, #45); box and violin plots from an internal `graph-summary`
  analysis with its own oracle (#31); grouped bars with two-way brackets
  (#32); exact Kruskal-Wallis P for small samples (#49); "numbers under a
  newer engine" notice for reopened figures (#46); user guide in
  `docs/guide/` shown by the ? button (#34); usability pass (#33, follow-ups
  #53, #54); Playwright e2e in CI (#35). Exact Spearman moved to Phase 2
  (#48). Open in 1.0: #36 (the user's release steps) and #44 (real
  clipboard captures, needs the apps).
- Milestone 9 "UI revamp" (created 2026-09-25): four layouts were
  mocked up (https://claude.ai/artifact/V7PHbi4aa9ZcTFyF8SWGc8); the
  notebook (C) was picked. Built (note 08): one page per experiment (a
  table and everything made from it) with numbered sections, a sidebar
  of experiments with thumbnails (#55), and plain-language margin notes
  beside each section, hideable (#56). Open: #57 (key numbers first),
  #58 (UI font). The old navigator and sheets are gone: `Sheet` still
  names what to show, the page scrolls to its section.
- Project manager (#59, note 09): the start screen lists every project
  kept in this browser (contents, "edited 3 hours ago", "not
  downloaded", search), each with Open / Rename / Duplicate / Download /
  Delete…; deleting asks, and warns when there is no downloaded copy
  (a `downloaded` flag per row). The start screen warns when the
  browser's storage is best-effort and asks it to persist from a click
  (`src/ui/state/storageSafety.ts`).
- Open a data file (#60, note 10): Open…, drop, the start screen and New
  experiment take `.csv/.tsv/.txt/.xlsx/.xls/.xlsm/.xlsb/.ods/.numbers`;
  a dialog guesses the layout (columns, two factors, summary, long →
  reshaped), previews the table with non-numbers struck through, and
  Create adds one experiment (one undo). `src/io/import/`: our delimited
  parser (the paste parser, any separator), SheetJS 0.20.3 vendored in
  `vendor/` and loaded lazily in a worker, pure `guess.ts`. Workbook
  fixtures come from `scripts/make-import-fixtures.py` (openpyxl, odfpy,
  xlwt), never from SheetJS itself.
- Graphs drawn in a worker (#62, note 11): `src/graphs/render.worker.ts`
  lays out and paints the scene (`paint.ts`, held to `svg.ts` mark by
  mark) to a PNG; hit regions and outlines come back as typed arrays
  (`drawn.ts`); the latest request per figure wins (`renderer.ts`); a
  spinner while drawing. Without a worker canvas (jsdom, old browsers)
  the figure is the inline SVG, drawn on the main thread. Exports are
  still the SVG. Work in progress never moves the page (note 11, 5a):
  "Calculating…"/"Updating…" is a note over the faded figure or result,
  which keeps its last complete version meanwhile; banners only for
  problems. Left: the "points were squeezed" caption line appears once a
  big graph is first drawn (it comes from the worker's layout).
- Next: UI revamp as the user files ideas; then the release (#36).

## Tooling

- Node comes from the `node` conda env:
  `export PATH=$HOME/Programs/miniconda3/envs/node/bin:$PATH`
- `npm run e2e`: Playwright end-to-end tests against a production build
  (`e2e/`, about a minute with the build; CI runs them as their own job).
- `npm run check` (typecheck, lint, format, stage WebR, test) before every
  commit;
  `npm run dev`, `npm run build`. Gate commits on its exit status
  (`npm run check && git commit …`): a failing check once reached main
  because the commit ran regardless.
- R oracle: conda env `barelysig-r` — `r-base=4.6.0`, `compilers`, `make`,
  `pkg-config` from conda-forge; R packages from CRAN inside it, because
  conda-forge hadn't rebuilt them for R 4.6 (2026-09): jsonlite, multcomp,
  mvtnorm, emmeans, dunn.test, car, fBasics, survival, drc, coin,
  onewaytests. Run with
  `mamba run -n barelysig-r Rscript …`. Add packages as analyses need
  them (`install.packages` inside the env), record their versions in the
  fixtures, and check the same package exists for WebR. A fixture's
  `check` (note 06) may use reference-only packages; a `call` that needs
  one is skipped by the parity test, and so is a fixture written with
  `parity = FALSE` (a brute-force reference too slow for WebR; note 07).
  `oracle:generate` formats the
  fixtures with Prettier, so run it with the node env on PATH.
- The wordmark is regenerated by `scripts/make-wordmark.py` from Archivo's
  variable TTF (needs `fonttools uharfbuzz`).
- Brand sources are in `design/` (logo and icon READMEs there);
  `public/icons.svg` is the icon sprite (`<use href="icons.svg#bs-NAME">`,
  accent via `--bs-accent`).
- Graph font: `scripts/make-graph-font.py` rebuilds `public/fonts/` and
  `src/graphs/text/metrics.json` from `design/fonts/Arimo[wght].ttf`;
  `scripts/seaborn-reference.py` renders note 05's reference figures;
  `scripts/make-icons.sh` the PWA icons. Any Python with fonttools /
  seaborn runs them.
- WebR engine pin: `src/engine/lock.json`. `webr:fetch` fails on drift;
  change only with `npm run webr:fetch -- --update-lock`, then
  `oracle:pin`, `oracle:generate` and the parity test.

## Lessons (things that bit)

- **Oracle references must be independent** of the app's `analysis.R`:
  textbook formulas or another package, checked in `oracle.R` against
  R's own functions before a fixture is written (the check caught a
  `1 - pf()` that lost a small P's digits). Summary-data cases are
  checked against raw values with that mean, SD and n. Fixture
  `options` carry the analysis settings a case uses.
- **Property tests earn their keep:** they found a subnormal-value axis
  asking d3 for billions of ticks, export records losing fields on save,
  and a copy/paste quoting bug. When a model type gains fields, make
  `src/test/modelArbitraries.ts` generate them, or the round-trip
  property can't see a codec that forgot them. Break the code once to
  prove a new test can fail.
- **Serialisers write fields explicitly, in a fixed order** (`bsig.ts`):
  spreading objects made the text depend on key order.
- **jsdom lacks** `ResizeObserver`, `matchMedia` (stubbed in
  `src/test/setup.ts`), canvas, and `Blob.stream()`; IndexedDB is
  `fake-indexeddb`, shared across the tests of one file. UI tests
  replace the engine with `setResults(new ResultsBridge(store, { runner }))`.
- **The dev server can go stale:** after many edits or a `webr:fetch`
  that rebuilt `public/webr/`, restart Vite (a stale one served
  `index.html` for WebR's packages: "need to see wasm magic number").
- **A named number comes back from WebR as an object** (`{"1": 0.36}`),
  while jsonlite writes it as a number: `unname()` anything built from
  `table()`, `cbind(i, …)` or named vectors, in app code and oracles.
- **A statistic whose true value is 0** (the skewness of symmetric data,
  a main effect with equal means) is rounding noise that can't be
  compared relatively; fixtures nudge their data off such points. Compute
  SS as distances between fits, not differences of RSS, so noise can't go
  negative.
- **Randomised QMC can't give small P values:** mvtnorm computes
  1 − P(inside), which cancels digits (5e-12 was off by 4.5e-5). Dunnett
  and T3 use fixed Gauss-Legendre rules instead (note 06).
- **R 4.6 changed `wilcox.test`**: exact P with ties, and CIs by
  inverting that test; check against it only on untied data.
- **A round-trip property only sees what the generator makes:** graphs
  were 9 in 200 sessions, so a codec dropping a new format field passed.
  Count what the generator produces when adding fields (note 07).
- **Prettier rewrites `*italic*` as `_italic_` in Markdown,** so the guide
  parser reads both; the guide's lists are flat (no nesting).
- **Brute-force oracle references can be too slow for WebR:** write them
  with `parity = FALSE`; the analysis's own test still runs them there.
- **Test with a real-sized file:** a 3,656-row screen froze the page: the
  beeswarm was cubic and nothing drawn was cached, so every render (and
  every store change, via the results bridge) redid it all. Graphs are now
  cached per input object (`src/graphs/cache.ts`); keep derived objects
  identity-stable, and time new per-point code at a few thousand points.
- **Measure a freeze before moving work:** with 14,600 marks, parsing and
  laying out the SVG in the page cost as much as our layout, and an SVG
  `<img>` is decoded on the main thread too (0.6 s); only a raster picture
  painted in a worker took it all off the page (note 11). Time it in a
  production build (dev renders twice under StrictMode).
- **Text a user reads about statistics is part of correctness:** P shown
  as Prism does and never contradicting its asterisks, "in either
  direction" for two-tailed, the one-tailed caveat, "no evidence of a
  difference", never "the same".

## Layout

```
src/model      typed tables, project, dependency graph
src/engine     worker, WebR bridge
src/analyses   one folder per analysis: types, R snippet, parser, fixtures
src/graphs     renderers, formatting model, export
src/ui         app shell, navigator, grid, inspectors, analytics
src/io         save/load, imports (.pzfx later)
scripts/       wordmark, R oracle
design/        logo and icon sources
docs/design/   numbered design notes
```

## Where things are written down

- **Design notes: `docs/design/NN-*.md`**, one per numbered item of work:
  what was asked, what was built and why. Write the note *before*
  implementing anything significant (refactoring a wrong data model late is
  the most expensive mistake this project can make); indexed in
  `docs/design/README.md`. "Item N" in code comments means that note.
- **Open work: GitHub Issues** and milestones, not this file.
- Keep this file's Status current at the end of each session.

## Conventions

- Small, reviewable commits; each model change ships with tests. Reference
  issues (`Fixes #N`).
- **One short-lived branch per piece of work** (one per issue while
  working through a milestone), fast-forwarded into `main` when green;
  `main` stays releasable, hotfixes branch from the last release tag.
- **Keep the user guide in step with the code** (once it exists, #34):
  any change a user can notice updates its guide page in the same
  commit; a new feature gets a page or section with a short how-to.
- File follow-ups as issues, not as "not yet" lists in notes.
- No `any`. Discriminated unions for table, analysis and graph types.
- Keep WebR behind our own interface so the engine can be swapped.
- The main thread never blocks on computation.
- **Prism parity:** when implementing an analysis or graph, compare
  defaults and reported outputs with Prism's (via GraphPad's public
  guides) and record intentional differences in the design note.
- **Wet-lab usability:** write for a grad student with no statistics
  background who needs a figure for lab meeting tomorrow. Plain language;
  explain jargon in place. Review the app from that seat periodically.
