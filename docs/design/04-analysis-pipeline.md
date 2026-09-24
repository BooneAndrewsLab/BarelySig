# 04. Analysis pipeline: engine, analysis modules, results sheets

Written 2026-09-24 before building milestone 0.4 (#14–#18). Builds on
note 01 (WebR), note 02 (results by input hash, `Recompute`) and note 03
(the shell).

## What was asked

A typed `runAnalysis` over WebR with first-load progress, plain-language
errors, cancel and restart (#14); offline caching of the app and the
WebR runtime (#15); descriptive statistics (#16) and t-tests (#17), each
validated against R; and Prism-like results sheets with P values,
asterisks and a one-line reading for non-statisticians (#18).

## Engine (#14)

`src/engine/engine.ts`: one `Engine` per app, over `startWebR` (note 01:
WebR is already in its own worker, so no worker of ours).

- **Lazy start.** WebR starts on the first analysis, not at page load:
  opening a project and typing data never waits on 17 MB. Status is
  `idle → starting → ready`, or `failed` with a message; the status
  line shows "Starting the statistics engine (first time only, about
  17 MB)…" while it starts. WebR gives no byte-level progress, so the
  indicator is a stage, not a percentage.
- **One job at a time**, as `Recompute` already schedules. A job is R
  code (the analysis module's function), inputs as named numeric vectors,
  the packages it needs (installed from our own repository on first use,
  then cached by the PWA), and an `AbortSignal`.
- **Cancel = restart** (note 01): an abort closes WebR and starts a new
  one; the aborted job rejects with `Cancelled`. Nothing is kept in R
  between jobs: each runs in a fresh `Shelter` with its own environment,
  purged afterwards.
- **A dead engine restarts.** If a call fails for a reason that isn't an
  R error (the worker died, out of memory), the engine is discarded and
  the next job starts a new one; the failed job reports "The statistics
  engine stopped unexpectedly. It restarts on the next run."
- **Errors in plain language.** Analysis R code checks its input and
  stops with `stop("bs: <message for the user>")`; the engine passes
  those messages through as they are. Any other R error becomes "The
  statistics engine couldn't run this analysis: <R's message>", which
  should not happen and is worth a bug report.
- **`runAnalysis(request)`** is the typed entry point: a request is the
  analysis kind with its typed input and options; the module for that
  kind turns it into an engine job and parses the result into a typed
  result. No R code outside `src/engine` and `src/analyses`.

### Pinned engine

The WebR package versions are **committed** in `src/engine/lock.json`
(today they are read from the live r-wasm index on every
`webr:fetch`, so an upstream update would silently change the engine).
`webr:fetch` stages exactly those versions and fails if the index no
longer has one, telling the maintainer to run
`npm run webr:fetch -- --update-lock` on purpose, re-run the oracle pin
and the parity test. `oracle:pin` reads the same file. The app imports
it too: `ENGINE: EngineInfo` (WebR, R and package versions) is known at
build time, so input hashes (note 02) can be computed, and saved results
shown, before WebR has started.

## Analysis modules

One folder per analysis, `src/analyses/<id>/`:

| File | Holds |
|---|---|
| `types.ts` | the typed request (input + options) and result |
| `analysis.R` | the R function the app runs, imported with `?raw` |
| `index.ts` | the module: `prepare` (project → request, or a plain reason it can't run), `job` (request → R call and inputs), `parse` (R's list → typed result) |
| `oracle.R` | fixtures, computed with the **reference** implementation |
| `<id>.test.ts` | runs the app's module on every fixture in WebR under Node |

The oracle never calls `analysis.R`: expected values come from reference
code (R's own `t.test`, textbook formulas, or a reference package), so
the app's R is checked against something independent. Fixtures gain an
`options` field (the analysis options the case uses), so the app test
can build the same request.

A registry (`src/analyses/registry.ts`) maps `AnalysisKind` to its
module; `Recompute`'s `check` is `prepare`'s reason, its runner is
`runAnalysis`.

## Descriptive statistics (#16)

For each selected data set, as Prism's "Column statistics":

- **From replicates:** number of values (and how many were empty or
  excluded), minimum, 25th percentile, median, 75th percentile, maximum,
  range, mean, SD, SEM, lower and upper 95% CI of the mean, coefficient of
  variation (%), geometric mean (only when every value is positive),
  sum.
- **From summary data:** mean, SD, SEM, n and the 95% CI where n is
  known; CV. Percentiles and range need the values and are reported as
  not available, not guessed.
- **Percentiles** use Prism's method, `(n + 1)·p` with linear
  interpolation (R's `quantile(type = 6)`); R's default (type 7) would
  give different quartiles for small n. Confirmed by GraphPad FAQ 501
  ("How Prism computes percentiles"): rank `P·(n+1)/100`, Hyndman & Fan
  definition 6, and the smallest or largest value when the rank falls
  outside 1…n.
- **n = 1:** SD, SEM and CI are "not defined (one value)"; **n = 0:** the
  group is reported as having no values. Zero variance gives SD = 0 and a
  zero-width CI.

## t-tests (#17)

Options as Prism's dialog: paired or unpaired; for unpaired, Welch's
correction (off by default, as in Prism); two-tailed (default) or
one-tailed.

- **Unpaired** (Student or Welch): t, df, P; mean of each group; the
  difference **B − A** (Prism's convention) with its 95% CI; R² (η² =
  t² / (t² + df)); and the F test for equal variances (F = larger
  variance / smaller, DFn, DFd, two-tailed P), which Prism reports so
  the user can see whether Welch's correction matters.
- **Paired:** pairs by row, dropping a row missing on either side
  (note 02 selectors); number of pairs; mean and SD of the differences
  (B − A) with the 95% CI; t, df, P; R²; and Prism's "was the pairing
  effective": Pearson r between A and B with its one-tailed P.
- **From summary data** (mean, SD, n): unpaired only, Student or Welch,
  computed from the summary; the F test likewise. Paired needs values.
- **One-tailed P** is half the two-tailed P, as Prism reports it; the
  results say this is only valid if the direction was predicted before
  the data were collected. (A one-tailed P for the other direction is
  1 − P/2; Prism doesn't show it and neither do we.)
- Exactly **two data sets**; `prepare` explains otherwise ("A t test
  compares two groups; this analysis has three. Choose two, or use
  one-way ANOVA.").

Fixture cases for each: the Statistics Guide's example where there is
one, missing values, unequal n, ties, n = 2, zero variance in one group
(and in both: t undefined, reported as such), an extreme outlier, and a
P near 1e−20. Summary-data cases are checked against `t.test` on raw
values with that mean, SD and n (so the reference is independent of the
summary formulas).

## Results sheets (#18)

- **Creating an analysis:** an "Analyze" button on a table sheet opens a
  dialog: the analysis (Descriptive statistics, t test), the data sets
  (checkboxes; a t test starts with the first two), and the options,
  with one plain sentence under each ("Paired: each row is one subject
  measured twice"). The analysis appears under Results in the
  navigator, named after itself and its table ("Unpaired t test of
  Viability"), and its sheet opens.
- **The sheet** is a Prism-style table of label and value in sections
  (t test: "Unpaired t test", "Were the means different?", "How big is
  the difference?", "F test to compare variances", "Data analyzed"),
  plus, at the top, **one sentence in plain words**: "The means of WT
  and KO differ (P = 0.0021). If the two groups truly had the same mean,
  a difference at least this large would turn up in about 0.2% of
  experiments like this one." and a line naming the test and options
  ("Unpaired t test, two-tailed, assuming equal SDs"). Non-significant
  results say "no evidence of a difference", never "the same".
- **P values as Prism shows them:** four decimals, `< 0.0001` below
  that (`P = 0.0021`, `P < 0.0001`), never `0`; asterisks by Prism's
  thresholds with the scheme stated ("ns ≥ 0.05, * < 0.05, ** < 0.01,
  *** < 0.001, **** < 0.0001"). Other values to four significant
  digits; df as an integer when it is one, to four digits (Welch)
  otherwise.
- **Status on the sheet:** running (with "Stop"), outdated (inputs
  changed; recomputes by itself), blocked or failed with the message,
  and the "starting the engine" stage on first use. A stale result is
  never shown as if current.
- **Descriptive statistics** show as a table: one column per data set,
  one row per statistic, as Prism.

## Keeping results (#18, note 02 decision 2)

A small results bridge owns `Recompute`: it feeds it every project from
the store, seeds it with results read from a `.bsig` or IndexedDB, and
hands current results to saving. Saved results show at once after
opening (their hash matches with the committed engine pin); anything
stale reruns in the background.

## PWA (#15)

`vite-plugin-pwa` as PlasmidPop: manifest, app shell precached, service
worker registered in production only. WebR's files (`webr/**`, runtime
and package repository) are **runtime-cached, cache-first**, in a cache
named after the WebR version (`webr-0.6.0`), so they don't slow the
worker's install, a warm load reads them from the cache (note 01 found
Chromium re-downloading ~12 MB without it), and a WebR upgrade starts a
fresh cache. No COOP/COEP (note 01).

## Decisions made here

1. **WebR starts on first analysis**, not at page load.
2. **Package versions are committed** and the build fails on drift.
3. **Prism's percentile method** (type 6), not R's default.
4. **One-tailed P = two-tailed / 2**, as Prism, with the caveat stated.
5. **Welch off by default**, as Prism; the F test is shown so users see
   when it matters.
6. **A t test takes exactly two data sets.**
