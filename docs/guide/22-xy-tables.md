# XY tables, correlation and linear regression

An XY table holds paired X–Y data: one shared X column (e.g. time, dose,
concentration) and one or more Y data sets measured at those X values
(e.g. "Control", "Treated"). It's what a dose-response curve or a
time-course is made of.

## When to use it

- Your X values mean something as numbers, not just as group labels — a
  time, a dose, a concentration — and each Y data set is a series
  measured across them.
- You want to ask how closely X and Y move together (**correlation**) or
  fit a straight line through them (**linear regression**).
- Not for two unrelated categorical factors: use a
  [Grouped table](03-tables.md) for that.

## Entering the table

Choose **XY** when creating a table. The first column is X, shared by
every Y data set to its right — type each X value once, in order (they
don't have to be evenly spaced, or even sorted, though sorted is usual).
Each Y data set works exactly like a Column table's group: one replicate
per cell, several replicate subcolumns, or summary data (mean with SD/SEM
and n).

A row with no X value drops out everywhere on that row — there's no such
thing as a Y value with nothing to plot it against. A row with an X value
but a blank Y just drops from that one Y data set, the ordinary rule for
an empty cell.

## Running a test

Click **Analyze…** and tick the Y data sets to test; each one gets its
own result, not a comparison between them.

### Correlation

Pearson's r (assumes a straight-line relationship; comes with a 95% CI)
or Spearman's rho (ranks only, no shape assumed; no CI, since rho's
sampling distribution has none the way Pearson's does). Pick one per
analysis, the same choice Prism's own Correlation dialog offers.
Spearman's exact P is only available without tied values; with ties, R's
usual large-sample approximation is used instead, and the results say so.

### Linear regression

Fits the straight line through each Y data set that best predicts it from
X: slope and intercept with their 95% CIs, R², and a **runs test** for
lack of fit. The runs test looks at whether the residuals (how far each
point falls above or below the line) alternate sides about as often as
chance would; if they don't — a run of points on the same side for a
stretch of X — the true relationship likely curves, even if the slope's
own P value looks convincing. Needs at least 3 points; with every X the
same value, or every Y the same value, there's no line to fit and the
results say so instead of a number.

Neither analysis produces significance brackets: each is one number per Y
data set, not a pairwise comparison.

## What's not here yet

There's no graph for an XY table yet — the existing bar/dot/box/violin
graphs all use a categorical axis, and an XY scatter needs two continuous
numeric axes, which is its own piece of work. You can still read every
number from the results sheet. "Help me choose" also doesn't yet suggest
these analyses — pick them directly from the **Analyze…** dialog.
Nonlinear (dose-response) regression isn't here either: it's a separate,
larger piece of work built on this same table type.
