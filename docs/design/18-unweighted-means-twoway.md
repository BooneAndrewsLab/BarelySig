# 18. Two-way ANOVA from unbalanced summary data

Written 2026-09-27 before building #51. Builds on note 06 (two-way ANOVA,
#27), which shipped the exact case (every cell the same n) and left
unequal n as this follow-up, with `prepare` refusing and asking for the
individual values in the meantime.

## What was asked

#51: "Two-way ANOVA from mean, SD and n works when every cell has the
same n (exact). With unequal n Prism uses 'analysis of unweighted means'
(Fisher and van Belle, Biostatistics, 1993), which it says is only
approximately correct; we refuse and ask for the values. Implement
Prism's method, say in the results that it is approximate, and validate
against a written-out reference."

GraphPad's Statistics Guide (`how_prism_computes_two-way_anova.htm`)
confirms the citation but doesn't print the formulas: "If your data are
unbalanced, it is impossible to calculate precise results from data
entered as mean, SD (or SEM), and n. Instead, Prism uses a simpler method
called analysis of unweighted means... If your sample sizes are not all
the same, these results will only be approximately correct. If your data
are almost balanced (just one or a few missing values), the
approximation is a good one." Prism still recommends entering the
individual values when unbalanced; unweighted means is there for when
only summary numbers exist. The formulas below are the classical "method
of unweighted means" (harmonic-mean weighting), attributed to Fisher and
van Belle and printed in essentially the same form by Winer (1971) and
Howell (*Statistical Methods for Psychology*); no full derivation is
public from GraphPad itself, so the independent reference used to
validate this (see Validation) is written from that textbook method
directly, not from Fisher and van Belle's book (not to hand).

## Why the existing exact method can't just drop its restriction

The exact path (`bs_twoway_summary`, unchanged) reconstructs synthetic
per-cell values with exactly the entered mean, SD and n, then runs the
same Type III regression the raw-values path uses. That reconstruction
is not an approximation: a saturated (with-interaction) OLS fit's
projection onto any reduced model depends on the data only through each
cell's mean and count, so reconstructed data with the right per-cell
mean and n gives the *exact* Type III sums of squares — for any n,
balanced or not. Removing the equal-n restriction there would therefore
compute the exact **weighted-means** analysis (equivalent to running the
regression on the real replicates), which is a *better* answer than
Prism's own for unbalanced summary data, but a *different* one: Prism
does not do this reconstruction and instead falls back to the older,
approximate unweighted-means method for its summary-data entry. Since a
core project principle is Prism parity ("every statistical output
matches a reference implementation" means matching what Prism reports,
including its acknowledged approximations, not silently doing better),
#51 asks for Prism's actual method, not the exact one dressed up as a
follow-up. So this is new code, not a relaxed guard on the old code.

## The method of unweighted means

Given the R×C grid of cell means Ȳ<sub>rc</sub>, SDs s<sub>rc</sub> and
counts n<sub>rc</sub> (every cell filled — summary-data entry already
requires that; there is no empty-cell case to consider here, unlike the
raw-values path):

- Harmonic mean of the cell counts: n<sub>h</sub> = RC / Σ(1/n<sub>rc</sub>).
- Unweighted grand, row and column means: the plain average of the cell
  means (not weighted by n) — Ȳ.. , Ȳ<sub>r.</sub> = mean over columns of
  row r, Ȳ<sub>.c</sub> = mean over rows of column c.
- SS(row) = C·n<sub>h</sub>·Σ<sub>r</sub>(Ȳ<sub>r.</sub> − Ȳ..)², df = R−1.
- SS(column) = R·n<sub>h</sub>·Σ<sub>c</sub>(Ȳ<sub>.c</sub> − Ȳ..)², df = C−1.
- SS(interaction) = n<sub>h</sub>·Σ<sub>rc</sub>(Ȳ<sub>rc</sub> − Ȳ<sub>r.</sub> − Ȳ<sub>.c</sub> + Ȳ..)²,
  df = (R−1)(C−1).
