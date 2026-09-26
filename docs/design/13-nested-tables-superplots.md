# 13. Nested tables and SuperPlots

Written 2026-09-26 before building milestone 10. Builds on note 02 (data
model), note 04 (analysis modules), note 05/11 (graphs, brackets). Prism's
behaviour comes from GraphPad's Statistics Guide ("How Prism performs the
nested t test and one-way ANOVA") and Support FAQ 2105 ("R and SAS code to
perform a nested t test"); the SuperPlot concept and its own recommended
statistics come from Lord, Velle, Mullins & Fritz-Laylin (2020), *J Cell
Biol* 219(6):e202001064.

## What was asked

A **SuperPlot**: a graph of individual measurements (e.g. cells), coloured
by which biological replicate they came from, with each replicate's mean
overlaid as a larger matching-coloured marker — built to fix
pseudoreplication (treating hundreds of cells as if n = hundreds, when
n is really the number of independent experiments). This needs a third
level of structure Column and Grouped tables don't have (group →
biological replicate → individual value), a statistical test that knows
about that nesting, and a renderer that draws it.

## The data model gains a `Nested` table type

A Column table's `EntryFormat` already allows `{ kind: 'replicates',
count: N }`, but `columnGroup()` (`src/model/selectors.ts`) hardcodes
subcolumn `0` — every Column table in the UI today has exactly one
replicate subcolumn per group. A Nested table is what that format was
already shaped for: **one subcolumn per biological replicate**, each
column ragged with the individual (technical) values down the rows, one
data set per group being compared.

```ts
export interface NestedTable extends TableBase {
  readonly type: 'nested';
  readonly format: { readonly kind: 'replicates'; readonly count: number };
  /** Shared across every group's data set, e.g. "Dish 1", "Dish 2"; null = "Replicate n". */
  readonly replicateTitles?: readonly (string | null)[];
}
```

`Table = ColumnTable | GroupedTable | NestedTable`. Rows hold individual
measurements; `Row.title` is unused (null), as in a Column table. Adding
or removing a replicate changes `format.count` and every data set's
subcolumns together (like changing a Grouped table's replicate count
today); adding a group adds a data set with that many (empty) subcolumns.

A new selector, `nestedGroups(table, dataSetIds)`, reuses the existing
`collect()` ragged-column logic (already used by `columnGroup`) per
subcolumn instead of per row:

```ts
export interface NestedGroup {
  readonly id: Id;
  readonly title: string;
  /** One per biological replicate; each already has its own `dropped` (empty/excluded). */
  readonly replicates: readonly GroupData[];
}
export function nestedGroups(table: NestedTable, dataSets: readonly Id[]): NestedGroup[];
```

A replicate with zero usable values (all empty/excluded) is dropped from
the analysis and counted, same as an empty group is today; the results
say so ("2 of 3 replicates had at least one usable value").

`.bsig`: a new table variant needs a schema-version bump and a codec
branch (`bsig.ts`), and `modelArbitraries.ts` needs to generate
`NestedTable` so the round-trip property test can see it (note 07's
lesson: a generator that doesn't produce a shape can't catch a codec
that forgets it).

## New analysis kinds: `nested-t-test`, `nested-one-way-anova`

**The statistical method is a real mixed-effects model, not naive
per-replicate averaging.** GraphPad's guide is explicit about how Prism
computes both:

> "Prism fits a mixed effects model, treating the main factor... as a
> fixed factor, and the nested factor as a random factor... using
> Restricted Maximum Likelihood (REML)."

and gives its own reference implementation (FAQ 2105):

```r
library(lme4)
model <- lmer(Inductive ~ Condition + (1|Room:Condition), data, REML = TRUE)
```

The equivalent, and what BarelySig implements, is **`nlme::lme`** with
nesting written the classical way:

```r
lme(fixed = value ~ group, random = ~1 | group/replicate, method = "REML")
```

`nlme` is a base "recommended" package (ships with every R install, so it
is very likely already inside webR's base distribution — confirmed
separately as a precompiled wasm binary at
`https://repo.r-wasm.org/bin/emscripten/contrib/4.6/PACKAGES` regardless).
Chosen over `lme4`/`lmerTest` because it needs no extra p-value package
(`summary(fit)$tTable` already has an exact t, df and two-sided p for the
t-test case; `anova(fit)` gives the omnibus F for the ANOVA case) and has
a smaller dependency footprint to pin and fetch. `group/replicate` nests
replicate inside group via the interaction, exactly like FAQ 2105's
`Room:Condition` — replicates don't need unique labels across groups
(numbering 1..n *within* each group is fine).

**Why not just average each replicate down to one number and run an
ordinary t-test/ANOVA (n = number of replicates)?** Two citable sources
address this directly and agree on when it's fine and when it isn't.
Prism's guide:

> "If there are no missing values, this analysis gives identical results
> to a simple t test... where only the mean of each subcolumn is
> presented. However, when there are missing values, there is no
> shortcut."

The SuperPlots paper recommends exactly that simple shortcut as
sufficient for its own worked examples, but flags the same condition:

> "...unless a different number of cells are observed in each round, or
> there is drastically different variance in each sample, in which case
> it would be better to weight each sample by its precision."

