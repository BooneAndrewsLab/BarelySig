# 06. MVP statistics: rank tests, ANOVA, post-hoc, normality, test chooser

Written 2026-09-24 before building milestone 0.6 (#24–#29). Builds on
note 04 (analysis modules, results sheets) and note 05 (brackets).
Prism's behaviour comes from GraphPad's Statistics Guide (Prism 11) and
FAQ 1688 ("How Prism 8 computes multiple comparisons tests following
ANOVA"); each rule below says where Prism leaves something open and what
we chose.

## What was asked

Mann-Whitney and Wilcoxon signed-rank with exact P, ties and continuity
handled as Prism does, and the Hodges-Lehmann estimate (#24); one-way
ANOVA with Brown-Forsythe and Bartlett tests, a Welch option and
Tukey, Dunnett, Šidák and Bonferroni comparisons (#25); Kruskal-Wallis
with Dunn's test (#26); two-way ANOVA from Grouped tables with post-hoc
comparisons (#27); Shapiro-Wilk and D'Agostino-Pearson normality tests
offered before parametric tests (#28); and a "which test?" guide in the
Analyze dialog (#29). Every analysis ships with R-oracle fixtures
(CLAUDE.md, Correctness).

## New analysis kinds

| Kind | Table | Options (defaults as Prism's) |
|---|---|---|
| `rank-test` | Column | `paired` (false: Mann-Whitney, true: Wilcoxon), `tails` ('two'), `zeros` ('wilcoxon' or 'pratt'; Wilcoxon's) |
| `one-way-anova` | Column | `welch` (false), `comparisons` (below) |
| `kruskal-wallis` | Column | `comparisons`: none, all pairs or vs a control (Dunn's), `corrected` (true) |
| `two-way-anova` | Grouped | `comparisons` (below) |
| `normality` | Column | none: both tests, every group |

`t-test` stays as it is. The Mann-Whitney and Wilcoxon tests are one kind
with a `paired` switch, as the t tests are, because the dialog asks the
same question for both. Each kind has its own request and result types,
R file, oracle and fixtures (note 04).

One-way comparisons are a union, so an invalid pairing can't be stored:

```ts
type OneWayComparisons =
  | { kind: 'none' }
  | { kind: 'all'; test: 'tukey' | 'bonferroni' | 'sidak' | 'games-howell' | 'dunnett-t3' | 'tamhane-t2' }
  | { kind: 'control'; control: Id; test: 'dunnett' | 'bonferroni' | 'sidak' | 'dunnett-t3' | 'tamhane-t2' };
```

The first three of each list assume equal SDs, the last three go with
Welch's ANOVA; `prepare` refuses a mismatch in words, and the dialog
never produces one. Defaults: all pairs, Tukey (Welch: Dunnett T3); vs
control, Dunnett (Welch: Dunnett T3), as Prism recommends. A new
analysis starts with all-pairs comparisons, since that is what a user
putting asterisks on a bar graph wants.

## Rank tests (#24)

Ranks are midranks (the average of the tied ranks), over both groups
for Mann-Whitney and over |differences| for Wilcoxon. The exact
distributions are counted over **doubled midranks**, which are whole
numbers, so equality with the observed value is exact and never a
floating comparison.

**Mann-Whitney.**

- **Exact P** when the smaller group has ≤ 100 values, **even with
  ties** (Prism: "It tabulates every possible way to shuffle the data
  into two groups … even with ties"). We count the permutation
  distribution of the rank sum by dynamic programming (subsets of size m
  by rank sum; one vectorised matrix update per value). Two-tailed P is
  the fraction of shuffles whose rank sum is at least as far from its
  mean as observed, in either direction. With ties that distribution
  isn't always symmetric, so this is not twice a tail.
- **Approximate P** above 100: normal approximation with the tie
  correction to the variance and a continuity correction, as R's
  `wilcox.test(exact = FALSE)`. Prism's guide doesn't say whether it
  corrects for continuity here; it does for Wilcoxon (FAQ 332), and we
  do both the same way. The results say "exact" or "approximate".
- **One-tailed P** is the tail in the observed direction. For a
  symmetric distribution that is half the two-tailed P, which is what
  the t tests report.
- Reported: P, exact or approximate, U (the smaller of U and U′, as
  Prism), the sum and mean of ranks in each group, each group's median,
  the difference between medians (B − A) and the **Hodges-Lehmann
  estimate** (the median of all B − A differences), with its CI.
- **CI of the difference:** order the m·n differences and take the k-th
  from each end, with k from the exact null distribution of U without
  ties (Sheskin, Klotz; R's `wilcox.test` does the same). The confidence
  level can't be exactly 95%. We take the smallest level that is at
  least 95% where one exists, and report the level achieved ("96.83% CI").
  With very small groups (3 and 3) the widest interval covers only 90%,
  and the results say so. Prism says it picks "as close as possible";
  ours is the conservative reading. Above 100 per group the CI is R's
  asymptotic one, at 95%.
- The difference is **B − A**, as the t tests report it (note 04).

**Wilcoxon matched pairs.**

- Pairs by row, as the paired t test does. Differences are B − A,
  rounded to 12 significant digits before ranking. Prism (FAQ 2020)
  treats 0.01 and 0.00999999999999998 as tied, and b − a in binary
  produces exactly that.
- **Zero differences:** dropped (Wilcoxon's method, Prism's default), or
  ranked and given no sign (Pratt's method, an option). The results say
  which method was used and how many pairs had a zero difference.
- **Exact P** below 200 pairs, even with ties (the signed-rank
  distribution counted the same way). From 200 pairs on: normal
  approximation with a continuity correction of 0.5 (Prism FAQ 332) and
  the variance from the actual (tied) ranks.
- Reported: P, exact or approximate, W (the sum of signed ranks), the
  sum of positive ranks (B > A) and of negative ranks (shown negative,
  as Prism does), the median of the differences, the Hodges-Lehmann
  estimate (median of the Walsh averages of all differences) and its CI
  with the level achieved (signed-rank null distribution without ties,
  as for Mann-Whitney), the number of pairs and of zero differences.
- **Pairing effectiveness:** Spearman's rₛ between A and B with a
  one-tailed P, as Prism. The P is R's `cor.test`: exact (AS 89) without
  ties, t approximation with ties. Prism says it is exact up to 17 pairs.
  The two can differ in the last digits between 10 and 17 pairs; the
  exact version is a follow-up.

**From summary data:** not possible (ranks need values); `prepare` says so.

## Kruskal-Wallis and Dunn's test (#26)

- H with the tie correction; **P from the chi-square approximation**,
  always labelled "approximate". Prism computes an exact P "if your
  samples are small" but gives no threshold. No reference package
  computes an exact P for more than two groups, and a full enumeration
  gets slow quickly (5 groups of 5 is 6·10¹⁴ shuffles). The exact P is a
  follow-up (#49); it needs its own algorithm and a reference.
- Reported: H, P, number of groups, and each group's n, median, sum
  and mean of ranks.
- **Dunn's test** (Prism's formula): z = |mean rank diff| / √([N(N+1)/12
  − Σ(t³ − t)/(12(N − 1))]·(1/nᵢ + 1/nⱼ)), with ranks over all groups;
  two-tailed P from the normal distribution; **adjusted P = P × K**
  (K = number of comparisons), capped at 1, shown "> 0.9999" when
  capped. Uncorrected Dunn is an option. No CIs (Prism gives none).
  Rows are "A vs. B" with mean rank diff = mean rank A − mean rank B.

## One-way ANOVA (#25)

- **ANOVA table:** treatment (between columns), residual (within
  columns) and total: SS, DF, MS; F (DFn, DFd), P; R² (SS between /
  SS total).
- **Equal SDs:** the Brown-Forsythe test (ordinary ANOVA of |value −
  group median|; Prism uses the median, never the mean) and **Bartlett's
  test** (corrected, as R's `bartlett.test`), the latter only when every
  group has at least five values, as Prism.
- **Welch's option:** Prism always reports two alternative ANOVAs
  together, so we do too. **Welch's ANOVA** (W, DFn, DFd, P) and the
  **Brown-Forsythe ANOVA** (F*, DFn, DFd, P) use the original 1974 F*
  with Satterthwaite's DFd. Prism doesn't say whether it uses
  Mehrotra's (1997) modification; we don't, and the note on the
  results says which.
- **From summary data** (mean, SD, n): ANOVA, Bartlett, Welch,
  Brown-Forsythe ANOVA and every comparison are computed from the
  summaries (Prism: "exactly the same results"). The Brown-Forsythe test
  needs medians and is reported as not available.
- **Comparisons** (FAQ 1688), with "A vs. B" and mean diff = A − B,
  after ordinary ANOVA using the pooled MS(residual) and its DF:
  - Tukey (Tukey-Kramer): q = √2·|diff|/SE, P from `ptukey` with M
    means, CI from `qtukey`.
  - Dunnett (single step, as Prism): the exact probability for a set of
    comparisons with a shared control. Their correlations are ρᵢⱼ =
    λᵢλⱼ, so P(max |Tᵢ| ≥ c) is a two-dimensional integral (Dunnett
    1955). We integrate it numerically (see As built), taking the
    complement inside the integral (`-expm1(Σ log1p(-qᵢ))`) so small P
    values keep their digits. This is deterministic, unlike mvtnorm's
    randomised QMC. The CI's critical value comes from `uniroot` on the
    same function.
  - Šidák: P = 1 − (1 − p)^K (`-expm1(K·log1p(-p))`), CI with t at
    1 − (1 − α)^(1/K). The FAQ 1688 PDF prints the Šidák P with a typo.
  - Bonferroni: P = min(1, K·p), CI with t at α/K.
- **After Welch's ANOVA** each comparison uses only its two groups: SE
  = √(s²ᵢ/nᵢ + s²ⱼ/nⱼ) and Welch's df. The three tests differ only in
  how they get P from t and df, as Prism says. Games-Howell uses the
  studentized range. **Dunnett T3** uses the studentized maximum modulus
  with K comparisons, one integral over the chi distribution. Tamhane T2
  is Šidák with Welch t. Prism uses the original versions, and so do we.
- Every comparison reports: mean diff, CI, significant?, asterisks,
  adjusted P; details: both means, SE of diff, n₁, n₂, the statistic (q
  or t) and DF.

## Two-way ANOVA (#27)

Grouped tables: rows are the row factor, data sets (columns) the column
factor, subcolumns the replicates.

- **Type III sums of squares** (Prism: the Glantz-Slinker regression
  method, "Type III"), from a linear model with sum-to-zero contrasts,
  each term dropped in turn (`drop1`). Rows: interaction, row factor,
  column factor, residual, total: SS, DF, MS, F (DFn, DFd), P; the
  "Source of variation" table with **% of total variation** = SS of the
  term / total SS × 100. With unbalanced data those don't add up to 100,
  as in Prism's own example.
- **Which model:** the full model with interaction when every cell has
  a value and there are replicates. With only one value per cell, Prism
  assumes no interaction, and so do we. When a cell is empty the full
  model can't be fitted, and Prism fits main effects only; so do we. In
  both cases the results say so.
- **From summary data:** balanced designs only (every n the same),
  where it is exact. Prism's unbalanced summary-data method ("unweighted
  means", only approximately correct) is a follow-up; `prepare`
  explains it for now.
- **Comparisons** use MS(residual) and DF(residual) of the fitted model
  (FAQ 1688), one family per row or column (Prism's recommended
  default):
  - within each row, compare the columns (simple effects); within each
    column, compare the rows;
  - main column effects and main row effects: least-squares means (the
    unweighted mean of the cell means), which are the plain marginal
    means when the design is balanced;
  - all cells against each other (one family).
  - Tests: Tukey, Šidák, Bonferroni for all pairs; Dunnett, Šidák,
    Bonferroni against a control (a column or row). Defaults: Tukey,
    and Dunnett for a control.
  - The means being compared are independent (different cells, or
    averages of different cells), each with variance MS(residual)·wⱼ,
    so the one-way machinery serves all of these. Dunnett's shared-control
    correlation still holds with λᵢ = √(w₀/(wᵢ + w₀)).
  - Not available: simple effects with no replicates (Prism 9 removed
    them too), and any comparison under a main-effects-only model with
    an empty cell. Its means depend on the model's coefficients; this is
    a follow-up.
  - Prism doesn't say whether main-effect comparisons of unbalanced data
    use least-squares or weighted means. We use least-squares means
    (emmeans' definition) and check against emmeans in the oracle.
- Repeated measures: a later issue, as #27 says.

## Normality (#28)

- Per group: **D'Agostino-Pearson omnibus K²** (n ≥ 8) and
  **Shapiro-Wilk** (3 ≤ n ≤ 5000; Royston's AS R94, R's `shapiro.test`,
  which Prism uses too). Each reports the statistic, P, "Passed
  normality test (α = 0.05)?" (yes when P > 0.05), and asterisks.
  K² follows D'Agostino, Belanger & D'Agostino (1990), written in base R
  and checked against `fBasics::dagoTest`.
- **Always stated:** what the test can't tell you. With small samples a
  normality test has little power, so "passed" is no evidence that the
  data are Gaussian. With large samples it flags trivial departures that
  don't matter for a t test or ANOVA. Groups too small for a test say so
  instead of reporting nothing.
- **Offered before parametric tests:** when the Analyze dialog creates a
  t test or one-way ANOVA on replicates, a ticked-by-default box "Also
  test each group for normality" adds a normality analysis of the same
  groups in the same undo step. It is a companion analysis, not a
  section of the t test, so it has its own sheet and result and the
  t test's options stay as they are.

## Which test? (#29)

The Analyze dialog's first choice gains "Help me choose". It asks:

1. What is the question? Compare groups, or describe them.
2. How many groups? Counted from the chosen data sets, not asked.
3. Are the same subjects in every group (paired or matched)?
4. Can you assume the values come from a Gaussian (bell-shaped)
   distribution? Yes, No, or Not sure. "Not sure" explains that this
   comes from what is known about the kind of measurement, not from a
   normality test on a few values, and suggests the test that assumes
   less.

It then suggests the test and says why in one or two plain sentences
("Two groups, different subjects, Gaussian: an unpaired t test compares
the means"). Choosing the suggestion fills the dialog. Combinations
without a test yet (matched 3+ groups: repeated-measures ANOVA or
Friedman) say so and point to the issue's successor. Grouped tables go
straight to two-way ANOVA. Jargon is explained in place: Gaussian,
paired, nonparametric.

## Results and readings

Each kind gets a Prism-style sheet (note 04's sections) and a one-line
plain reading on top that never contradicts the asterisks. A
non-significant P is "no evidence of a difference", never "the same";
a significant ANOVA says that *at least one* group differs and points to
the comparisons; rank tests say "tend to be higher" (they compare
distributions, not means). Two-way readings start with the interaction:
when it is significant, the main effects are said to be hard to
interpret on their own. P values show "> 0.9999" at 1, as Prism does,
everywhere.

## Brackets (note 05, extended)

Brackets come from every analysis with pairwise results: t tests,
rank tests, one-way comparisons and Dunn's comparisons. Two-way
brackets wait for grouped graphs (1.0). A bracket's key is the
analysis id for a single comparison, and `<analysis>/<data set A>/<data
set B>` for one of several. `format.hiddenBrackets` holds keys, so each
comparison can be hidden on its own. The graph sheet lists the analysis
with a checkbox per comparison. A new graph takes every bracket-giving
analysis of its table, as it took the t tests; the "show ns" switch
applies to all. The bracket label is the adjusted P.

## Engine

Everything here is base R (`stats`), so no new packages reach users.
`mvtnorm` and `emmeans` stay pinned but are loaded by nothing yet.
Dunnett's exact integral replaced the need for mvtnorm.
The **oracle** gains a `check` step: an expression run only in desktop
R after the expected values are computed. It compares them with the
reference packages that WebR doesn't ship (multcomp, emmeans, car,
dunn.test, fBasics, coin, onewaytests), each at a stated tolerance. It is
recorded in the fixture as `reference.checked` (package versions and
code) for provenance. The parity test runs only `setup` and `call`, which
use base R or packages that WebR ships. This lets the expected values
come from one reference while a second, independent one confirms them.

Fixture sets per analysis: Prism's examples where the guide has them,
missing values, unequal n, ties, n = 2 (or the test's minimum), zero
variance, an extreme outlier, a very small P; plus each test's
boundary (exact/approximate threshold, Bartlett's n ≥ 5, D'Agostino's
n ≥ 8, an empty cell, one value per cell).

## As built

### Rank tests (#24)

- **Speed.** Counting the tied rank sum is one vector update per score
  and group size, pruned to reachable sums and to sizes that can still
  reach m, over scores divided by their common divisor. It is capped at
  5·10⁷ cell updates: 100 against 100 tied values takes 2.5 s in WebR.
  Beyond the cap, and for very lopsided groups (e.g. 60 tied values
  against 200), the normal approximation is used and labelled
  "approximate", although Prism would still count exactly. Without ties
  R's `dwilcox` counts U, up to m·n = 5·10⁴.
- **CI:** the classic order statistics whenever U's (or the signed
  rank's) distribution can be counted (m·n ≤ 5·10⁴; up to 1000 pairs),
  else R's asymptotic interval. R 4.6's `wilcox.test` now inverts its
  exact test with ties for the CI, which gives a different interval with
  ties; the oracle compares with R only on untied data.
- **Spearman (pairing):** exact (R's AS 89) up to 9 untied pairs, else
  the t approximation; R's Edgeworth series between 10 and 1289 pairs
  matches neither R's exact count nor Prism. Exact to 17 pairs is #48.
- **One-tailed P** is the tail in the observed direction, from the same
  count.
- **Oracle:** brute-force enumeration of every split or sign pattern,
  `pwilcox`/`psignrank` where there are no ties, the normal formula
  above the thresholds; confirmed against `wilcox.test` and coin's exact
  tests (`checked`). One case (30 against 32, heavy ties) takes its P from
  coin directly, so the parity test skips it; the parity test now skips
  every fixture whose reference package WebR doesn't ship.
- **P display:** "> 0.9999" when P rounds to 1, everywhere.

### One-way ANOVA (#25)

- **Dunnett and Dunnett T3 by fixed Gauss-Legendre rules** (8 nodes per
  piece), vectorised over S and Z0: about 45 ms per P in desktop R.
  Nested adaptive `integrate` gave the same numbers but took seconds, and
  a CI's critical value needs about 15 of them. The pieces over S follow
  its quantiles and steps of 1/c around s ≈ √df / c. The pieces over Z0
  are scaled to where every comparison is certain to exceed c; the
  normal tail beyond is added exactly. Across random designs (2–8
  comparisons, df 3–200, c up to 150, P down to 1e-144) it agrees with
  careful adaptive quadrature to 7·10⁻¹⁰.
- **Why not mvtnorm:** `pmvt` computes 1 − P(inside), which cancels
  digits for a small P. At P = 5·10⁻¹² it was off by 4.5·10⁻⁵ however
  many points it used, and it refuses the non-integer df of Welch
  comparisons. It stays a check (1e-4, and for T3 a bracket between the
  whole df either side), with multcomp for Dunnett.
- **Reference:** the same probabilities, discretised differently (over the
  chi-square variable, 12-node rule, other breakpoints); R's own `aov`,
  `TukeyHSD`, `oneway.test`, `bartlett.test`, `pairwise.t.test` for the
  rest; car (Brown-Forsythe test of SDs) and onewaytests (Brown-Forsythe
  ANOVA) as checks.
- **With Welch's option** the sheet shows Welch's and the Brown-Forsythe
  ANOVA instead of the ordinary F, and the reading goes by Welch's P, so
  nothing contradicts the choice. Two groups are allowed (then F = t²).
- **Against a control** the rows read "Control vs. X", diff = control − X.
- **Oracle lessons:** a named number (from `cbind(i, …)`) comes back from
  WebR as a one-key object, while jsonlite writes it as a number, so
  reference code unnames. `scripts/oracle/run.sh generate` now formats the
  fixtures with Prettier as it writes them.

### Kruskal-Wallis (#26)

- As designed. The reference is R's `kruskal.test` for H and its P, with
  Dunn's z written out; the `dunn.test` package (two-sided `altp`) checks
  both. The exact P is #49. With 7 values or fewer in all the reading
  says no result can be significant, as Prism's guide does.
- Uncorrected Dunn's P values say, in the reading, that they aren't
  adjusted.

## Decisions made here

1. **Exact rank-test P values with ties**, by counting over doubled
   midranks, to Prism's thresholds (≤ 100 in the smaller group, < 200
   pairs).
2. **Kruskal-Wallis P is approximate** until an exact algorithm with a
   reference exists (follow-up).
3. **Dunnett by numerical integration** (fixed Gauss-Legendre rules),
   deterministic and precise for small P, instead of randomised QMC.
4. **Welch comparisons: Games-Howell, Dunnett T3, Tamhane T2**, Prism's
   three.
5. **Two-way: Type III, one family per row/column, least-squares means**
   for main effects; main effects only with an empty cell or without
   replicates.
6. **Normality as a companion analysis**, created with the parametric
   test by default.
7. **One key per comparison** for brackets; every pairwise analysis can
   give brackets.
