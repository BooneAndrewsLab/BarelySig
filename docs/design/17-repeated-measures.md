# 17. Repeated-measures one-way ANOVA and the Friedman test

Written 2026-09-26 before building #50 (one-way slice). Builds on note 06
(one-way ANOVA, Kruskal-Wallis and Dunn's test, the multiple-comparisons
families) and note 15 (the guided chooser). Prism's behaviour comes from
GraphPad's Statistics Guide (repeated-measures one-way ANOVA, sphericity
and epsilon, the Friedman test, FAQ 1609 on multiple-comparison methods).

## What was asked

#50: "repeated-measures one-way ANOVA (with the Geisser-Greenhouse
correction Prism applies by default), repeated-measures two-way ANOVA
(one or both factors), and the Friedman test with Dunn's comparisons".
This note ships the one-way slice: a Column table, paired by row (as the
paired t test and Wilcoxon already are, generalised past two groups).
Split off, each its own issue: two-way (#81, its own within-subject
design, a separate piece of work), exact Friedman P for small tables
(#82, as Kruskal-Wallis's exact P was split off as #49 before it was
built), and a sphericity-free comparisons method (#83, FAQ 1609's second
method). #71 (matched nested one-way ANOVA) still waits on #50's sibling,
repeated-measures ANOVA on a Nested table's replicate means; that reuses
this module once #50 ships (see note 14).

## New analysis kinds

| Kind | Table | Options |
|---|---|---|
| `repeated-measures-anova` | Column, paired by row | `comparisons` (`Comparisons`, the equal-SD family only) |
| `friedman` | Column, paired by row | `comparisons` (none/all/control), `corrected` (true) |

