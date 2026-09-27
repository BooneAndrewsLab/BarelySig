# 24. Comparisons after repeated-measures two-way ANOVA

Written 2026-09-27 before building #85. Builds on note 22 (the split-plot
ANOVA table itself, #81) and note 17's own staged precedent (#82/#83:
ship the ANOVA table first, comparisons as a follow-up once the ANOVA
table is trusted). Prism's behaviour comes from GraphPad's Statistics
Guide (multiple comparisons after two-way and repeated-measures ANOVA)
and the classical split-plot literature (Winer, Brown & Michels,
*Statistical Principles in Experimental Design*, on the "quasi-F" test
for simple effects with a mixed error term); no reference package
computes this design's comparisons directly (below), so this is derived
and checked against `emmeans` numerically before shipping, per
CLAUDE.md's Correctness section.

## What was asked

#85: "comparisons after repeated-measures two-way ANOVA" — the split-plot
case note 22 shipped without them, one factor repeated, the other
between-subjects. **Both factors repeated (#84) is out of scope here**,
same split note 22 already drew: a fully within-subject design needs its
own comparisons machinery (no between-subjects error stratum exists at
all), filed as its own future issue if wanted.

## Why this needs two error strata

A repeated-measures two-way ANOVA's own F tests already use two
different error terms (note 22): the between-subjects factor is tested
against `subjects` (MS(subjects), the between-subjects stratum), the
repeated factor and interaction against `residual` (MS(residual), the
within-subject stratum). Comparisons inherit this split: a comparison
between two *between-subjects* groups is a between-subjects question
(different subjects), and needs the between-subjects error; a comparison
between two *repeated* levels is a within-subject question (the same
subjects measured twice), and needs the within-subject error. Using the
wrong one either overstates or understates significance — not a
rounding matter.

## Where emmeans agreed with the hand formulas, and where it didn't

`emmeans` (already app-shipped, per CLAUDE.md's package list) has
explicit, documented support for R's own multistratum `aov(y ~ a*b +
Error(subject/b))` objects, automatically choosing which stratum's error
backs each requested contrast. Explored first, in throwaway R, before
committing to an implementation:

- `emmeans(model, ~between)`: on a **balanced** dataset (equal subjects
  per between-level), its marginal means and SE matched a plain one-way
  ANOVA of the subjects' own means exactly. On an **unbalanced** one
  (unequal subjects per between-level), they did not: emmeans printed
  its own warning ("EMMs are biased unless design is perfectly
  balanced") and the marginal means it gave were measurably different
  from the correct group-of-subject-means values (confirmed against
  both the raw `tapply` means and an independent `nlme::gls(...,
  correlation = corCompSymm(~1|subject))` fit, which agreed with the
  correct values to several digits). This is a known limitation of
  `aov()`'s own multistratum internals with unequal between-level sizes,
  not an emmeans bug as such, but it makes `emmeans(aovlist, ~between)`
  unsafe to use directly for the common case of unequal group sizes
  (dropped animals, uneven recruitment) that note 22 explicitly
  supports for the ANOVA table itself.
- `emmeans(model, ~between|repeated)` (simple effects: between-factor
  levels compared within one repeated level): its SE and Satterthwaite
  df matched, to the tested precision, the classical Winer/Kirk
  "quasi-F" formula for exactly this comparison — MS′ = (MS(subjects) +
  (*q* − 1)·MS(residual)) / *q*, with Satterthwaite df combining
  MS(subjects)/*q* (df = df(subjects)) and (*q* − 1)·MS(residual)/*q*
  (df = df(residual)) — on the same balanced dataset. This is a
  textbook formula, not something derived from emmeans' internals; it
  was confirmed independently by direct computation, and only cross-
  checked against emmeans as a second opinion.

**Decision:** don't reach for `emmeans` for this analysis's own R code
at all. All three families (below) are computed by hand from the same
`ms_subjects`/`df_subjects`/`ms_residual`/`df_residual` note 22 already
computes and validates for the ANOVA table, fed into the existing shared
`bs_comparisons` (`oneway/analysis.R`, already used by `two-way`,
`nested-one-way` and both repeated-measures-one-way modules) — no new
comparisons math, only new inputs to it. This sidesteps the unbalanced-
design pitfall above entirely (the hand SS decomposition already handles
unequal *n_a* correctly, note 22) and keeps one fewer package dependency
in this analysis's own runtime path. `emmeans` stays available for other
analyses (nested one-way) where its own multistratum limitation doesn't
apply (a single ordinary stratum there).

## The three families offered

| Family | Compares | Error term | Assumption |
|---|---|---|---|
| `main-between` | The between-subjects factor's levels, averaged over the repeated levels | MS(subjects) / *q* (subject means are themselves an average of *q* values) | Equal between-subjects variance (the ANOVA's own assumption for this term) |
| `main-repeated` | The repeated factor's levels, averaged over the between-subjects groups | MS(residual), pooled | Sphericity (the "traditional"/pooled method, #83's own precedent for the one-way case; no sphericity-free alternative offered here, filed as a future follow-up if wanted) |
| `simple` | The between-subjects factor's levels, within one repeated level at a time (simple effects) | MS′ = (MS(subjects) + (*q* − 1)·MS(residual)) / *q*, Satterthwaite df | Compound symmetry (the same assumption that lets the ANOVA table pool `subjects` and `residual` across levels at all) |

**Not offered:** comparing repeated levels within one between-subjects
group at a time. That family only needs the within-subject stratum (like
`main-repeated`, just restricted to one between-level's subjects), so it
is not a harder problem than what's shipped — deferred purely to keep
this issue's scope to the families note 22's own follow-up section
named, the same reason #82/#83 were split rather than shipped together.
Filed as a follow-up issue.

`main-between` and `main-repeated` each give one family (no natural
"level" to group by — the same reason `two-way-anova`'s own
`main-columns`/`main-rows` give no brackets, note 07). `simple` gives one
family per repeated level (the data set, or row, held fixed) — the
same shape as `two-way-anova`'s `within-rows`/`within-columns`.

Every family uses the equal-SD test set only (`NestedComparisons`:
Tukey, Dunnett, Šidák, Bonferroni) — no Welch-style variant in any
family, the same reason `repeated-measures-anova` and
`nested-one-way-anova` have none: each stratum's error term already
comes from a fitted decomposition, not raw per-group variances.

## Reported, in plain words

Every comparisons table states, in its own legend, which error term
backed it: "between-subjects error (subjects within groups)" for
`main-between`, "pooled within-subject error, assuming sphericity" for
`main-repeated`, "the split-plot's combined error term" for `simple` — a
wet-lab reader is never expected to know what "error stratum" means, but
does need to know that a `main-between` comparison and a `simple`
comparison of the same two groups can legitimately disagree (different
denominators), so both name their own basis rather than presenting one
generic "P value" as if every family meant the same thing. The reported
P is always the *adjusted* one (CLAUDE.md), and the test used is named
next to it, as every other comparisons table in this app already does.

## New option shape

```ts
export const REPEATED_TWO_WAY_FAMILIES = ['main-between', 'main-repeated', 'simple'] as const;
export type RepeatedTwoWayFamily = (typeof REPEATED_TWO_WAY_FAMILIES)[number];

export interface RepeatedTwoWayOptions {
  readonly repeatedFactor: 'row' | 'column';
  readonly family: RepeatedTwoWayFamily;
  readonly comparisons: NestedComparisons;
}
```

`comparisons.control`'s `Id` refers to whichever factor's levels the
chosen family compares (a between-subjects level for `main-between` and
`simple`, a repeated level for `main-repeated`) — the same
context-dependent-`Id` convention `TwoWayOptions.comparisons.control`
already uses (note 06: "a control is a data set for `within-rows` and
`main-columns`, a row for `within-columns` and `main-rows`"). Old
`.bsig` files (note 22's shipped shape, no `family`/`comparisons` at
all) read as `family: 'simple'`, `comparisons: { kind: 'none' }` — the
same "no comparisons" behaviour they were saved with.

## Wiring (grep for every place an analysis kind is matched, note 13)

`repeatedTwoway/analysis.R` gains `bs_repeated_twoway_comparisons`,
built on `bs_comparisons` (loaded from `oneway/analysis.R`, now
concatenated into this module's `code` the same way `repeated` and
`nested-repeated` already do). `repeatedTwoway/types.ts` gains a
`control` field on the request and a `families` field on the result
(`{ label, level, pairs }[]`, `TwoWayResult`'s own shape). Touch points:
`src/model/project.ts` (the new option shape above),
`src/analyses/pairwise.ts` (brackets: `simple`'s families map onto
`two-way-anova`'s own `within-rows`/`within-columns` cell-id shape
exactly, since it compares the same between-subjects levels within one
repeated level; `main-between`/`main-repeated` give none, like
`main-columns`/`main-rows`), `src/ui/shell/AnalyzeDialog.tsx`
(`RepeatedTwoWayFields` gains a family radio and the comparisons
picker, `TwoWayFields`' own shape), `src/io/bsig.ts` (read and write,
with the old-file default above), `src/test/modelArbitraries.ts`
(reuses the existing `nestedComparisonsArb`), `src/ui/results/
ResultsSection.tsx` (`RepeatedTwoWayView` gains a families grid and a
"Test details" grid, `TwoWayView`'s own shape) and `reading.ts`
(`repeatedTwoWayMethod`/`Reading` name which error term backed the
comparisons shown), `docs/guide/19-repeated-two-way.md` (its "no
multiple comparisons yet" sentence is no longer true).

## Correctness (CLAUDE.md)

**Oracle independence.** `repeatedTwoway/oracle.R`'s reference computes
`ms_subjects`/`df_subjects`/`ms_residual`/`df_residual` from
`aov(Error())` exactly as it already does for the ANOVA table (a
different R function than the app's own hand SS decomposition), then
feeds them to independently-written `ptukey`/`qtukey`/`pt`-based
formulas (not `bs_comparisons`, not `bs_apply_correction`) for each
family — the same independence shape `repeated/oracle.R` already uses
for the one-way case's own comparisons. Dunnett's shared-control
correlation and critical value reuse the `dunnett()` helper
`repeated/oracle.R` already wrote (same textbook integral, independent
of the app's `bs_dunnett_p`).

**Fixtures** (`repeatedTwoway/fixtures/`): one Tukey all-pairs case per
family (`main-between`, `main-repeated`, `simple`) on the existing
`unbalanced` dataset (unequal subjects per between-level — the case
that specifically exercises `main-between`'s and `simple`'s `n_a`-aware
SE, and the one where `emmeans`'s naive aovlist path was found biased
above), a Dunnett-against-control case, a Šidák and a Bonferroni case, a
dropped-subject case, and the `q = 2` case (epsilon forced to 1, so
`main-repeated`'s own error term is exactly MS(residual) with no
correction visible either way — comparisons don't depend on epsilon at
all, unlike the ANOVA table's own P values, worth a fixture note saying
so explicitly).

## Follow-ups filed, not built here

- Comparing repeated levels within one between-subjects group at a time
  (a fourth family, needing only the within-subject stratum already
  used by `main-repeated`).
- Comparisons for both-factors-repeated (#84): no between-subjects
  stratum exists there at all, a different problem.
