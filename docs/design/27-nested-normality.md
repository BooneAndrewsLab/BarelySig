# 27. Normality check for nested analyses

Written 2026-09-27 for #77. Builds on note 06 (`normality`, item 06, #28:
D'Agostino-Pearson and Shapiro-Wilk on a Column table's groups), note 13
(Nested tables and SuperPlots) and note 26 (descriptive statistics of a
Nested table, which pulled the replicate-mean arithmetic out into
`nestedReplicateMeans`).

## What was asked

Normality tests are offered alongside parametric tests on Column tables
(`src/analyses/normality`) but not for Nested tables
(`src/analyses/nested-ttest`, `src/analyses/nested-oneway`). A Nested
table's groups have no "check the assumption" analysis at all.

## What to test normality of

Two candidates, both raised in the issue:

1. **The replicate means** — what the matched nested t test, the matched
   nested one-way ANOVA, and the new nested-descriptive summary (note 26)
   actually use. This is exactly `nestedReplicateMeans` (note 26,
   `src/model/selectors.ts`): one number per biological replicate.
2. **The mixed model's residuals**, at either level — what the current
   *unmatched*, REML-based nested t test/ANOVA fits.

**Decision: means only.** Three reasons:

- It's the same object nested-descriptive and the matched tests already
  work with, so a user who ran nested-descriptive and liked its group
  summary is testing the very numbers that summary reported, with no new
  concept to explain.
- It's directly comparable to how a Column table's normality check works
  (`src/analyses/normality`): one vector of numbers per group, in, two
  tests, out. Reusing that exact machinery (see Implementation) means the
  results view, the wording and the low-power caveat are all already
  battle-tested rather than invented twice.
- Residual-level normality (candidate 2) needs a second, harder decision
  first: normality of what residual, from which model, at which of the
  two levels (between-replicate or within-replicate)? The unmatched
  nested test's own model is a stopgap under active reconsideration
  (#72 — "keep the conservative REML unmatched nested test, or switch to
  Prism's method?"); building a residual-diagnostics feature on top of a
  model that might change under it is exactly the kind of premature
  investment this project's notes warn against elsewhere. If #72 lands on
  a specific model, residual diagnostics for it can follow as its own
  issue. Left as a documented follow-up, not built here.

So this ships **means-only**, matching the issue's stated minimum.

## The low-power caveat

The typical Nested-table experiment has three biological replicates per
group. Three values is Shapiro-Wilk's absolute minimum to run at all, and
three points can essentially never fail a normality test regardless of
the true shape — the plain `normality` results already say as much for
Column-table groups ("with a few values per group these tests rarely
detect anything"), but there it's a caveat about typical n = 5–10; here
n = 3 is not "a few", it's as few as the test can take.

Wording used, in both the results reading (`reading.ts`) and the margin
note (`notes.ts`):

> With this few replicates a normality test has essentially no power to
> detect non-normality — it will pass almost regardless of the true
> shape. A pass here does not confirm the assumption is met; decide
> mostly from what you know about the measurement.

This is deliberately stronger than the plain `normality` wording ("rarely
detect anything") because "rarely" still reads as "sometimes it does, so
a pass carries a little information" — not true at n = 3. The result
text never says a group "looks normal" or "passed" without immediately
attaching this caveat; "passed" is kept only as the existing per-test
column header ("Passed normality test (α = 0.05)?"), same as
`src/analyses/normality`'s own table, which the reading sentence right
above it already qualifies.

## Implementation

`src/analyses/nested-normality`, one folder as the convention asks:

- `types.ts`: `NestedNormalityRequest` (per group: id, title, the
  replicate means as a raw array, and how many replicates were dropped
  for having no usable value) and `NestedNormalityResult`
  (`NestedNormalityGroup`: id, title, n (replicates with a usable mean),
  droppedReplicates, `shapiroWilk`/`dagostino` as `TestOutcome<...>`,
  reusing the exact `TestOutcome` type from `normality/types.ts` so a
  "why it didn't run" (`few`/`many`/`same`) is worded identically in both
  places).
- `analysis.R`: no new statistics. `normality`'s own `bs_normality(y, g,
  k)` already does exactly the right thing given *any* vector of numbers
  and a group index — it doesn't know or care whether `y` holds raw
  values or replicate means. `nested-normality/analysis.R` concatenates
  `normality`'s R code (as `nested-descriptive` concatenates
  `descriptive`'s) and defines `bs_nested_normality <- bs_normality` as
  its own exported name, so the job's R call names the analysis it's
  actually running without duplicating a single line of arithmetic.
- `index.ts`: `prepare` reads a Nested table's groups
  (`nestedGroups`), computes each group's replicate means with
  `nestedReplicateMeans` (note 26's selector — the same call
  `nested-descriptive` and the SuperPlot graph make, so this can never
  test a different set of numbers than the group summary reports or the
  graph plots), and sends those means as `y`/`g`/`k`, exactly as
  `normality`'s own `job()` does for raw values.
- `oracle.R`: an independent reference, following `normality/oracle.R`'s
  own `setup` almost verbatim (same D'Agostino formulas, same
  `shapiro.test`), run this time on the replicate means the fixture
  builds by hand rather than on raw values — proving the numbers tested
  are the means, not something recomputed differently. Fixtures:
  - `typical-three` — three replicates per group, the ordinary bench
    case, to make the low-power caveat concrete (Shapiro-Wilk runs, but
    can't meaningfully reject).
  - `minimum-two` — two replicates in one group (Shapiro-Wilk's floor is
    3): that group reports "why: few", the other group's test still
    runs.
  - `unequal-replicate-counts` — groups with different numbers of
    replicates (3 vs. 6), so the fixture harness's usual "unequal group
    sizes" edge case applies here too.
  - `clearly-non-normal-many-replicates` — enough replicates (20+) per
    group, drawn from a clearly skewed distribution, that both tests can
    and do reject: proof the feature isn't just structurally powerless
    (a real signal at n = 3 would still be worth flagging if it ever
    somehow appeared) and a working contrast against `typical-three`.
- Wired into `AnalyzeDialog.tsx` (`tables: ['nested']`, its own tile,
  not offered as an automatic companion of the nested t test/ANOVA the
  way `normality` is for the plain t test — the matched-vs-unmatched
  question the nested dialog already asks makes an unconditional
  "also test for normality" checkbox one prompt too many; a user who
  wants it clicks the tile, same as `nested-descriptive`),
  `analysisKinds.ts` (name, icon: reuses `descriptive-stats`, matching
  `normality`'s own), `notes.ts` (the results-page "what this means"
  note, with the strengthened caveat above), `ResultsSection.tsx` (a new
  `NestedNormalityView`, modelled on `NormalityView` almost line for
  line: same grids, "Number of replicates" in place of "Number of
  values"), `reading.ts` (`nestedNormalityReading`, modelled on
  `normalityReading` with the stronger wording), `bsig.ts` (options are
  `{}`, like the other parameterless analyses), `pairwise.ts` (no
  comparisons or brackets, like plain `normality`), `guide.ts`
  (`ANALYSIS_PAGE` → `17-nested-tables`, which gets a new section),
  `registry.ts`, `project.ts` (`NestedNormalityOptions = {}`),
  `analytics.ts` (`new-nested-normality`), `modelArbitraries.ts`.

## Options

None: like `normality` itself, there is nothing to configure.
