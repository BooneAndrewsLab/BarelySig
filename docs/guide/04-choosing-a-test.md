# Choosing a test

Every analysis starts from a table. Open the table and click
**Analyze…** above it. The dialog has two tabs:

- **Help me choose** asks about your experiment, one question at a
  time, and suggests a test with the reason in plain words. Use it
  whenever you aren't sure; no statistics knowledge needed.
- **Pick a test myself** lists every test the table offers, with its
  options.

The dialog opens on the tab you used last.

## Running an analysis

1. Open a table and click **Analyze…**.
2. On **Pick a test myself**, under **What do you want to know?** click
   a test.
3. Under **Which groups?** tick the groups (columns) to analyse (for a
   Grouped table, **Which data sets (columns)?**). A test of exactly two
   groups asks **Which two groups?** and starts with the first two
   ticked.
4. Set the options below (each test’s page says what they mean) and click
   **Analyze**.

The results appear as a new section of the experiment's page, named
after the test and the table, for example “Unpaired t test of
Viability”, and the page scrolls to them. **Change analysis…** in the
section's header opens the same dialog again to change the groups or the options. **How to
read these results** opens that test's page of this guide.

Results are live: edit a value in the table and every analysis of it
reruns by itself.

## What each table offers

| Test                                        | Table   | Use it to                                                                                               |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| [Descriptive statistics](11-descriptive.md) | Column  | Describe each group: n, mean, SD, SEM, CI, median                                                       |
| [Normality tests](10-normality.md)          | Column  | Check for clear departures from a bell shape                                                            |
| [t test](05-t-tests.md)                     | Column  | Compare the means of two groups                                                                         |
| [Mann-Whitney / Wilcoxon](06-rank-tests.md) | Column  | Compare two groups by ranks                                                                             |
| [One-way ANOVA](07-one-way-anova.md)        | Column  | Compare the means of three or more groups                                                               |
| [Kruskal-Wallis](08-kruskal-wallis.md)      | Column  | Compare three or more groups by ranks                                                                   |
| [Two-way ANOVA](09-two-way-anova.md)        | Grouped | Two factors at once, and whether they interact                                                          |
| [Nested t test](17-nested-tables.md)        | Nested  | Compare two groups, weighing each biological replicate; or matched, when each replicate ran both groups |
| [Nested one-way ANOVA](17-nested-tables.md) | Nested  | Compare three or more groups the same way                                                               |

