# Kruskal-Wallis test

The Kruskal-Wallis test compares three or more groups without assuming a
bell-shaped distribution. It ranks all the values together (smallest =

1. and asks whether the ranks are shared out among the groups more
   unevenly than chance would explain. It is the nonparametric counterpart of
   [one-way ANOVA](07-one-way-anova.md); **Dunn’s test** then says which
   pairs of groups differ.

## When to use it

- **Three or more groups** of different subjects in a Column table, with
  values that are clearly not Gaussian: skewed, scores, counts with a few
  very large ones.
- The values must be independent of each other.
- **Not with very few values:** with 7 values or fewer in all, the test
  can’t give P < 0.05 however different the groups are, and the sheet
  says so.
- **Not from summary data:** ranks need the individual values. Use
  one-way ANOVA there.
- **Not for matched groups** (the same subjects in every group): use the
  [Friedman test](18-repeated-measures.md) instead.
- For two groups use the [Mann-Whitney test](06-rank-tests.md).

Like other rank tests it compares whole distributions: a significant
result means values in at least one group tend to be higher or lower
than in the others.

## Running it

Click **Analyze…**, then **Kruskal-Wallis**, and tick the groups. The
options:

- **Which groups differ? (Dunn’s multiple comparisons):** “Compare every
  group with every other group” (the default), “Compare every group with
  a control group” (then pick the **Control group**), or “Only the
  overall test”.
- **Adjust each P for the number of comparisons (recommended, as
  Prism)**, ticked by default. Adjusting keeps the 5% chance of a false
  “significant” result for the whole set of comparisons, not for each
  pair. Untick it only if you have a reason; the sheet then warns that
  the P values aren’t adjusted.

## Exact or approximate P

For small samples BarelySig counts every way the values could have been
shared out among the groups, even with ties, and gives an **exact P**:
for example three groups of up to 6 values, or four groups of 3. Larger
samples (four groups of 4, three of 7, five of 2 and anything bigger) get
the usual **chi-square approximation**, which is accurate there. The
choice depends on the group sizes, never on how fast your computer is.

## Reading the results

The sentence at the top says whether the groups differ, then which pairs
Dunn’s test finds. A P of 0.05 or more is “no evidence” of a difference,
not proof that the groups are the same.

- **Kruskal-Wallis test:** **P value**, **Exact or approximate P
  value?**, **P value summary** (the asterisks), **Do the groups differ
  significantly (P < 0.05)?** (Prism asks whether the medians vary, but
  the test compares whole distributions, not only medians), **Number of groups** and
  the **Kruskal-Wallis statistic** (H).
- **Data summary:** each group’s n, median, sum of ranks and mean rank,
  with any empty or excluded values left out.
- **Dunn’s multiple comparisons test** (or **Uncorrected Dunn’s…**), one
  row per pair: **Mean rank diff.** (the first group’s mean rank minus
  the second’s), **Significant?**, **Summary** and **Adjusted P value**
  (or **Individual P value** when not adjusted).
- **Test details:** both mean ranks, their difference, both n and Z.

The adjusted P is the individual P multiplied by the number of
comparisons, capped at 1 (shown as `> 0.9999`). Dunn’s test gives no
confidence intervals, as in Prism. The asterisks: ns P ≥ 0.05,
`*` P < 0.05, `**` P < 0.01, `***` P < 0.001, `****` P < 0.0001.

If the overall test and the comparisons disagree near the threshold, the
reading says why: they ask different questions.

## Prism and BarelySig

Prism runs this from its one-way ANOVA dialog, as the nonparametric
choice. H is corrected for ties and Dunn’s test uses Prism’s formula.
Prism also computes an exact P for small samples but doesn’t say where
it stops, so for some group sizes one program may give an exact P and
the other an approximate one.

The numbers are checked against R’s `kruskal.test`, the dunn.test
package, and, for the exact P, brute-force counts of every possible
shuffle, on cases with ties, missing values, unequal sizes, n = 2, an
outlier and a very small P.

## On a graph

A graph of the table offers one significance bracket per Dunn’s
comparison. See [Graphs](12-graphs.md).
