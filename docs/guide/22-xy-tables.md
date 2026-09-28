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

### Dose-response curve

Fits an S-shaped curve — Prism's "log(agonist) vs. response, variable
slope", the four-parameter logistic — to each Y data set:

- **Bottom** and **Top**: the two plateaus;
- **EC50**: the dose giving a response halfway between them, with its 95%
  CI (also shown as LogEC50, the value the fit actually estimates);
- **HillSlope**: how steep the rise is — about 1 for a textbook curve,
  negative when the response falls as the dose rises (an inhibition
  curve fits this same model).

In the settings, say what your X values are: **logs of the dose** (−9
for 1 nM, the way Prism expects them) or **doses/concentrations**
(1e-9). With doses, the fit uses their log, so a zero dose — usually the
untreated control — has nowhere to go and is left out; the results say
how many points that was.

Every replicate counts as its own point; with summary data, the fit uses
the mean at each dose. The results also give R², Sy.x and a runs test
(as for linear regression, a small runs-test P means the points
systematically miss the curve). The CIs are _asymptotic_ — symmetric
around LogEC50, the kind Prism 6 and most programs report; Prism 7+ can
also give profile-likelihood CIs, which BarelySig doesn't yet.

When the fit can't be trusted, the results say so instead of giving a
number: fewer than 5 points or 4 different doses, a Y that never varies,
or a fit that doesn't converge — usually because the doses don't reach
both plateaus, so there's no top (or bottom) to estimate. A value marked
**~** (and a CI "very wide") is one the data barely pin down, Prism's
"ambiguous"; again, usually a plateau with no points on it.

To draw the curve, make an XY graph and choose this analysis under
**Fitted line**, with an optional confidence or prediction band.

### Growth curve

Fits a bacterial or yeast growth curve — OD600, CFU or similar vs. time —
to each Y data set, using the Gompertz growth model in the form
microbiologists usually report it (lag time, growth rate and the
plateau, rather than the plain curve-shape parameters):

- **Asymptote**: the plateau the culture approaches (carrying capacity);
- **Growth rate**: the curve's steepest slope, in Y units per unit time;
- **Doubling time**: ln 2 ÷ growth rate — how long the culture takes to
  double at its fastest;
- **Lag time**: where the tangent line through that steepest point meets
  Y = 0 — growth hasn't measurably started before this time;
- **End of exponential phase**: where that same tangent line reaches the
  asymptote — the natural boundary between exponential and stationary
  phase.

Together these mark three phases: **lag** (before the lag time),
**exponential** (between the lag time and the end of exponential phase,
where the growth rate and doubling time apply) and **stationary** (after
it, at the asymptote). If the culture hasn't reached a plateau within
your observed time window, the end of exponential phase is still
reported — stated as extrapolated beyond the data.

Every replicate counts as its own point; with summary data, the fit uses
the mean at each time. The results also give R², Sy.x and a runs test.
The CIs are asymptotic. As for the dose-response fit, the results say so
instead of a number when the fit can't be trusted: fewer than 4 points or
3 distinct times, a Y that never varies, or data that isn't really a
growth curve (declining, or too few points across the rise to pin down
how fast it happens).

To draw the curve, make an XY graph and choose this analysis under
**Fitted line**, with an optional confidence or prediction band — the
lag/exponential/stationary boundaries themselves aren't drawn on the
graph yet.

None of these analyses produces significance brackets: each is one number per Y
data set, not a pairwise comparison.

## What's not here yet

"Help me choose" doesn't yet suggest these analyses — pick them directly
from the **Analyze…** dialog. The dose-response fit has one model so far:
no fixed or shared parameters, no comparing curves ("do these EC50s
differ?"), no other curve shapes, weighting or interpolating unknowns
from a standard curve yet. The growth curve fit likewise has one model
(Gompertz); a logistic alternative, phase boundaries drawn on the graph,
and fitting several data sets together aren't there yet either.
