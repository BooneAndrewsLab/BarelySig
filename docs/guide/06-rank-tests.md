# Mann-Whitney and Wilcoxon tests

These compare two groups without assuming a bell-shaped distribution.
Instead of the values themselves they use their **ranks** (smallest = 1,
next = 2, and so on), so one very large value can’t dominate the result.
Tests like this are called **nonparametric**.

- **Mann-Whitney test:** two groups of different subjects. The
  nonparametric version of the unpaired t test.
- **Wilcoxon matched-pairs signed-rank test:** the same subjects in both
  groups, one per row. The nonparametric version of the paired t test.

## When to use them

- Values that are clearly not Gaussian: skewed, scores, counts with a few
  very large ones.
- **Not with very few values.** Ranks carry less information than values,
  so with small groups these tests can never give P < 0.05, however
  different the groups are: for example 3 values against 3 in a
  Mann-Whitney test, or 5 pairs or fewer in a Wilcoxon test. The sheet
  says so when that is the case.
- **Not from summary data:** ranks need the individual values. Use a
  [t test](05-t-tests.md) there.
- For three or more groups use the
  [Kruskal-Wallis test](08-kruskal-wallis.md).

They assume the values are independent (for Wilcoxon: the pairs are).
They compare whole distributions, so the sheet says values in one group
“tend to be higher”, not that the means or medians differ.

## Running it

Click **Analyze…**, then **Mann-Whitney / Wilcoxon**, and tick two groups
under **Which two groups?**. The options:

- **How were the data collected?** “Unpaired” gives the Mann-Whitney
  test, “Paired” the Wilcoxon test; a line under the choice says which.
- **Rows where both values are the same** (paired only): the difference
  in that row is zero and has no sign. “Leave them out (Wilcoxon’s
  method, as Prism by default)”, or “Rank them, but count them for
  neither side (Pratt’s method)”.
- **P value:** “Two-tailed (recommended)”, or “One-tailed: only if you
  predicted which group would be higher before collecting the data”.

The Wilcoxon test pairs values by row; a row with a value missing on
either side is left out.

## Exact or approximate P

BarelySig computes an **exact P** by counting every way the values could
have been shuffled between the groups, even when some values are tied, as
Prism does:

- Mann-Whitney: when the smaller group has 100 values or fewer (very
  large or very lopsided data sets fall back to the approximation).
- Wilcoxon: below 200 pairs.

Above that it uses the normal approximation with a correction for ties
and for continuity. The row **Exact or approximate P value?** says which.

## Reading the Mann-Whitney results

- **Mann-Whitney test:** **P value**, **Exact or approximate P value?**,
  **P value summary** (the asterisks), **Significantly different
  (P < 0.05)?**, **One- or two-tailed P value?**, the sum and mean of the
  ranks in each group, and **Mann-Whitney U** (the smaller of the two U
  values, as Prism reports it).
- **Difference between medians:** each group’s median, the actual
  difference (B − A), and the **Hodges-Lehmann** estimate: the median of
  all differences between a value of B and a value of A, a robust
  estimate of how far apart the groups are. Below it the confidence
  interval of that difference.
- **Data analyzed:** each group’s sample size and any values left out.

## Reading the Wilcoxon results

- **Wilcoxon matched-pairs signed-rank test:** the P rows as above, the
  **Sum of positive ranks** (rows where B is higher), the **Sum of
  negative ranks** (B lower, shown as a negative number, as Prism does)
  and **Sum of signed ranks (W)**.
- **Median of differences:** each group’s median, the median of the
  differences (B − A), the **Hodges-Lehmann estimate** and its confidence
  interval.
- **How effective was the pairing?** Spearman’s rank correlation between
  the two groups with a one-tailed P. A significant r means pairing
  helped.
- **Data analyzed:** the number of pairs, how many had no difference and
  what was done with them, and rows left out.

## The confidence level isn’t exactly 95%

With ranks, only certain confidence levels are possible. BarelySig takes
the smallest level of at least 95% and labels it, for example
**96.83% CI of difference**. With very small groups even the widest
interval covers less than 95%; the label then says “the widest possible
with so few values”.

The asterisks: ns P ≥ 0.05, `*` P < 0.05, `**` P < 0.01,
`***` P < 0.001, `****` P < 0.0001. One-tailed P is the tail in the
direction observed.

## Prism and BarelySig

Prism has these under “t tests (and nonparametric tests)”. Where they
differ:

- **Confidence level:** Prism picks the level “as close as possible” to
  95%; BarelySig never goes below 95% when it can avoid it.
- **Very large tied samples:** where counting would take too long in the
  browser, BarelySig uses the approximation (and says so) where Prism
  would still count exactly.
- **Pairing P (Spearman):** exact up to 9 pairs without ties, an
  approximation above; Prism is exact up to 17 pairs, so the last digits
  of this secondary P can differ between 10 and 17 pairs.

The P values are checked against brute-force counts of every shuffle, R’s
`wilcox.test` and the coin package’s exact tests, on cases with ties,
zero differences, unequal sizes, n = 2 and very small P values.

## On a graph

A graph of the table offers the test as a significance bracket over the
two groups. See [Graphs](12-graphs.md).
