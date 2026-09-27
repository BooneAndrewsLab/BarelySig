# 18. Descriptive statistics of a Grouped table

Written 2026-09-27 before building #54 (split from #33).

## What was asked

The Analyze dialog offered descriptive statistics as a tile on Grouped
tables, but `descriptive.prepare()` refused every Grouped table
("not available yet; use a Column table"), so #33 hid the tile there
instead of shipping a refusal a user could actually click into. #54 asks
for the real thing: Prism's descriptive statistics of a Grouped table,
both per cell (each row × data-set combination) and per data set pooled
over all rows, with R-oracle fixtures.

## What Prism does

Prism's "Column statistics" analysis, run from a Grouped table, reports
one column of statistics per data set (Prism's "column"), pooling every
row's replicates for that data set into one group — the row factor
disappears; it describes the data sets as if the table's row structure
weren't there. Prism does not, on its own, also break results out by
individual row × data-set cell in this analysis (that finer view is what
the two-way ANOVA's "Table of cell means" gives, not descriptive
statistics).

BarelySig goes a step further than Prism here, deliberately: a Grouped
table's row factor is usually not vestigial (it is the thing #27's
two-way ANOVA tests), and a user reaching for descriptive statistics on
one often wants "what does each cell (genotype × treatment) look like"
as much as "what does each treatment look like overall". So this ships
**both**: per-cell statistics (row × data set) and per-data-set
statistics pooled over rows, labelled separately so nobody mistakes one
for the other. This is the one intentional Prism difference here, and is
worth restating if a user compares against Prism directly.

## Pooling summary-format tables

A Grouped table can hold raw replicates or summary data (mean, SD, n per
cell; item 02, note 02). Per-cell statistics work the same way either
format: `bs_describe` on the replicates, or `bs_describe_summary` on the
entered mean/SD/n, exactly as the existing Column-table descriptive
statistics already does per group.

Pooling *over rows* to get one figure per data set needs the row's
values, not just their mean and SD: combining several cells' mean, SD and
n into a single combined mean, SD and n is a well-known formula (the
combined variance also has to account for how far each cell's mean is
from the pooled mean, not just each cell's own spread), but from summary
data there is no way to also recover the min/max/median/quartiles the
pooled group would want to report, and no other analysis in the app
recovers percentiles from summary cells either. Rather than serve a
half-populated pooled row (n, mean, SD, SEM, CI, CV present; every
percentile a dash) that looks like a bug, **pooling is only offered when
the table holds raw replicates.** Summary-format Grouped tables get
per-cell statistics only, with a line explaining why there's no pooled
view — the same call the app already made for two-way ANOVA's stricter
summary-data limitations (unequal n across cells, note 06).

## Shape of the change

`src/analyses/descriptive` moves from a single flat request/result (one
`groups` array, for a Column table's data sets) to a discriminated union
on the table kind:

- `{ kind: 'column', groups }` — unchanged; a Column table's per-group
  statistics, byte-for-byte the same request, job and parse as before.
- `{ kind: 'grouped', rows, columns, cells, pooled }` — a Grouped table's
  row × column cell grid (from `groupedCells`, the same selector two-way
  ANOVA uses) plus, when the table holds raw replicates, one pooled group
  per data set built by concatenating that data set's raw values across
  every row (dropped-cell counts summed too). `pooled` is `null` for
  summary-format tables.

The R side needs nothing new: `bs_describe`/`bs_describe_summary`
(item 04, #16) already do exactly what one cell or one pooled group
needs; the job just issues one call per cell plus one per pooled column
instead of one per Column-table group. `version` bumps to 2 (the result
shape changed).

The result carries the same per-group shape (`DescribedGroup`) at every
level — one cell, one pooled data set, or one Column-table group are all
the same fields — so the results view's existing statistics table
(`DESCRIPTIVE_ROWS` in `ResultsSection.tsx`) is reused unchanged, called
once for the per-cell grid (columns titled "`row · data set`") and once
more for the pooled view when it exists.

## Touch points (note 13's lesson)

- `descriptive.prepare()`: accepts Column and Grouped tables; the
  "not available yet" refusal is gone.
- `AnalyzeDialog.tsx`: the descriptive tile's `tables` list gains
  `'grouped'`; its blurb no longer needs Column-only wording.
  Data-set selection (`Which data sets (columns)?`) is already generic
  across analyses — no dialog change is needed there.
- `chooser.ts` ("Help me choose"): the "numbers for each group" goal
  question is now asked on Grouped tables too (previously skipped, since
  `describable` was Column-only, so a Grouped table went straight to
  "compare" and hence two-way ANOVA). `chooser.test.ts`'s Grouped-table
  case is updated to answer the goal question explicitly.
- `ResultsSection.tsx`: `DescriptiveView` branches on the result's `kind`;
  a shared `StatsTable` renders `DESCRIPTIVE_ROWS` for whichever list of
  named groups it's given.
- `.bsig` (`bsig.ts`): unaffected — an analysis's serialised `options` for
  `descriptive` are `{}` regardless of table type; results are opaque
  JSON, not typed per kind, so the new result shape needs no migration.
- `docs/guide/11-descriptive.md`, `04-choosing-a-test.md`: updated to say
  Grouped tables are described too, and to explain the per-cell/pooled
  split and why summary-format tables only get per-cell statistics.
- Brackets, margin notes (`analysisNotes`), comparisons
  (`pairwise.ts`): descriptive statistics gives neither brackets nor
  comparisons on any table type, so both stay in their existing
  no-op case; nothing to add.
- `modelArbitraries.ts`: `descriptive`'s `options` are unchanged (`{}`),
  and `AnalysisSpec` doesn't encode table type, so the round-trip
  property already covers this without changes.
