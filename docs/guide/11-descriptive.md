# Descriptive statistics

Descriptive statistics summarise each group: how many values, where they
sit (mean, median) and how spread out they are (SD, quartiles, range).
No test, no P value; use it to check your data, or to report the numbers
behind a graph.

## Running it

Click **Analyze…** on a Column table, then **Descriptive statistics** (the
tile selected when the dialog opens), tick the groups and click
**Analyze**. There are no options.

Descriptive statistics describe Column tables; Grouped tables don’t
offer them yet.

## Reading the results

One column per group, one row per statistic:

| Row                                        | What it is                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Number of values                           | n, with how many empty or excluded values were left out                                           |
| Minimum, Maximum                           | the smallest and largest value                                                                    |
| 25% percentile, Median, 75% percentile     | a quarter of the values lie below the first, half below the median, three quarters below the last |
| Range                                      | maximum minus minimum                                                                             |
| Mean                                       | the average                                                                                       |
| Std. deviation                             | the SD: how far values typically lie from the mean                                                |
| Std. error of mean                         | the SEM, SD / √n: how precisely the mean is known                                                 |
| Lower 95% CI of mean, Upper 95% CI of mean | the 95% confidence interval of the mean                                                           |
| Coefficient of variation                   | SD as a percentage of the mean                                                                    |
| Geometric mean                             | the average on a log scale; suits values that vary by fold changes                                |
| Sum                                        | all values added up                                                                               |

A dash (—) means the statistic isn’t defined for these values or isn’t
available: the SD, SEM and CI of a single value, a geometric mean when a
value is 0 or below, a coefficient of variation when the mean is 0.

## SD, SEM or CI?

These are easy to mix up, and error bars use all three:

- **SD** describes the **values**: how much they scatter. It doesn’t
  shrink when you measure more.
- **SEM** describes the **mean**: how far it is likely to be from the true
  mean. It shrinks as n grows, so it always looks smaller than the SD.
- **95% CI** of the mean: a range worked out so that, in 95% of
  experiments like this one, it contains the true mean. Here it is
  mean ± t × SEM.

Say which one you show; see [Graphs](12-graphs.md) for error bars.

## From summary data

When the table holds summary data, only what the mean, SD (or SEM or
%CV) and n allow is shown: n, mean, SD, SEM, the 95% CI when n is known,
and the coefficient of variation. The median, quartiles, minimum,
maximum, range, geometric mean and sum need the individual values, so
they show a dash rather than a guess.

## Prism and BarelySig

Prism calls this “Column statistics”. The percentiles are computed as
Prism computes them, from rank (n + 1) × p with interpolation between
values. Other programs, including R’s default and Excel’s `QUARTILE`,
use other rules, so their quartiles can differ for small groups.

The numbers are checked against R on cases with missing values, one
value, two values, 200 values, ties, zero spread, negative values, a
mean of zero, an outlier, very small values, and summary data with and
without n.