- SS(residual) = Σ<sub>rc</sub>(n<sub>rc</sub> − 1)s<sub>rc</sub>² (the
  ordinary pooled within-cell variance — this part needs no
  approximation: it's exact regardless of balance, and it's the same
  number the exact path's saturated-model residual gives), df = N − RC.
- F and P as usual, MS = SS/df, F = MS(term)/MS(residual).
- "% of total variation" is against SS(row)+SS(column)+SS(interaction)+
  SS(residual); with unequal n this doesn't equal Σ(y−ȳ)² any more than
  the exact unbalanced case's does (note 06 already accepts that), so
  it's the same caveat, not a new one.

This reduces to exactly the balanced formulas when every n<sub>rc</sub>
is the same (n<sub>h</sub> = n, and the unweighted means equal the
weighted ones since every cell already carries equal weight), which is
both the textbook's own statement of when the method is exact and a
useful internal check: the new code and the old exact code must agree
bit-for-bit on a balanced fixture.

**Comparisons** (post-hoc) need no new formulas at all: `bs_comparisons`
(reused from `oneway/analysis.R`, as the exact path already does) only
needs each family's means, an effective size per mean and MS(residual)/
df(residual) — and MS(residual) here is the *same* pooled within-cell
number as the exact path's, because the residual term was never
approximated. The existing `bs_twoway_comparisons`, unchanged, is called
with the real cell means and real per-cell n exactly as before.

## What's still exact vs. approximate, in one line

Only the row, column and interaction SS/DF/MS/F/P (the "Source of
variation" table) are Prism's approximation; the cell means/SDs/ns
table, the residual line, and every multiple comparison are computed
the same way as the exact path, because none of those ever depended on
the balance of the design in the first place.

## Result shape

`TwoWayResult` gains one field: `approximate: boolean`. `true` only for
this new path; the raw-values path and the balanced-summary path both
report `false` (added once, in `bs_twoway`'s own output, so the exact
summary path inherits it through the reconstruction it already does).
The results view's method line appends a sentence when `approximate` is
set, naming Fisher and van Belle and recommending the individual values
for an exact result; the guide page gets the same correction (its
"Prism and BarelySig" list said BarelySig simply refuses — now it says
what BarelySig does instead, and that it's Prism's own acknowledged
approximation, not a BarelySig shortcut).

Module version bumped 2 → 3 (`src/analyses/twoway/index.ts`): the R code
changed and the result gained a field, so old cached results are stale
(the version is part of the input hash, per `src/analyses/module.ts`).

## Scope left out

- **Comparisons with an empty cell** (#52) is untouched: summary-data
  entry already requires every cell filled before reaching this code at
  all, so an "empty cell" can't arise on this path. Nothing here changes
  #52's scope.
- **Repeated measures** (#81/#83) are a different table shape and
  options entirely; this module isn't touched by them and doesn't touch
  them.
- **A design with some cells at n = 1 and others with replicates**
  works (n = 1 cells contribute 0 to the pooled residual SS and df, same
  as the exact path already does per-cell), but a design where *every*
  used cell has n = 1 never reaches this new code at all — that's the
  existing equal-n path (all ns equal, at 1), unaffected.

## Validation

`oracle.R` gets a second, independent `setup` for the unbalanced-summary
fixtures: `unweighted_means`, written directly from the textbook formulas
above (harmonic mean, unweighted row/column/grand means, pooled residual)
rather than by calling the app's own `analysis.R` — the same "written-out
reference" #51 asks for, and the same independence CLAUDE.md's Lessons
require of every oracle. Fixtures cover: two unbalanced cells among
balanced ones (Prism's "almost balanced" case), several cells all
different, a cell with n = 1 mixed with replicated cells, and a check
that feeding the unbalanced oracle a balanced input reproduces the
existing exact fixture's numbers exactly (the reduction above, checked
by `all.equal` with a tight tolerance, not just approximately).
