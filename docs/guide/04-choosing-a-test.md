# Choosing a test

Every analysis starts from a table. Open the table, click **Analyze…**
above it, and the dialog asks three things: what you want to know, which
groups, and the options of that test. If you are not sure which test fits
your experiment, **Help me choose** asks about it and suggests one.

## Running an analysis

1. Open a table and click **Analyze…**.
2. Under **What do you want to know?** click a test, or **Help me
   choose**.
3. Under **Which groups?** tick the groups (columns) to analyse. A test of
   exactly two groups asks **Which two groups?** and starts with the first
   two ticked.
4. Set the options below (each test’s page says what they mean) and click
   **Analyze**.

The results open in their own sheet and are listed under **Results** in
the navigator, named after the test and the table, for example
“Unpaired t test of Viability”. **Change analysis…** on the results sheet
opens the same dialog again to change the groups or the options. **How to
read these results** opens that test's page of this guide.

Results are live: edit a value in the table and every analysis of it
reruns by itself.

## What each table offers

| Test                                        | Table   | Use it to                                         |
| ------------------------------------------- | ------- | ------------------------------------------------- |
| [Descriptive statistics](11-descriptive.md) | Column  | Describe each group: n, mean, SD, SEM, CI, median |
| [Normality tests](10-normality.md)          | Column  | Check for clear departures from a bell shape      |
| [t test](05-t-tests.md)                     | Column  | Compare the means of two groups                   |
| [Mann-Whitney / Wilcoxon](06-rank-tests.md) | Column  | Compare two groups by ranks                       |
| [One-way ANOVA](07-one-way-anova.md)        | Column  | Compare the means of three or more groups         |
| [Kruskal-Wallis](08-kruskal-wallis.md)      | Column  | Compare three or more groups by ranks             |
| [Two-way ANOVA](09-two-way-anova.md)        | Grouped | Two factors at once, and whether they interact    |

Tests that rank or pair the values need the individual values; from
summary data (mean, SD, n) only the unpaired t test, one-way ANOVA,
two-way ANOVA (with the same n in every cell) and descriptive statistics
can run. See [Column and Grouped tables](03-tables.md#summary-data).

## Help me choose

**Help me choose** is the first tile when you create an analysis. It
counts the groups you ticked under **Which groups?**, then asks at most
two questions:

- **Are the same subjects in every group?** “No” if each group holds
  different samples, animals or wells. “Yes” if each row is one subject
  measured in every group: before and after, left and right, matched
  pairs. Data like these are called **paired** (or **matched**).
- **Can you assume the values follow a bell-shaped (Gaussian, “normal”)
  distribution?** “Yes”, “No”, or “Not sure”. This comes mostly from what
  is known about the kind of measurement, not from a normality test on a
  few values.

It then says which test it suggests and why. Click **Use the …** (for
example **Use the Unpaired t test**) to fill the dialog with that test and
its options, then **Analyze**. The **Analyze** button stays greyed out
while **Help me choose** is selected.

Some cases skip the questions:

- A **Grouped table** goes straight to two-way ANOVA.
- **Summary data** gets the unpaired t test (two groups) or one-way
  ANOVA (three or more), the only tests that work from mean, SD and n.
- **One group:** there is nothing to compare; use descriptive statistics.
- **Three or more matched groups** need repeated-measures ANOVA or the
  Friedman test, which BarelySig doesn’t have yet. Don’t use an unpaired
  test instead: it ignores the matching.

“Not sure” suggests the rank test, which assumes less, unless there are
so few values that a rank test can never reach P < 0.05 (for example 3
against 3, 5 pairs or fewer, or 7 values or fewer in all for three or
more groups). Then it suggests the t test or ANOVA and says why.

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

## Reading a results sheet

- **The first sentence** says in plain words what the result means, and
  never contradicts the asterisks.
- **The line below it** names the test and the options used.
- **The tables** follow Prism’s layout, section by section.
- **P values** are shown as Prism shows them: four decimals,
  `< 0.0001` below that and `> 0.9999` at 1, never 0. A P just under a
  threshold is cut, not rounded up, so 0.04996 shows as 0.0499.
- **P value summary** gives the asterisks: ns P ≥ 0.05, `*` P < 0.05,
  `**` P < 0.01, `***` P < 0.001, `****` P < 0.0001. The scheme is
  written under every sheet that shows asterisks.
- Other numbers show four significant digits.

While it works the sheet says **Calculating…** (with **Stop**) or
**Updating…**; the very first analysis says it is starting the
statistics engine. If a test can’t run on the data, the sheet says why in
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
