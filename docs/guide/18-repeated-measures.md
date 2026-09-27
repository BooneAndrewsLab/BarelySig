# Repeated-measures ANOVA and the Friedman test

These compare three or more groups measured on the **same rows** — the
same mice, patients, or a sample split three or more ways — one row per
subject, one column per group. They are the three-or-more-group versions
of the paired t test and the Wilcoxon test.

- **Repeated-measures ANOVA:** assumes the values are roughly
  bell-shaped. The matched version of [one-way ANOVA](07-one-way-anova.md).
- **Friedman test:** ranks within each row instead, so it doesn’t need a
  bell-shaped distribution. The matched version of the
  [Kruskal-Wallis test](08-kruskal-wallis.md).

## When to use them

- **Three or more matched groups** in a Column table, one subject per
  row. (Repeated-measures ANOVA also runs on two, where it gives the
  same P as the paired t test; the Friedman test needs three or more,
  the same as Kruskal-Wallis needs for unmatched groups.) For two
  groups, [the paired t test or Wilcoxon test](05-t-tests.md) is the
  usual choice.
- A row with a value missing in any group is left out of the whole row,
  not just the group it’s missing from.
- **Not from summary data:** both need the individual values.
- For matched replicates in a Nested table (a SuperPlot), see
  [Nested tables](17-nested-tables.md); that piece isn’t built yet
  (issue #71).

## Running it

Click **Analyze…**, then **Repeated-measures ANOVA** or **Friedman
test**, and tick the groups. The multiple-comparisons options are the
same as [one-way ANOVA](07-one-way-anova.md#running-it)’s and
[Kruskal-Wallis](08-kruskal-wallis.md)’s: compare every group with every
other, against a control, or run only the overall test.

Repeated-measures ANOVA always assumes every group has the same SD
(there is no Welch-style option): the design already accounts for each
subject's own baseline. Its comparisons (Tukey, Dunnett, Šidák or
Bonferroni) can be computed either of two ways — see below.

## Two ways to compute the comparisons

- **Assume sphericity (default).** Every comparison shares the ANOVA
  table's own pooled residual, the same way ordinary one-way ANOVA's
  comparisons do. This is the more powerful choice when the groups do
  vary together about the same amount.
- **Don't assume sphericity.** Each pair is computed from just its own
  two groups, exactly as if you'd run a paired t test on those two
  columns alone, then adjusted for the number of comparisons the same
  way. This is GraphPad's own recommendation when the groups clearly
  don't vary together the same way (a low epsilon, or a group whose
  ups and downs don't track the others): the pooled method can then
  make some pairs look more (or less) significant than they should,
  because it borrows scatter from every group, including ones that
  have nothing to do with the pair being compared. The trade-off: each
  comparison now uses less data, so it has less power on its own.

Tick the checkbox under the comparisons options to switch. The results
always say which method produced the numbers shown, right under the
headline — never a silent default.

## Sphericity and the Geisser-Greenhouse correction

Repeated-measures ANOVA assumes the groups vary together the same way
(**sphericity**). When they don’t, the plain P value is too small.
BarelySig reports **epsilon** (1.0 = no violation; it falls as low as
1 / (groups − 1)) and, by default, the **Geisser-Greenhouse corrected P**
— Prism’s default too. The uncorrected P and the alternative
Huynh-Feldt correction are under “All numbers”. With exactly two groups
epsilon is always 1 and every P agrees.

## Reading the repeated-measures ANOVA results

- **ANOVA summary:** **F**, the Geisser-Greenhouse corrected **P value**
  (the one the reading goes by), **epsilon**, the uncorrected and
  Huynh-Feldt P values, and two **R squared** values: how much of the
  variation is the treatment effect, and how much is the matching
  (how similar each subject’s own values are to each other).
- **ANOVA table:** Treatment, Subjects (matching) and Residual, each with
  SS, DF and MS; F is treatment MS ÷ residual MS.
- **Data summary:** each group’s mean.
- **Data analyzed:** the number of subjects (complete rows) and any left
  out for a missing value.
- **Multiple comparisons**, one row per pair, as one-way ANOVA’s.

## Reading the Friedman results

- **Friedman test:** **P value** (always approximate, chi-square),
  **P value summary**, **Friedman statistic**, the number of groups.
- **Data summary:** each group’s sum and mean of ranks.
- **Data analyzed:** the number of subjects and any rows left out.
- **Multiple comparisons (Dunn’s test)**, one row per pair: **Mean rank
  diff.**, **Significant?**, **Summary** and the P value, adjusted for
  the number of comparisons unless you turned that off. No confidence
  intervals, as Prism gives none here.

The asterisks: ns P ≥ 0.05, `*` P < 0.05, `**` P < 0.01, `***` P < 0.001,
`****` P < 0.0001.

## Prism and BarelySig

Prism calls these “Repeated measures one-way ANOVA” and “Friedman test”
(nonparametric). Where they differ:

- **Friedman’s exact P:** Prism computes an exact permutation P for
  small tables; BarelySig always uses the chi-square approximation for
  now (issue #82), as Kruskal-Wallis did before its own exact P was
  built.
- Two-way repeated-measures ANOVA (one or both factors repeated, from a
  Grouped table) isn’t built yet (issue #81).

Everything is checked against R’s own `anova.mlm` (Geisser-Greenhouse and
Huynh-Feldt epsilon), `aov`, `stats::friedman.test` and `t.test` (each
pair, for the sphericity-free comparisons), with `TukeyHSD` and the
multcomp package as second checks, on cases with ties, missing values,
and a strong sphericity violation.

## On a graph

A graph of the table offers one significance bracket per comparison,
labelled from its adjusted P; you can hide any of them. See
[Graphs](12-graphs.md).
