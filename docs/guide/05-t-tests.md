# t tests

A t test asks whether the means of two groups differ by more than chance
would explain. It is the test behind most two-bar graphs with an
asterisk.

## When to use it

- **Two groups** in a Column table, for example control and treated.
- The values come from a roughly **Gaussian** (bell-shaped) distribution,
  or there are enough of them that small departures don’t matter.
- **Not for three or more groups:** running a t test on every pair makes
  a chance “significant” result more likely. Use
  [one-way ANOVA](07-one-way-anova.md), which adjusts for that.
- **Not for skewed values** such as counts with a few very large ones:
  consider the [Mann-Whitney or Wilcoxon test](06-rank-tests.md).

## Unpaired, paired and Welch

- **Unpaired:** different subjects (samples, animals, wells) in each
  group. It assumes the values in each group are independent and
  Gaussian and, unless you choose Welch’s correction, that both groups
  have the same SD.
- **Welch’s correction** drops the equal-SD assumption. Use it when the
  groups clearly differ in spread.
- **Paired:** each row is one subject measured in both groups (before and
  after, left and right, cells from the same animal). The test works on
  the difference within each row, so variation between subjects drops
  out. It assumes those differences are Gaussian. Values pair by row; a
  row with a value missing on either side is left out of the test.

## Running it

Click **Analyze…** on the table, then the **t test** tile, and tick the
two groups under **Which two groups?**. The options:

- **How were the data collected?** “Unpaired: different subjects
  (samples, animals, wells) in each group” (the default), or “Paired: each
  row is one subject measured in both groups (before and after, matched
  pairs)”.
- **Standard deviations** (unpaired only): “Don’t assume both groups have
  the same SD (Welch’s correction)”. Off by default, as in Prism.
- **P value:** “Two-tailed (recommended)”, or “One-tailed: only if you
  predicted which group would be higher before collecting the data”.
- **Before the test:** for an unpaired t test on individual values,
  “Also test each group for normality (a separate analysis)”, ticked by
  default. It adds a [normality tests](10-normality.md) sheet for the
  same two groups. A paired t test assumes the differences within rows
  are Gaussian, not the groups, so it offers a different box instead:
  “Also test the paired differences for normality (a separate
  analysis)”, which runs the same two tests once, on the differences
  (see [Normality tests: the paired case](10-normality.md#the-paired-case)).

**From summary data** (mean with SD, SEM or %CV, and n) the unpaired test,
with or without Welch’s correction, works as Prism’s does. The paired
option is greyed out: pairing needs the individual values. Formats
without n can’t be tested.

The sheet explains when the test can’t run, for example when fewer or
more than two groups are chosen, when a group has fewer than two values,
or when a paired test has fewer than two complete rows.

## Reading the results

The sentence at the top says whether the means differ and in which
direction, or that there is “no evidence” they differ, which doesn’t
show they are the same. The sections:

- **Unpaired t test** (or **Unpaired t test with Welch’s correction**,
  or **Paired t test**): **P value**, **P value summary** (the
  asterisks), **Significantly different (P < 0.05)?**, **One- or
  two-tailed P value?** and **t, df** (the test statistic and its
  degrees of freedom; with Welch’s correction df is usually not a whole
  number).
- **How big is the difference?** For an unpaired test: each group’s
  mean, the **Difference between means (B − A) ± SEM**, its **95%
  confidence interval** and **R squared (eta squared)**, the share of
  the variation explained by the grouping. For a paired test: the mean,
  SD and SEM of the differences, their 95% confidence interval and
  **R squared (partial eta squared)**.
- **F test to compare variances** (unpaired): whether the two SDs differ,
  so you can see whether Welch’s correction would matter.
- **How effective was the pairing?** (paired): the correlation between
  the two groups (r) with a one-tailed P. A significant r means subjects
  that were high in one group tended to be high in the other, so pairing
  helped.
- **Data analyzed:** the sample size of each group, with how many empty
  or [excluded](02-data-entry.md#excluding-a-value) values were left
  out; for a paired test, the number of pairs and rows left out.

The difference is always **the second group minus the first** (B − A),
as Prism reports it. The asterisks: ns P ≥ 0.05, `*` P < 0.05,
`**` P < 0.01, `***` P < 0.001, `****` P < 0.0001.

**One-tailed P** is half the two-tailed P, as in Prism. The sheet
reminds you it is only valid if you predicted the direction before
collecting the data.

## Prism and BarelySig

Prism runs these under “t tests (and nonparametric tests)”. The options,
defaults (unpaired, no Welch’s correction, two-tailed) and results match
Prism’s. The results are checked against R’s own `t.test` on test cases
that include missing values, unequal sizes, ties, n = 2, zero spread, an
outlier and a P near 1e−20; summary-data results are checked against
`t.test` on values with that mean, SD and n.

## On a graph

A graph of the table offers the t test as a significance bracket over
the two groups. See [Graphs](12-graphs.md).