Tests that rank or pair the values need the individual values; from
summary data (mean, SD, n) only the unpaired t test, one-way ANOVA,
two-way ANOVA (with the same n in every cell) and descriptive statistics
can run. See [Column and Grouped tables](03-tables.md#summary-data).

## Help me choose

**Help me choose** asks only what matters for your table, one question
at a time. Click an answer and the next question appears; each answered
question folds into a line with **Change**, so you can see how you got
to the suggestion and go back to any step.

1. **What do you want to find out?** _Whether the groups differ_, or
   _The numbers for each group_ (mean, SD, SEM, n: descriptive
   statistics, for a table or a figure legend).
2. **Which groups?** Tick the groups to include; each shows how many
   values it has. Then **Continue**.
3. **Do the values in one row belong together?** The guide shows your
   own first row as an example. “No” if every value is a separate
   sample: different mice, wells, dishes or patients in each group.
   “Yes” if each row is one mouse or patient measured in every group
   (before and after, treated and untreated), or one sample (a culture,
   a batch of cells) split between the groups and handled in parallel.
   Data like these are called **paired** (or **matched**). Being
   measured on the same day isn’t enough on its own: separate cultures
   processed on the same day are still separate samples. Decide from
   how the experiment was designed, never from which answer gives the
   smaller P.
4. **What kind of numbers are these?** This decides whether a test may
   assume a bell-shaped (Gaussian, “normal”) spread of values; see
   [the kind of numbers](#the-kind-of-numbers) below.
5. **Is one of the groups a control?** (Three or more groups.) _Yes_,
   then click which one: each group is compared with it (Dunnett’s
   test, or Dunn’s after Kruskal-Wallis). _No_: every group is compared
   with every other (Tukey’s test, or Dunn’s).

### The kind of numbers

- _Measurements on a smooth scale_ (weight, length, absorbance,
  fluorescence, Ct values, % viability): a t test or ANOVA.
- _Amounts that grow by multiplying_ (concentrations, fold changes,
  expression levels, titres, counts from tens to thousands): a rank
  test, with a tip: their logarithms are often bell-shaped, so a t test
  on a column of logs is the more sensitive choice.
- _Scores, ranks or small counts_ (a 0–4 score, a rating, foci per
  cell): a rank test.
- _I’m not sure_: the test that assumes less (a rank test), unless there
  are so few values that a rank test can never reach P < 0.05 (for
  example 3 against 3, 5 pairs or fewer, or 7 values or fewer in all
  for three or more groups). Then the t test or ANOVA, and it says why.

This is the question a normality test can’t answer for you: with a few
values it can only flag clear departures, so what is known about the
kind of measurement decides.

### The suggestion

The suggestion names the test and says why, with anything to keep in
mind. **Run this test** creates the analysis straight away; **See its
options first** opens it on **Pick a test myself** with the answers
filled in, to change the options before clicking **Analyze**. For a t
test or one-way ANOVA a box, ticked at first, also adds normality tests
of each group as a separate analysis.

“I’m not sure” is always an answer about the experiment. For the rows,
it takes every value as a separate sample and says that a paired test
would be more sensitive if the rows do belong together.

Some tables skip questions:

- A **Grouped table** goes straight to two-way ANOVA after the data
  sets.
- A **Nested table** asks one question: was “Replicate 1” (or whatever
  you named it) one sample split between the groups? No: the nested
  t test (two groups) or nested one-way ANOVA (three or more). Yes: the
  **matched** nested t test for two groups; three or more matched
  groups need a repeated-measures ANOVA, which BarelySig doesn’t have
  yet. It never asks about the kind of numbers: the test works on
  replicate means.
- **Summary data** gets the unpaired t test (two groups) or one-way
  ANOVA (three or more), the only tests that work from mean, SD and n.
- **Three or more matched groups** get
  [repeated-measures ANOVA or the Friedman test](18-repeated-measures.md),
  the same way two matched groups get the paired t test or Wilcoxon test.
  Don’t use an unpaired test instead: it ignores the matching.

## Words you will meet

- **P value:** if there were truly no difference, how often an experiment
  like yours would show a difference at least this large by chance. A
  small P means such a difference would be rare by chance alone. It is
  not the chance that your result is “real”.
- **Significant:** P below 0.05, the usual threshold.
- **No evidence of a difference** is not the same as “the same”: a
  small experiment can miss a real difference.
- **Parametric** tests (t test, ANOVA) assume Gaussian values and compare
  means. **Nonparametric** tests (Mann-Whitney, Wilcoxon, Kruskal-Wallis)
  compare ranks and assume less.
- **SD** (standard deviation): how spread out the values are. **SEM**
  (standard error of the mean): how precisely the mean is known; it
  shrinks as n grows. **95% CI** (confidence interval): a range worked
  out so that, in 95% of experiments like this one, it contains the true
  value.
- **Two-tailed:** a difference in either direction counts. Use
  **one-tailed** only if you predicted the direction before collecting
  the data.
- **Multiple comparisons:** testing many pairs at once makes a chance
  “significant” pair more likely. An **adjusted P** accounts for the
  number of comparisons, so the 5% chance of a false positive applies to
  the whole set, not to each pair.

## Reading the results

- **The first sentence** says in plain words what the result means, and
  never contradicts the asterisks.
- **The key numbers** sit beside it: the P value it goes by, how big the
  difference is (with its 95% confidence interval) or how many pairs
  differ, and the test statistic. The same numbers are in the tables.
- **The line below it** names the test and the options used.
- **The tables** follow Prism’s layout, section by section: short tables
  side by side, tables with columns across the page.
- **P values** are shown as Prism shows them: four decimals,
  `< 0.0001` below that and `> 0.9999` at 1, never 0. A P just under a
  threshold is cut, not rounded up, so 0.04996 shows as 0.0499.
- **P value summary** gives the asterisks: ns P ≥ 0.05, `*` P < 0.05,
  `**` P < 0.01, `***` P < 0.001, `****` P < 0.0001. The scheme is
  written under every sheet that shows asterisks.
- Other numbers show four significant digits.

While it works the sheet says **Calculating…** (with **Stop**) or
**Updating…**; the very first analysis says it is starting the
statistics engine. After a change, the previous results stay in place,
faded under that note, until the new ones replace them: faded numbers are
out of date. If a test can’t run on the data, the sheet says why in
words (for example “A t test compares two groups; choose two.”); fix
the table or click **Change analysis…**. If something failed, **Run
again** retries.

## Checked against R

The numbers come from R, the statistics software, running in your
browser. Every test is checked against desktop R, using reference code
written separately from the app’s own, on cases chosen to catch mistakes:
missing values, unequal group sizes, ties, n = 2, zero spread, outliers
and very small P values. The same cases run in the browser’s R, and the
results must agree to about one part in a million.
