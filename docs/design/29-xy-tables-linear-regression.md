# 29. XY tables, linear regression and correlation

Written 2026-09-27 for #38 ("Linear regression and correlation"). Builds
on note 02 (typed data tables), note 13 (adding a genuinely new table
type end to end) and note 28 (the most recent example of that, and of
splitting a large issue's scope explicitly).

## What was asked, and the scoping decision

#38 needs paired X–Y data — slope/intercept with CIs, R², a runs test,
residuals, and Pearson/Spearman correlation. The project's roadmap
(CLAUDE.md's table-types table) assigns paired X–Y data to a **not yet
built XY table type**, the same table type #37 ("XY tables and nonlinear
regression") is meant to introduce for dose-response curve fitting.

Rather than duplicate an XY table type later for #37, or hack together a
throwaway paired-data shape for #38 alone: this issue builds the real XY
table type now, as its own foundation, then implements linear regression
and correlation on top of it. **Nonlinear regression is explicitly out of
scope here** — dose-response models, EC50/IC50, constraints, shared
parameters, extra sum-of-squares/AICc model comparison all remain #37's
job, now scoped down to just that, since the table type it also asked for
already exists after this issue. #37 is commented, not closed.

**Also scoped out of this issue, filed as follow-ups (this note's own
"What's scoped out" section, same pattern as note 28's #86):**

- The XY scatter graph (points, fitted line, confidence/prediction band).
  Every existing graph in this app is drawn on a *categorical* value axis
  (`src/graphs/layout.ts`'s `GroupInput`s are groups along x, a summary
  statistic and/or points along y); an XY scatter needs a genuinely
  *continuous* x axis with two independent numeric scales, which is a
  rendering-architecture change, not a new `GraphPlot` variant bolted onto
  the existing pipeline. That is real, standalone work, and rushing it
  to also land here risks the categorical-axis code that every other
  graph depends on. Filed as a follow-up issue; a user can still see
  their data, and every regression/correlation number, in the table and
  results sheet without a graph, same as contingency's chi-square/Fisher
  results shipped without a graph in note 28.
- "Help me choose" wiring for XY tables (`chooser.ts`) — same reason note
  28 gave for Contingency: a third data shape touches the whole question
  tree. The guide degrades safely (see below) rather than guessing.
- Exact Spearman P for small, tied samples — already #48's separate,
  explicitly deferred scope; not attempted here (see below).

## Shape of the table

```ts
export interface XyTable extends TableBase {
  readonly type: 'xy';
  /** Format of the Y data sets (dataSets[1:]). The X data set (dataSets[0]) is always one value per row. */
  readonly format: EntryFormat;
}
```

Reuses `DataSet`/`Row`/`EntryFormat` exactly like every other table type
(note 13's lesson, repeated by note 28: a table type is data-set/row/
subcolumn shaped until it has a genuine reason not to be) — with one new
wrinkle: **`table.dataSets[0]` is always the X column**, one subcolumn,
one value per row, pinned the same way `CONTINGENCY_FORMAT` pins a
Contingency table's format — while `table.dataSets[1:]` are Y data sets
under the table's own `format` (replicates, any count, or summary data),
exactly like a Column table's groups. Rows are shared: row *r* is one X
value, with each Y data set's replicate(s) or summary at that X.

This is a real, new structural rule (unlike Contingency's simple reuse),
so it touches more of the model than note 28 did:

- `createXyTable(spec)`: builds `dataSets[0]` at `XY_X_FORMAT =
  {kind:'replicates', count:1}` and the Y data sets at `spec.format`.
- `setFormat` (edits.ts): reshapes `dataSets[1:]` only; `dataSets[0]`
  never changes shape, whatever format the user picks for the Y series.
- `addDataSet`/`removeDataSet`/`moveDataSet`: refuse to touch or displace
  index 0 — "Cannot remove/move the X column" — the X column is not one
  of the "groups" a user adds or deletes from the grid's spare column.
- `setExcluded`: refuses to exclude an X cell ("clear the cell instead").
  Excluding is Prism's "leave this value out of every analysis and graph,
  struck through, but keep it visible" (item 02) — that doesn't make
  sense for the shared X value a whole row's Y values are plotted
  against; the model rule below (missing X drops the row) already covers
  the "don't use this point" case.
- `validateTable`: checks `dataSets[0]` has exactly one subcolumn always,
  regardless of what `subcolumnCount(format)` the table's own format
  would otherwise require of every data set.

**Missing values.** A missing Y at a given X drops that one point from
that Y series' analysis and graph — exactly CLAUDE.md's domain rule
("Missing values are `null`, never `0`"), same as an empty cell in any
other table. **A missing X is different: it invalidates the whole row**
for every Y series at that X, not just one cell — there is no such thing
as a Y value with no paired X to plot or regress it against, unlike a
Grouped table's row × column cells, which are independent of each other.
`xySeries` (`src/model/selectors.ts`) enforces this: a row with a null or
excluded-can't-happen X is dropped before any Y value at that row is even
looked at, and the drop count is reported so results can say "3 rows
dropped: no X value." X is never itself "excluded" (see above) — only
entered or left blank, the ordinary way to say "not yet."

**Summary-data entry for Y.** Exactly the project's existing
`SummaryStats` machinery (mean-SD-n, mean-SEM-n, mean-CV-n, and the
graph-only interval forms), unchanged: a Y data set can hold `n`
replicates per X, or a mean with SD/SEM/CV and n, or a mean with
lower/upper limits (graphs only, no test can use it). `columnGroup`-style
summary conversion already lives in `selectors.ts`'s `summaryAt`; `xy.ts`
selectors call the same helper per X row, per Y data set, so a summary
XY table's regression sees the same `{mean, sd, n}` shape a Column
table's summary group does. Regression and correlation need individual
values or a convertible SD, exactly like the t test does from summary
data — `prepare()` says so in plain language when the format can't give
usable values (e.g. `mean-lower-upper`, which has no SD to fall back on).

## Analyses

Two modules, one per Prism analysis (Prism itself keeps "Correlation"
and "Simple linear regression" as separate analyses of an XY table, not
one combined dialog):

### `correlation`: Pearson r and Spearman rho

One method per analysis (`options: { method: 'pearson' | 'spearman' }`,
default Pearson, matching Prism's own default), run once per chosen Y
data set — a batch result, one row per series, the same shape
`normality`'s `groups: NormalityGroup[]` already uses for "one test per
thing the user ticked."

- **Pearson**: `cor.test(x, y, method = "pearson")`. CI via R's own
  Fisher z-transform inversion (`cor.test`'s default), which is also
  Prism's method — no difference to state here.
- **Spearman**: `cor.test(x, y, method = "spearman")`. **R's own
  tie-handling, stated per CLAUDE.md's rule that a differing default gets
  called out**: `cor.test` can only compute an *exact* P when there are no
  ties and n < 1290; with any tie in x or y it falls back to an
  asymptotic t approximation (a warning R itself raises,
  "Cannot compute exact p-value with ties"). The module detects ties
  directly (`anyDuplicated(rank(x))`/`rank(y)`) rather than depending on
  parsing a warning string, and reports `exact: boolean` so the results
  text says which one ran, and a caveat when it's the approximation.
  **Exact Spearman P when ties make the exact method unavailable is
  #48's separate, already-deferred scope** (a permutation-based
  alternative) — not attempted here; the asymptotic fallback R and Prism
  both already use is what ships.
- No CI is reported for Spearman (Prism doesn't offer one either — rho's
  sampling distribution has no closed-form CI the way Fisher's
  z-transform gives Pearson one).

### `linear-regression`: slope, intercept, R², residuals, runs test

Also a batch result, one row per chosen Y data set. `lm(y ~ x)`, entirely
base R:

- Slope and intercept with their 95% CIs: `coef(m)` and `confint(m)`.
- R²: `summary(m)$r.squared`.
- The regression's own significance (slope ≠ 0): F, both df, and P from
  `summary(m)$fstatistic`/`coefficients` — algebraically the same P a
  two-tailed Pearson correlation test of the same x, y gives (F = t²),
  stated in the results text so a user who runs both doesn't see two
  "different" P values for what is mathematically one test.
  **Needs at least 3 points**: at n = 2 a line fits every pair of points
  exactly (R² is always 1, the slope's SE and CI are undefined/infinite).
  `prepare()` reports this per series as `ran: false, why: 'few'`, the
  same `TestOutcome`-shaped pattern `normality` already uses for "can't
  run, here's why," rather than crashing or showing `NaN`/`Inf`.
- Residuals: `(x, y, fitted, residual)` per kept point, for the results
  sheet and any future graph.
- **Runs test for lack of fit.** This is Prism's own name for exactly
  this check (GraphPad's Curve Fitting Guide, "Is the fit good?" §
  runs test): order the residuals by x, take their signs, and ask
  whether positive and negative residuals alternate more or less than
  chance would produce — a systematic run of same-signed residuals
  means the line misses curvature the data has. **No R package has a
  runs test in base R**, but the test itself is a textbook asymptotic
  formula (Wald–Wolfowitz), not a hand-rolled *statistical* method open
  to the kind of subtle error CLAUDE.md warns against (df approximations,
  tie corrections): given `n1`, `n2` (positive/negative residual counts)
  and the observed run count `R`,
  `mu = 1 + 2 n1 n2 / (n1+n2)`,
  `sigma^2 = 2 n1 n2 (2 n1 n2 - n1 - n2) / ((n1+n2)^2 (n1+n2-1))`,
  `Z = (R - mu) / sqrt(sigma^2)`, two-tailed P from `pnorm`. Implemented
  once in `analysis.R` and *independently* a second time in `oracle.R`
  (this project's own rule: an oracle must be independent of the app's
  code) by wrapping CRAN's `randtests::runs.test`, installed into the
  `barelysig-r` environment for reference only (never shipped to WebR,
  same status as `multcomp`/`car`/`dunn.test`/etc. already are). A
  residual that lands exactly on zero (ties the fit exactly) is dropped
  before computing signs, same as R's own `runs.test` implementations do
  — noted in the results text when it happens. Needs at least 2 runs and
  both signs present to report a P; too few points, or every residual on
  one side, reports `ran: false` in words rather than a nonsense P.

### Comparisons / brackets

Like `descriptive`/`normality`/Contingency's two tests: one number (or
one small result) per Y series, not per pair of series — `pairsOf`/
`comparisons` in `pairwise.ts` return `[]` for both new kinds.

## UI

- **New experiment dialog**: an "XY" tile (`src/ui/formats.ts`, icon
  `xy` — already reserved in `Icon.tsx`/`icons.svg`, unused until now,
  exactly like `contingency`'s icon was before note 28). `EntryFields`
  falls through to the existing replicates-per-cell/summary-data
  fieldset (the same one Grouped uses), since a Y data set's entry works
  exactly like a Grouped table's cell.
- **Grid** (`src/ui/grid/layout.ts`): the one place needing real new
  code, since `makeLayout`'s `perSet = subcolumnCount(table.format)`
  used to apply to every data set uniformly. For an XY table, column 0's
  data set (X) is always exactly one subcolumn regardless of `format`;
  columns 1+ (Y) use `subcolumnCount(table.format)` as before. No row-
  title column (`rowTitles: false`, like Column/Nested): a row is
  identified by its X value, shown as the first data column, not a
  separate title column.
- **Analyze dialog**: `correlation` (with a Pearson/Spearman radio pair)
  and `linear-regression` listed for `tables: ['xy']`; "Which data sets?"
  reuses the existing "Which groups?" wording and multi-tick UI (a batch
  of Y series, same as ticking groups for `normality`).
- **Results view / reading.ts**: `CorrelationView`/`LinearRegressionView`,
  one row per Y series, following the same plain-language, never-
  "the same" rule as every other reading; the runs test's caveat and
  the Pearson/regression-P-are-the-same-test note are stated in words,
  not just numbers.
- **"Help me choose"**: `chooser.ts`'s `suggest()` now returns
  `{ kind: 'none', why: … }` immediately for `tableType === 'contingency'
  || tableType === 'xy'` — this also *fixes* a latent gap in note 28's
  own contingency wiring (it fell through to the ordinary group-count
  logic and could suggest an unrelated t test/ANOVA for a Contingency
  table; nothing exercised that path before now). "Pick a test myself" is
  unaffected.
- `.bsig`, `analysisKinds.ts`, `analytics.ts`'s event allow-list,
  notebook margin notes (`notes.ts`), a guide page
  (`docs/guide/22-xy-tables.md`), and `modelArbitraries.ts`'s generators
  are all extended the same way note 28 extended them for Contingency.

## What's scoped out

- **The XY scatter/line/band graph** (above) — follow-up issue filed.
- **"Help me choose" full wiring** for XY tables (above; safe degrade
  only).
- **Exact Spearman P with ties** — #48, unchanged.
- **Nonlinear regression** (dose-response, EC50/IC50, curve library,
  AICc) — remains #37, now scoped down to just this, since the XY table
  type it also asked for now exists.

## Validation

`src/analyses/correlation/oracle.R` and
`src/analyses/linear-regression/oracle.R` wrap `cor.test`/`lm` (base R)
directly, plus (linear regression only) `randtests::runs.test` as the
independent reference for the runs test. Fixtures cover, per CLAUDE.md's
Correctness section and #38's own text:

- a clean linear relationship (unambiguous slope, sanity check)
- missing values (a blank Y at some X; a blank X, whose whole row must
  drop from every series)
- unequal n between two Y data sets of the same table
- ties in X and/or Y (Spearman's asymptotic fallback)
- n = 2 (regression's `why: 'few'` outcome; correlation still computes,
  since Pearson/Spearman are defined at n = 2, just with a very wide or
  degenerate CI where R gives one)
- zero variance in X (undefined slope: `lm` gives `NA`/`Inf` coefficients
  — reported as "can't fit a line: every X is the same value") and in Y
  (a valid, flat fit: slope 0, R² 0 exactly, not rounding noise per
  CLAUDE.md's own "true value is 0" lesson — the fixture's X values are
  distinct so R² lands on an exact, not-nearly-zero 0)
- an outlier (large residual; exercises the runs test's ability to still
  find alternating signs among the rest, and a case where the outlier's
  residual sign breaks up what would otherwise be one long run)
- a very small P value (large n, strong correlation)

`npm run oracle:generate correlation linear-regression` writes the
fixtures; `src/test/parity.test.ts` picks them up automatically; each
module's own `.test.ts` runs the app's `analysis.R` against the same
fixtures.