Unequal numbers of technical replicates per biological replicate is a
common real case (different numbers of cells imaged per dish), and naive
averaging weights every replicate equally regardless of how many
sub-values it summarises — which is exactly the kind of "replicates vs
summary data" mistake CLAUDE.md's domain rules are meant to catch. So the
mixed model is the primary and only implementation; there is no
"simple/nested" toggle. (An internal property test can still assert
that, on a synthetic *balanced* nested design, `lme`'s result matches an
ordinary t-test/ANOVA on the replicate means — a fast cross-check that
the model reduces correctly, not a second user-facing option.)

**Reported values (nested t-test):** t, df (`lme`'s own, not an
approximation — exact for one level of nesting), two-tailed P (half for
one-tailed, as the other t tests), the difference of means and its CI,
the group means/n (n = number of *replicates*, stated as such — this is
the number that matters for "was this run enough times"), and each
group's number of individual values folded in. Variance components
(between- and within-replicate SD) are reported since Prism does and
they're what explain *why* the nested test differs from a naive one on
the same data.

**Reported values (nested one-way ANOVA):** the omnibus F test from
`anova(fit)` (F, dfn, dfd, P), then post-hoc pairwise comparisons **via
`emmeans` on the fitted `lme` object** (`emmeans` is already pinned and
already used for Dunnett-style comparisons elsewhere) — Tukey, Dunnett
and Šidák/Bonferroni read straight off `emmeans::contrast()`, so the
existing `comparisonMismatch` machinery and `PairComparison` result shape
(`src/analyses/oneway/`) are cloned, not reinvented. No Welch/Brown-Forsythe
variant here — the mixed model already models the two variance
components directly, so there's nothing analogous to "assume unequal
group SDs" to offer.

**Oracle.** `oracle.R`'s independent reference is FAQ 2105's own
`lme4::lmer` call (a second, separately-written implementation, per the
project's oracle-independence rule) checked against `nlme::lme` before a
fixture is written — the two must agree to the fixture's tolerance, which
*is* the confirmation that BarelySig's chosen package (`nlme`) reproduces
Prism's own published reference (`lme4`). Fixtures: balanced replicate
counts (where the averaging shortcut must also agree, as a sanity check
inside the fixture, mirroring how the t-test oracle cross-checks its
textbook formula against `t.test`), unbalanced replicate counts (where it
must *not* agree with naive averaging — this is the case that matters),
a replicate with only one usable value, a replicate dropped entirely,
missing values scattered within replicates, and one case matching
GraphPad's own worked example dataset (`ttest_nested.maxwell_16_4.csv`,
cited in FAQ 2105) so the fixture has an external, published expected
answer independent of both R packages.

## WebR package pin

Add `nlme` to `scripts/webr/packages.json` and re-pin
(`npm run webr:fetch -- --update-lock`, `npm run oracle:pin`). `emmeans`
is already pinned for the ANOVA's post-hoc comparisons. `lme4` is **not**
shipped to users — it stays oracle-only (`barelysig-r` env), alongside
multcomp/dunn.test/fBasics/car/drc, used only to write and check
`oracle.R`.

## SuperPlot graph

Not a new graph *kind* so much as new options on the existing
beeswarm/dot-plot renderer (`src/graphs/`, note 05/11): each point takes
its colour from which replicate (subcolumn) it belongs to rather than a
single per-group colour, and each replicate's mean is drawn as a larger
marker in the same colour, layered on top (`paint.ts`; no `Mark`/scene
model change needed — `circle` marks already carry independent
`fill`/`opacity` and a `Tagged{role,ref}` for hit-testing, so "this point
belongs to replicate 3 of group B" is already expressible). A per-graph
toggle ("colour by replicate") turns a Nested table's beeswarm into a
SuperPlot; brackets from a `nested-t-test`/`nested-one-way-anova` attach
exactly like any other pairwise result (note 05/06's bracket path is
analysis-driven already, not table-type-specific).

Colour assignment: replicate colours come from the theme's categorical
palette, reused across groups (replicate 1 the same hue in every group),
matching how published SuperPlot figures usually read; matched replicate
identity across groups (e.g. "these are the same three experiments,
run on both control and treated") is a per-table concept
(`replicateTitles`), not inferred.

## Decisions made here

- Nested is a new `Table` variant, not a flag on `ColumnTable` — keeps
  `prepare()`'s table-type guards explicit (as one-way ANOVA already
  guards `table.type !== 'column'`), and keeps the grid's per-type UI
  (subcolumn-per-replicate headers) from leaking into ordinary Column
  tables.
- No Welch/unequal-variance variant of the nested tests: the mixed model
  already separates between- and within-replicate variance; "assume
  equal SDs" doesn't apply the same way.
- No naive averaging fallback exposed to the user; it exists only as an
  internal cross-check on balanced synthetic data.
- `nlme` over `lme4`+`lmerTest`: matches Prism's own numbers (checked
  against `lme4` in the oracle) with one fewer package to pin and fetch.
- Paired nested design (SuperPlots' own worked example: the *same* three
  replicates run under both conditions) is out of scope for this note —
  filed as a follow-up once the unpaired case ships, since it changes the
  random-effects structure (crossed, not purely nested) rather than being
  a small addition.

## As built

(filled in once milestone 10 ships)
