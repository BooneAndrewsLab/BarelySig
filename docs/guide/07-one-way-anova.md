# One-way ANOVA

One-way ANOVA (analysis of variance) asks whether the means of three or
more groups all agree, for example a vehicle and three doses. It answers
in two steps: first whether any group differs, then, with **multiple
comparisons**, which pairs of groups differ.

## When to use it

- **Three or more groups** of different subjects in a Column table. (It
  also runs on two groups, where it gives the same P as an unpaired t
  test.)
- The values are roughly **Gaussian** (bell-shaped) in each group, and
  independent of each other.
- Ordinary ANOVA also assumes every group has the **same SD**. If the
  spreads clearly differ, use the Welch option below.
- **Not for matched groups** (the same subjects in every group): use
  [repeated-measures ANOVA](18-repeated-measures.md).
- **Not for skewed values:** consider the
  [Kruskal-Wallis test](08-kruskal-wallis.md).

## Running it

Click **Analyze…**, then **One-way ANOVA**, and tick the groups. The
options:

- **Standard deviations:** “Don’t assume all groups have the same SD
  (Welch’s and Brown-Forsythe ANOVA)”. Off by default, as in Prism.
- **Which groups differ? (multiple comparisons):** “Compare every group
  with every other group” (the default), “Compare every group with a
  control group” (then pick the **Control group**), or “Only the overall
  ANOVA”.
- **Test:** which multiple comparisons test. The list depends on the two
  choices above:

|                   | Same SDs assumed                         | Welch’s option                                                                                                  |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Every pair        | Tukey (recommended), Bonferroni, Šidák   | Games-Howell (recommended for large samples), Dunnett T3 (recommended with fewer than 50 per group), Tamhane T2 |
| Against a control | Dunnett (recommended), Bonferroni, Šidák | Dunnett T3 (recommended with fewer than 50 per group), Tamhane T2                                               |

- **Before the test:** “Also test each group for normality (a separate
  analysis)”, ticked by default when you create the ANOVA on individual
  values. See [Normality tests](10-normality.md).

Each comparison’s P is **adjusted** for the number of comparisons, so the
5% chance of a false “significant” result applies to the whole set, not
to each pair. That is why you shouldn’t run a t test on every pair
instead.

**From summary data** (mean, SD or SEM or %CV, and n) everything is
computed from the summaries, as in Prism, except the Brown-Forsythe test
of SDs, which needs the values.

## Reading the results

The sentence at the top says whether the means are all the same or at
least one differs, then which pairs the comparisons find. A
non-significant ANOVA is “no evidence” of a difference, not proof that
the means are the same.

- **ANOVA summary:** **F**, **P value**, **P value summary**,
  **Significant difference among means (P < 0.05)?** and **R squared**
  (the share of all the variation that lies between the groups).
- With Welch’s option, instead: **Brown-Forsythe ANOVA test** (`F*`) and
  **Welch’s ANOVA test** (W), each with its degrees of freedom and P. The
  reading goes by Welch’s P.
- **Brown-Forsythe test (are the SDs equal?)** and **Bartlett’s test (are
  the SDs equal?)**: whether the groups’ spreads differ. Bartlett’s test
  runs only when every group has at least five values.
- **ANOVA table** (ordinary ANOVA): the sums of squares (SS), degrees of
  freedom (DF) and mean squares (MS) between and within groups, and
  **F (DFn, DFd)**.
- **Data summary:** each group’s n, mean, SD and (from values) median.
- **Multiple comparisons**, one row per pair: **Mean diff.**, **95.00% CI
  of diff.**, **Significant?**, **Summary** (asterisks) and **Adjusted P
  value**. Below, **Test details**: both means, the SE of the difference,
  both n, the test statistic (q or t) and DF.

**Mean diff.** is the first group minus the second, as Prism reports it;
against a control the rows read “Control vs. X”. The asterisks: ns
P ≥ 0.05, `*` P < 0.05, `**` P < 0.01, `***` P < 0.001,
`****` P < 0.0001, from the adjusted P.

### When the ANOVA and the comparisons disagree

They ask different questions. A significant ANOVA with no significant
pair can happen when the difference is spread over several groups; near
the threshold a pair can be significant while the ANOVA isn’t. The
reading says so when it happens.

## Prism and BarelySig

Prism calls this “One-way ANOVA (and nonparametric or mixed)”. The tests,
defaults and results follow Prism’s, including the Brown-Forsythe test of
SDs from each group’s median, and Tukey, Dunnett, Šidák, Bonferroni,
Games-Howell, Dunnett T3 and Tamhane T2 in their original versions. One
choice Prism leaves open: the Brown-Forsythe ANOVA is the original 1974
version, without Mehrotra’s modification.

Dunnett and Dunnett T3 P values are computed by numerical integration
with fixed rules rather than by random sampling, so the same data always
give the same P and very small P values keep their digits.

Everything is checked against R’s `aov`, `TukeyHSD`,
`oneway.test` and `bartlett.test`, with the multcomp, car and onewaytests
packages as second checks, on cases with missing values, unequal sizes,
ties, n = 2, zero spread, an outlier and very small P values.

## On a graph

A graph of the table offers one significance bracket per comparison,
labelled from its adjusted P; you can hide any of them. See
[Graphs](12-graphs.md).
