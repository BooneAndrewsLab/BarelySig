# Normality tests

t tests and ANOVA assume the values come from a **Gaussian** (bell-shaped,
“normal”) distribution. A normality test looks at each group and asks
whether its values depart clearly from that shape. BarelySig runs two
tests on every group: **D’Agostino-Pearson** and **Shapiro-Wilk**.

## What they can and can’t tell you

Read this before trusting a “passed”:

- **With few values** (the usual n = 3 to 6 at the bench) a normality
  test has little power: it almost always passes, whatever the true
  shape. Passing is no evidence that the data are Gaussian.
- **With many values** it flags departures too small to matter for a t
  test or an ANOVA.
- So base the choice of test mostly on what is known about the kind of
  measurement. Values that vary by fold changes (concentrations,
  expression levels) are often skewed; counts with a few very large ones
  are not Gaussian.

The results repeat this caution.

## Running them

- **With an unpaired t test or one-way ANOVA:** when you create either
  on individual values, the Analyze dialog has a box “Also test each
  group for normality (a separate analysis)”, ticked by default. It adds
  a normality sheet for the same groups, next to the test’s own.
- **On their own:** click **Analyze…** on a Column table, then the
  **Normality tests** tile, and tick the groups. There are no options.

Each group is tested on its own. For a paired t test the assumption is
about the differences within each row, which these tests don’t look at,
so the dialog doesn’t offer them there.

They need the individual values: they can’t run on summary data.

## Which groups can be tested

| Test                          | Needs             |
| ----------------------------- | ----------------- |
| D’Agostino-Pearson omnibus K² | at least 8 values |
| Shapiro-Wilk                  | 3 to 5000 values  |

A group that is too small, or whose values are all the same, shows why in
place of a result (for example “Needs at least 8 values”). If no group
can be tested at all, the sheet says so and suggests deciding from what
is known about the measurement.

## Reading the results

Each group is a column. For each test:

- the statistic (**K2** for D’Agostino-Pearson, **W** for Shapiro-Wilk);
- **P value**;
- **Passed normality test (α = 0.05)?** “Yes” when P > 0.05, meaning no
  clear departure from a Gaussian distribution was found, not proof of
  one;
- **P value summary**, the asterisks: ns P ≥ 0.05, `*` P < 0.05,
  `**` P < 0.01, `***` P < 0.001, `****` P < 0.0001. Here asterisks mean
  the group does depart from a bell shape.

**Number of values** gives each group’s n and any empty or excluded
values left out.

The sentence at the top names the groups that don’t look Gaussian, if
any. For those, consider a nonparametric test
([Mann-Whitney or Wilcoxon](06-rank-tests.md),
[Kruskal-Wallis](08-kruskal-wallis.md)), or transforming the values
first, for example taking the log of values that vary by fold changes.
BarelySig can’t transform values yet: take the log in your spreadsheet
and paste the result into a new table.

## Prism and BarelySig

Prism calls these “Normality and Lognormality Tests”. BarelySig runs
D’Agostino-Pearson from 8 values on, with the same formulas as Prism.
Shapiro-Wilk is R’s own `shapiro.test` (Royston’s method,
which Prism uses too). D’Agostino-Pearson is written out from the
published formulas and checked against the fBasics package, on Gaussian
and skewed data, small n, exactly 8 values, ties and missing values,
identical values and an outlier.
