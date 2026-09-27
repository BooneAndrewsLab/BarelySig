# 14. Matched replicates in a Nested table

Written 2026-09-26 for #70, after the SuperPlot was redrawn against Lord
et al. (2020), Fig. 1. Builds on note 13 (Nested tables, the nested t
test). Split out: #71 (matched nested one-way ANOVA, after #50), #72
(the unmatched test's calibration).

## What was asked

The SuperPlots paper computes a SuperPlot's P with a **paired** t test
on the replicate means: replicate 1 in Control and replicate 1 in Drug
are one experiment (same day, same cells), run side by side. Note 13's
nested t test treats each group's replicates as separate experiments,
so it can't use that. That matters most in the paper's panel C: the
days differ a lot, the drug lowers the value on every one. On a
simulation of the figure's three scenarios (the same cells, grouped
into experiments differently; the sample file made for the SuperPlot
fix):

| scenario | paired t on replicate means | nested (unmatched) |
|---|---|---|
| B. high repeatability | 0.009 | 0.0002 |
| C. day-to-day variability | 0.007 | 0.11 |
| D. one random run | 0.21 | 0.09 |

Without the matching, C and D can't be told apart, which is the point
of the figure.

## Where "matched" lives

On the analysis, as the t test's `paired`: `NestedTTestOptions` gains
`matched: boolean` (default false, as Prism's tests default to
unpaired; files from before this note read as false). Matching is a
fact about how the experiment was run, and a table's `replicateTitles`
already name replicate n the same in every group, so replicates pair
**by position** (subcolumn n with subcolumn n). A replicate with values
in one group only has no partner and is left out of both — the domain
rule for paired tests ("a row with a missing value on either side drops
out of the pair") applied to replicates; the results name it. Empty in
both: dropped and counted as before.

## Which test

Two candidates:

1. **A REML mixed model** with a random experiment effect and a random
   group-within-experiment effect: `lme(value ~ group, random = ~1 |
   replicate/group)` (here nlme's nesting operator is right: neither
   level is a fixed effect; compare note 13). It weighs replicates by
   their size, as the unmatched test does. With complete, balanced data
   and positive variance estimates it equals the paired t test exactly
   (panel C: P = 0.00703 both ways).
2. **A paired t test on the replicate means**: the paper's test, and
   what its Prism tutorial does (Fig. S2 E–F: enter the replicate means
   in a Column table, run a paired t test).

They differ when a variance component is estimated at zero, which is
common with three replicates (panels B and D above: 0.0057 vs 0.0089,
0.16 vs 0.21). Which is right was measured, not argued:
`scripts/sim/nested-calibration.R` simulates experiments with **no**
difference and counts P < 0.05 (1,500 each; a calibrated test gives
0.05):

| replicates × cells; experiment SD, group-in-experiment SD, cell SD | REML model | paired t on means |
|---|---|---|
| 3 × 30; 5, 1, 7 | 0.000 | 0.040 |
| 3 × 30; 0.5, 1, 7 | 0.000 | 0.045 |
| 3 × 30; 5, 3, 7 | 0.022 | 0.058 |
| 3 × 30; 0, 0.5, 7 | 0.000 | 0.052 |
| 5 × 30; 2, 1, 7 | 0.014 | 0.045 |
| 3 × 30; 2, 0, 7 | 0.000 | 0.053 |

The mixed model with containment df is far too conservative: it would
almost never find anything with three replicates. The paired t test on
the means is exact (the replicate means are independent pairs whatever
the variance components). **Chosen: the paired t test on the replicate
means.** Its cost: every replicate weighs the same however many cells
it has; the paper says to keep those numbers similar, and the guide
says so too. It needs no R package (the unmatched test loads nlme).

The same simulation, run on the unmatched design, shows note 13's test
(Prism's REML method) is also conservative when replicates hardly
differ (0.004–0.010 where it should be 0.05). It never gives a false
positive, and it is Prism's method, so changing it is a parity decision
for the user: #72.

Prism: GraphPad's guide describes no matched design for its nested t
test; the paired t test on the replicate means is the paper's own Prism
route. Intentional difference: BarelySig offers it as an option of the
nested t test, so the user doesn't retype the means into another table.

## Reported

As the paired t test reports (note 04): t, df = pairs − 1, P (half for
one-tailed), the mean of the differences (B − A) with SE and 95% CI,
the SD of the differences, and, with three or more pairs, Prism's "was
the pairing effective?" (Pearson r of the replicate means, one-tailed
P). Group means are the means of their replicate means (what the
SuperPlot's line shows). "Data analyzed" gives the number of pairs, the
values in each group, and the replicates left out for having no
partner. No between/within-replicate SDs: there is no model.

The result is a union on `design: 'nested' | 'matched'`; results saved
before this note have no `design` and read as 'nested'.

## Three or more groups

The matched analogue is a repeated-measures one-way ANOVA on the
replicate means, with its sphericity question and matched comparisons —
#50's work. Split out as #71; until then "Help me choose" says so for
matched Nested tables with three or more groups, as it does for matched
Column tables.

## "Help me choose"

A Nested table now gets one question — is "Day 1" (the first
replicate's name) the same experiment in every group? — and never the
distribution question (the tests work on replicate means or a model of
them).

## As built

As above. Fixtures (`src/analyses/nested-ttest/oracle.R`, textbook
paired t and Pearson r from each replicate's own average, held to R's
`t.test(paired = TRUE)` and `cor.test()`): a consistent trend over very
different days (panel C in small), a direction that changes day to day
(panel D; negative pairing r), two pairs (df = 1, no r), and six ragged
replicates with P ≈ 5e-14.
