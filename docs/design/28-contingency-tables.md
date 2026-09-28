# 28. Contingency tables

Written 2026-09-27 for #39, the first Phase 2 table type (CLAUDE.md's
table). Builds on note 02 (typed data tables) and note 13 (how a new table
type is added end to end: model, selector, `.bsig`, grid, dialogs,
results).

## What was asked

A new table type holding counts in a rows × columns grid ("Contingency"
in Prism), with a chi-square test of independence and Fisher's exact
test, and a basic graph. Phase 2 also lists r×c support for Fisher's
(R's `fisher.test` gives it for free) rather than just 2×2.

## Shape of the table

A Contingency table is, structurally, a Grouped table whose format is
pinned to one subcolumn per cell: rows are one categorical factor (e.g.
"Responded" / "Did not respond"), data sets (columns) are the other (e.g.
"Drug" / "Placebo"), and the one value in each cell is a count, not a
replicate or a summary statistic. Reusing `DataSet`/`Row`/`EntryFormat`
as-is (rather than a bespoke shape) means the grid, `.bsig`, undo, paste
and the navigator all work with no new machinery — the lesson from note
13's Nested table, repeated here: a table type is data-set/row/subcolumn
shaped until it has a genuine reason not to be.

```ts
export interface ContingencyTable extends TableBase {
  readonly type: 'contingency';
  /** Always {kind:'replicates', count:1}: one count per row × column cell. */
  readonly format: EntryFormat;
}
```

`CONTINGENCY_FORMAT` is the one legal value; `setFormat` (edits.ts) refuses
to change it, the same way it refuses summary data on a Nested table.
Grid rows get titles (`rowTitles: true` in `layout.ts`, like a Grouped
table) since the row factor's levels need labels, and data sets are the
column factor's levels, titled the normal way.

**Missing cells: not meaningful, but not forbidden while typing.** A
contingency test is a full accounting of every subject or observation —
Prism's own contingency tables don't let a cell go unaccounted for. But
CLAUDE.md's domain rule stands: `null` means "not entered yet," not
"zero," and a user typing left-to-right needs to be able to leave a cell
blank mid-entry, exactly like every other table. So `validateTable`
allows `null` cells structurally, the same as every other table, and
requires only that a filled cell be a finite number — not that it
already be a non-negative whole count: a half a count or a negative
count is nonsensical the same way a negative SD is, per validate.ts's
own scope note ("values a user can type but that make no sense... are
not invariants"). It is each analysis's `prepare()` that refuses to
run — in plain language — when a cell is still empty, or holds
something that isn't a non-negative whole count. This mirrors how a t
test refuses "too few values" rather than the table itself enforcing a
minimum n.

## Analyses: one module per test, not one shared module

Two independent modules, `src/analyses/contingency-chi-square` and
`src/analyses/contingency-fisher`, rather than one module offering both
(the two-way-ANOVA-plus-post-hoc split is the wrong template here: that
split exists because the post-hoc tests *depend on* the ANOVA having run
first, sharing its error term. Chi-square and Fisher's exact don't depend
on each other — they're two different answers to the same question, and
a user typically wants one or the other, not both in sequence). Each is a
thin, honest wrapper: `chisq.test()` and `fisher.test()` are base R,
already the trusted reference implementation (the same relationship this
project already has with `shapiro.test` in `normality`), so the R code is
a few lines turning the matrix into R's own function call and the S3
result into a plain list — no hand-rolled statistics to get subtly wrong.

Both take a whole table (or a chosen subset of its data sets/columns) as
input, not two data sets: unlike a t test, a contingency test's natural
unit is the whole r×c grid, so `prepare()` asks for at least 2 rows and 2
columns among the data sets chosen (Prism's own minimum for either test).
A shared selector, `contingencyCells` (`src/model/selectors.ts`), turns a
table plus a chosen set of data set ids into `{ rows, columns, counts }`
— reused by both modules so they can never disagree about what counts as
"empty" or "excluded" in a contingency cell.

### Chi-square test of independence (Prism parity)

`chisq.test(m, correct = TRUE)`. R's `correct` only ever applies Yates'
continuity correction to a 2×2 table (silently ignored for larger
tables) — exactly Prism's own default ("Yates' continuity correction" for
2×2 categorical analyses) — so the app makes no choice here at all: one
call, Prism's default behaviour, stated in the results text so a user
comparing against a hand run of `chisq.test(m, correct = FALSE)`
elsewhere isn't confused by a different P.

Reported: χ², df, P, and R's own low-expected-count warning ("Chi-squared
approximation may be incorrect"), surfaced verbatim as a caveat rather
than swallowed — the same warning Prism shows as "this P value may not be
very accurate" beneath a chi-square result with small expected counts.

### Fisher's exact test

`fisher.test(m)`, no options exposed. For a 2×2 table this is Prism's own
two-tailed Fisher's exact test (R's default `alternative = "two.sided"`);
for r×c, R already generalizes to the same exact test via a network
algorithm, so "at minimum 2×2" from the issue becomes "any r×c that
`fisher.test` can handle" for free, matching Phase 2's note that
`fisher.test` handles r×c. **Difference from Prism, stated here per the
correctness rule:** Prism does not offer a one-tailed Fisher's exact
option in the same dialog as chi-square (it's reached from a slightly
different path and only for 2×2); this app offers only two-tailed, for
every table size, and says so in the results reading rather than
offering a one-tailed toggle Prism's own chi-square/Fisher dialog
doesn't have either. No odds ratio is reported for anything but a 2×2
table (R itself has none to give for r×c — `fisher.test`'s `estimate`
and `conf.int` are `NULL`), so the results view only shows those two rows
when the table is 2×2.

Both modules report the same low-level facts about the table (n, and
whether any expected count is below 5, the traditional threshold this
project's chi-square result already surfaces) so results text can
recommend Fisher's exact when chi-square's assumptions look shaky — in
words, not as an automatic switch.

### Comparisons / brackets

Neither test produces pairwise comparisons in the sense `pairwise.ts`
already models (Tukey, Dunnett, …): a contingency test's result is one
number for the whole table, not one per pair of groups. Both kinds
return `[]` from `pairsOf`/`comparisons`, alongside `descriptive` and the
normality checks — no significance brackets. If someone eventually wants
per-cell or per-column follow-up (e.g. pairwise 2×2 sub-tables with a
correction), that is its own design question, filed as a follow-up
(#39's issue tracks that this was scoped out; see below).

## UI

- **New experiment dialog:** a "Contingency" tile (`src/ui/formats.ts`,
  icon `contingency` — already reserved in `Icon.tsx`/`icons.svg`, unused
  until now). `EntryFields` shows no radio buttons for it (like Nested):
  there is exactly one way to enter a Contingency table, so the fieldset
  just says so.
- **Grid:** needs no new code beyond `rowTitles` and the format-change
  guard above — `makeLayout` already lays a one-subcolumn-per-data-set
  table out like a Grouped table's simplest case.
- **Analyze dialog:** both kinds listed for `tables: ['contingency']`,
  no options UI (like `descriptive`/`normality`) since neither test has
  anything to choose. "Which groups?" reuses the Grouped table's "Which
  data sets (columns)?" wording, since a Contingency table's data sets
  are its column factor exactly the way a Grouped table's are.
- **Results view:** two new views (`ContingencyChiSquareView`,
  `ContingencyFisherView`) in `ResultsSection.tsx`, `pValue`/`stars`
  formatting reused from every other test, plain-language readings in
  `reading.ts` following the project's rule that P is stated exactly as
  Prism formats it and never contradicts the asterisks.
- **"Help me choose" (note 15):** *not* wired for Contingency tables in
  this pass — `Guide.tsx`'s goal-based suggestions are written per table
  type and adding a third categorical-data branch touches its whole
  question tree. Scoped out; filed as a follow-up issue (the guide
  degrades safely to "no suggestion" for a table type it doesn't know,
  it doesn't crash). "Pick a test myself" is unaffected and is the normal
  path for this release.

## What's scoped out (#86)

- **A contingency graph** (stacked/grouped bars of counts or row/column
  proportions, with or without a mosaic-plot option). Not shipped in this
  pass: `GraphPlot`/`GraphSource` validation (`validate.ts`) would need a
  third plot family and `validateProject` already special-cases Grouped
  vs. Column plots by table type, which is worth its own small design
  pass rather than bolting on at the end of an already-large table-type
  addition. A user can still see and report their raw counts and P
  values without a graph.
- **Relative risk with its CI.** The issue asked for chi-square, Fisher's
  exact, relative risk and odds ratio; only the odds ratio shipped (from
  `fisher.test`, 2×2 only, alongside Fisher's exact P). Relative risk is
  a different, simpler computation (a ratio of two proportions) that
  deserves its own small oracle and results row rather than being
  squeezed into this pass.
- **"Help me choose" wiring** for Contingency tables (above).
- **Pairwise/bracket-style follow-up comparisons** after a significant
  r×c result (above) — not part of Prism's own chi-square/Fisher dialog
  either, so not a parity gap, just a possible future feature.

All filed as #86.

## Validation

`src/analyses/contingency-chi-square/oracle.R` and
`.../contingency-fisher/oracle.R` wrap `chisq.test`/`fisher.test`
directly (independent of `analysis.R` only in the sense that they are
literally the trusted base-R functions themselves — the same
relationship `normality`'s oracle has with `shapiro.test`), covering:

- a classic 2×2 table (with a clear association)
- a 2×2 table with no association (P near 1, to catch a sign/direction
  bug)
- an r×c table (3 rows × 4 columns)
- a table with one cell equal to 0
- a table with small counts / low expected values, where Fisher's exact
  is preferable to chi-square's asymptotic approximation (the case the
  issue specifically calls out) — chi-square's fixture on the same data
  keeps the R low-expected-count warning to prove the caveat surfaces
- (chi-square only) a table large enough that Yates' correction changes
  the result from the uncorrected statistic, to catch the correction
  being silently dropped

`npm run oracle:generate contingency-chi-square contingency-fisher`
writes the fixtures; `src/test/parity.test.ts` picks them up
automatically (no hand-wiring needed, per the project's own reminder),
and each module's own `.test.ts` runs the app's `analysis.R` against the
same fixtures.
