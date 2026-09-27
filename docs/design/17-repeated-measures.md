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

## #83: comparisons without assuming sphericity (FAQ 1609's "new method")

Written 2026-09-27, before implementing. FAQ 1609 ("Prism 7 offers two
methods to compute multiple comparisons tests following repeated
measures one-way ANOVA. Which should I choose?") describes a second way
to run the comparisons this module already ships: instead of pooling
every group's variability into the ANOVA's own residual MS and df (the
"traditional method", assumes sphericity, shipped by #50), each
pairwise comparison uses only the two columns being compared — exactly
the SE and df an ordinary paired t test would compute for that pair
alone — and then the same multiple-comparisons machinery (Tukey,
Dunnett, Šidák, Bonferroni; the equal-SD family this module already
has, `NestedComparisons`) turns those per-pair t values into adjusted P
values and CIs, the same way it already turns the pooled ones. FAQ 1609
recommends the new method when the data show a real sphericity
violation (the pooled method then under- or overstates some pairs'
significance) and the traditional method when sphericity roughly holds
(the new method has less power per comparison, since each one throws
away every column but its own two).

**This is not a new analysis kind.** It is a second option on the two
kinds this note already ships: `repeated-measures-anova` and
`nested-repeated-anova` (identical shape, per the section above). A new
field, `assumeSphericity: boolean` on `RepeatedMeasuresOptions`
(`src/model/project.ts`), alongside `comparisons`; `true` (the
traditional method, #50's shipped default) unless the user unchecks it.
Old `.bsig` files have no such field and read as `true` — the method
they were saved with.

**The R.** `bs_repeated` (`repeated/analysis.R`) gains a `sphericity`
argument. When `TRUE` it calls `bs_comparisons` exactly as before
(pooled `ms_residual`/`df_residual`). When `FALSE` it calls a new
`bs_repeated_pairwise(Y, comps, control, test)`: for each pair `(i, j)`
from `bs_pairs`, `d <- Y[, i] - Y[, j]`; `diff <- mean(d)`; `se <-
sd(d) / sqrt(n)`; `df <- n - 1` — literally a paired t test's own
numbers, one pair at a time. The rest of `bs_comparisons`'s body (the
`tukey`/`bonferroni`/`sidak`/`dunnett` switch that turns `diff`, `se`,
`df` into an adjusted P, CI and statistic) is pulled out into a shared
`bs_apply_correction(diff, se, dfs, k, pairs, n, control, test)`, called
by both the pooled and the new pairwise path — a pure refactor of
`oneway/analysis.R` (touches every analysis that reuses
`bs_comparisons`: one-way, two-way, nested one-way, both repeated-measures
kinds), checked against the untouched oracle fixtures for all of them
before this note's own new fixtures are added, since it must not change
a single existing number.

**Dunnett's shared-control correlation** (`lam`, inside
`bs_apply_correction`) already depends only on sample sizes (`n`), not
variances — unchanged by which path fed it `diff`/`se`/`dfs`. Every row
in a repeated-measures analysis is complete (the analysis refuses
otherwise), so `n` is the same for every pair either way, and `lam`
comes out identical in both methods (`sqrt(1/2)` for the equal-n case).
This matches Prism's own documented approach for the new method:
FAQ 1609 doesn't describe a fresh joint distribution over the family
that accounts for the real covariance between differently-paired
comparisons (something no reference implementation computes either,
the same reason note 06 split off Kruskal-Wallis's and this module's
own exact tests as their own issues rather than hand-deriving one) — it
reuses the same per-family correction shape, only the per-pair inputs
change. No Welch-style test names (`games-howell`/`dunnett-t3`/
`tamhane-t2`) enter this path; the "new method" keeps the same four
test names (`tukey`/`dunnett`/`sidak`/`bonferroni`) FAQ 1609 itself
uses for both of Prism's methods.

**Oracle independence** (CLAUDE.md's Correctness section):
`repeated/oracle.R`'s reference gains a `sphericity` argument. The
pooled path is untouched. The new path calls base R's `t.test(m[, i],
m[, j], paired = TRUE)` per pair — a different R function than either
the app's or the oracle's own hand-rolled `sd(d) / sqrt(n)` — for
`diff`/`se`/`df`, then the same textbook `ptukey`/`qt`/`pt`/the
oracle's own `dunnett()` integral already used for the pooled fixtures,
independent of the app's `bs_apply_correction`.

**Fixtures** (`repeated/fixtures/`, generated by `oracle:generate
repeated`): the standard set run with `sphericity = FALSE` — Tukey,
Dunnett, Šidák and Bonferroni each once, a dropped-row case, ties, and
the fewest-rows (`n = 2`) case — plus a discriminating case reusing the
`high-sphericity-violation` dataset (g3 swings independently of the
other three) with both methods, chosen because it is exactly the
scenario FAQ 1609 says the two methods should disagree on: the pooled
method's single residual is inflated by g3's independent swings for
every pair, while the new method's per-pair SE reflects only the two
columns actually being compared.

**UI.** `NestedOneWayFields` (`AnalyzeDialog.tsx`, shared by nested
one-way ANOVA and both repeated-measures kinds) gains an optional
`sphericity` prop, rendered only for the two kinds that have the field:
a checkbox, "Don't assume sphericity for these comparisons (compute
each one from just its own two groups, FAQ 1609's method)", the same
"Don't assume ..." framing item 06's Welch checkbox already uses for
one-way ANOVA. Results (`ResultsSection.tsx` / `reading.ts`'s
`repeatedMethod`/`nestedRepeatedMethod`) state which method produced
the comparisons shown, every time — never a silent default, per
CLAUDE.md's "text a user reads about statistics is part of correctness"
lesson. The guide page (`docs/guide/18-repeated-measures.md`) gets a
short section on when FAQ 1609 recommends each.