Both need the individual values (never summary data: pairing needs
every subject's row). A subject (row) with a value missing in *any* of
the chosen columns drops out of the whole row, not just the columns it's
missing from — the same rule the paired t test and Wilcoxon already
apply to two columns, read across N. A new selector, `matchedGroups`
(`src/model/selectors.ts`), generalises `pairedGroups` from two ids to
any number: it returns the complete rows (subject id, one value per
group) and how many rows were dropped for missing a value somewhere.
`pairedGroups` itself is untouched — two near-identical small functions
beat threading an N-ary one through the 2-ary call sites.

## Repeated-measures one-way ANOVA

**The ANOVA table**, computed directly from the subject × treatment
matrix (n subjects, k treatments, every cell filled: this is a Grouped
table's "one value per cell, no interaction" case in miniature, note
06's `two-way-anova`, but here the row factor is *subjects* and its own
SS is reported rather than folded into a residual):

- SS(treatment) = n·Σ(colMean − grand)², df = k − 1
- SS(subjects) = k·Σ(rowMean − grand)², df = n − 1
- SS(residual) = SS(total) − SS(treatment) − SS(subjects) (the
  subject×treatment interaction, standing in for error since there is
  one value per cell), df = (n − 1)(k − 1)
- F = MS(treatment) / MS(residual); the same F a two-way ANOVA's row
  factor gets when there's no interaction term to test against.
- R² (treatment effect) = SS(treatment) / (SS(treatment) + SS(residual));
  R² (matching effectiveness) = SS(subjects) / SS(total), as the
  Statistics Guide's ANOVA-table page describes both.

**Geisser-Greenhouse correction.** Base R already has what this needs,
with no extra package: `stats:::anova.mlm`'s `test = "Spherical"` branch
(triggered by `anova(lm(Y ~ 1), update(., ~0), X = ~1, test =
"Spherical")`, Y the subject × treatment matrix) computes exactly this
F, its uncorrected P, and both a Geisser-Greenhouse- and
Huynh-Feldt-corrected P from fractional df — and the same F matches the
SS-table one exactly (checked in oracle.R as an independent
cross-check, per CLAUDE.md's Correctness section). The unexported
`stats:::sphericity()` (the same helper `anova.mlm` calls internally)
returns the two raw epsilon values without needing to parse the printed
heading. Huynh-Feldt epsilon can exceed 1 (it did in `stat_epsilon.htm`'s
own example table) and, with very few subjects relative to treatments
(n ≤ k, the `n-2` fixture), can come back negative — both raw R
behaviours confirmed against a synthetic example before writing a
fixture. Prism's guide says epsilon is never outside [1 / (k − 1), 1],
so both epsilons are clamped to that range for the reported value and
the correction alike (R's own `H-F Pr` column already applies the
upper clamp internally: its P matches the uncorrected P exactly
whenever the raw epsilon is above 1). With exactly two treatments the
clamp's lower bound is 1, so epsilon reads 1 without a special case.
Reported: the ANOVA table above, then GG-epsilon, HF-epsilon (both
clamped), and three P values (uncorrected, GG-corrected, HF-corrected),
with the note saying
which one Prism reports by default (GG, per #50's brief) and that the
other two are shown for comparison. With only two treatments epsilon is
always 1 and every P is identical (Prism says so explicitly for this
case; the results note it instead of showing three equal numbers as if
they meant something).

**Comparisons** reuse one-way ANOVA's equal-SD family (Tukey, Dunnett,
Šidák, Bonferroni) verbatim, against MS(residual) and its df — FAQ
1609's "traditional method", which assumes sphericity and is Prism's
other reported method alongside the "new method" that doesn't (#83).
No Welch-style variant: unlike ordinary ANOVA, "not assuming equal SDs"
isn't the question here (the design already accounts for the repeated
structure through the residual term), so there is exactly one family,
same as `nested-one-way-anova`.

**From summary data:** never — pairing needs every subject's row.

## The Friedman test and Dunn's comparisons

Ranks are taken **within each row** (subject), midranks for ties, then
summed per column. Reported statistic: the chi-square approximation
(`12N / [k(k+1)] · Σ(Rⱼ − N(k+1)/2)²`, adjusted by the standard tie
correction over each row's tied groups, matching R's own
`stats::friedman.test`), df = k − 1, **always labelled "approximate"**.
Prism computes an exact permutation P when (k!)ᴺ ≤ 10⁹, even with ties;
building that (enumerate each row's distinct permutations of its own
tied ranks, convolve the k column rank-sums across rows) is its own
piece of work, split off as #82 — the same call Kruskal-Wallis's exact
P got before it was built (#49; #26's note in 06 gives the reason: no
reference package computes it either). Reported: N (rows kept), k, each
group's rank sum and mean rank, the statistic, df, P.

**Dunn's comparisons**, Prism's formula (FAQ text, and Daniel *Applied
Nonparametric Statistics* 2nd ed. pp. 240–241, the same source note 06
cites for the Kruskal-Wallis version): z = |mean rank A − mean rank B|
/ √(k(k+1) / (6N)) — equivalently, sum-of-ranks difference /
√(Nk(k+1)/6); the two are algebraically the same formula, and Prism's
own text uses the mean-rank form, so that is what the results show.
**No tie correction** in this SE (unlike Kruskal-Wallis's Dunn test,
which does have one) — Prism's own description of the Friedman version
has none, and neither does the cited reference. Two-tailed P from the
normal distribution; **adjusted P = P × (number of comparisons)**,
capped at 1 (`corrected`, Prism's default), shown "> 0.9999" when
capped, same as Kruskal-Wallis. No CIs, same reason: Prism gives none
for a rank-sum comparison.

**From summary data:** never (ranks need values).

## Wiring (grep for every place an analysis kind is matched, note 13)

Two new modules, `src/analyses/repeated/` and `src/analyses/friedman/`,
built on the `oneway` and `kruskal` modules as templates (their
`prepare`/`job`/`parse` shapes, `Named`/`Dropped` reuse). Touch points,
each already listing every other analysis kind:
`src/analyses/registry.ts`, `src/analyses/pairwise.ts` (brackets: both
kinds fit the existing `one-way-anova | kruskal-wallis`-shaped case,
`among(ids, comparisons)` and `r.pairs`), `src/ui/analysisKinds.ts`
(icon, test name), `src/ui/notebook/notes.ts` (margin notes),
`src/ui/shell/AnalyzeDialog.tsx`, `src/ui/shell/chooser.ts` ("help me
choose": replaces the `paired && k > 2` `{kind: 'none', ...#50...}`
placeholder with a real suggestion — bell-shaped values and unsure
resolve to `repeated-measures-anova`, otherwise `friedman`, mirroring
the existing k = 2 paired branch), `src/ui/help/guide.ts` and one new
`docs/guide/` page (18, covering both tests, as 06 covers Mann-Whitney
and Wilcoxon together), `src/io/bsig.ts` (serialisation, both directions),
`src/test/modelArbitraries.ts` (round-trip and `Comparisons`
generators), `src/ui/results/ResultsSection.tsx` (a view per kind — the
conditional chain isn't exhaustive, so a missed one compiles clean and
renders nothing, note 13's own lesson), `src/ui/analytics.ts` (two new
`EVENTS` entries, "ran repeated-measures ANOVA" / "ran Friedman test").

## As built

Repeated-measures ANOVA also runs on **two** groups, not just three or
more: Prism's own guide says so explicitly ("with only two levels...
identical to what they would have been without the option, epsilon
1.0000000"), so the analysis refuses only fewer than two, and the
clamp below makes epsilon read exactly 1 there with no special case.
The Friedman test still needs three or more (Prism doesn't offer it for
two either; Wilcoxon covers that case, as Mann-Whitney's unpaired
sibling does for Kruskal-Wallis).

**Epsilon is clamped to Prism's stated range**, `[1 / (k − 1), 1]`, not
just capped at 1: with very few subjects relative to treatments
(n ≤ k − 1, the `n-2` fixture, two subjects and three treatments) raw
Huynh-Feldt epsilon came back negative and its corrected P a `NaN`
(both confirmed in desktop R before being written into `analysis.R`,
per CLAUDE.md's independent-check habit). Clamping both epsilons the
same way turned out to double as the k = 2 special case: the lower
bound is 1 when k = 2, so the clamp alone forces epsilon to 1 there.

**A genuine oracle bug, caught only by the parity test:** the first
`control` (Dunnett) and `sidak` fixtures failed with the app's P about
three times the oracle's — not obvious noise, since the shape of the
error (a near-constant ratio close to the number of comparisons) was
the tell. Bisecting by calling both `bs_dunnett_p` (the app's function,
shared from `oneway/analysis.R`) and the oracle's own copy directly,
with the exact same arguments, showed them agreeing exactly at every
t value tried — the bug had to be upstream of the function. It was:
`oracle.R`'s `lam <- sqrt(n / (n + n))` computed one lambda (a scalar)
instead of one per comparison sharing the control, so the "joint
probability across the whole family" integral silently ran as if there
were a single comparison, giving roughly `1 / K` of the right answer in
the tail. Fixed to `rep(sqrt(n / (n + n)), length(others))`. Lesson:
when an oracle and the app agree on everything *except* one family of
numbers, and the ratio looks like a small integer, suspect a
count/family-size mismatch before suspecting the shared math.

The `control`, `bonferroni` and `sidak` fixtures share one dataset
(the `basic` fixture's): an earlier version used cleanly-separated
synthetic values whose P values landed at 1e-15 to 1e-28, which is
correct in principle (both `bs_dunnett_p` and the Šidák formula were
independently confirmed exact against each other and, for Šidák,
against a numerically-careful (`-expm1`) rewrite) but needlessly far
past where any of this was validated before; moderate data serves the
fixture's purpose without exploring untested numerical territory.

Comparisons after the ANOVA reuse `bs_comparisons` from
`oneway/analysis.R` directly (the `code` strings concatenated, as
`twoway/index.ts` already does) rather than a fresh implementation:
`v` (variance) unused when `welch = FALSE`, `n` the same for every
group, `mse`/`df` the ANOVA's own residual — an exact fit for the
"traditional method" family, and one less R implementation to keep
correct. `RepeatedMeasuresOptions['comparisons']` reuses
`NestedComparisons` (identical shape to nested one-way ANOVA's), so the
UI panel (`NestedOneWayFields`) and its `.bsig` reader
(`nestedComparisons`) are reused too; Friedman's options are shaped
exactly like Kruskal-Wallis's, so `KruskalFields` is reused the same
way. A new selector, `matchedGroups`, generalises `pairedGroups` from
two ids to any number (kept separate rather than folding the two-ary
case into it: two small near-identical functions over one seldom-called
generic one, as the project already prefers elsewhere).

Checked in the browser (not just Node): a Column table with three
matched columns, through both "Help me choose" (which asks matched,
then values, then control, and lands on the right test in each branch)
and "Pick a test myself"; the results sections, "All numbers", and the
margin notes all rendered correctly, and the console showed nothing
but the expected `PACKAGES.rds` fallback probe (note 04's own fix).
