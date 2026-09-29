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
number: too few points or doses for the parameters being estimated (5
points and 4 doses when all four are; each parameter you hold lowers that
by one), a Y that never varies,
or a fit that doesn't converge — usually because the doses don't reach
both plateaus, so there's no top (or bottom) to estimate. A value marked
**~** (and a CI "very wide") is one the data barely pin down, Prism's
"ambiguous"; again, usually a plateau with no points on it.

To draw the curve, make an XY graph and choose this analysis under
**Fitted line**, with an optional confidence or prediction band.

#### Holding a parameter, or keeping it within limits

When your data don't reach a plateau, or you already know a value, you
can tell the fit what to do with **Bottom**, **Top** and **HillSlope**
in the Analyze dialog. For each one choose:

- **Estimate it** (the default), let the data decide;
- **Hold it at a constant**, for example Bottom = 0 for baseline-subtracted
  data, Top = 100 for percent-of-control data, or HillSlope = 1 for simple
  one-site binding;
- **Estimate within limits**, give a lower limit, an upper limit or both.

A held parameter isn't estimated, so it has no SE or CI and the results
mark it "(fixed)". If the best fit wants to go past a limit, the fit stops
at the limit, holds the parameter there and marks it "(at limit)", also
without SE or CI: that's a sign the limit, not the data, decided the
value. Holding parameters makes the rest better determined, and a
curve whose plateau has no points can become fittable. The degrees of
freedom and CIs count only the parameters still being estimated. Only
apply a constraint when you have a reason outside the data; a held value
that's wrong bends the whole curve. A HillSlope of exactly 0 can't be
held (it's a flat line, and EC50 has no meaning).

Without constraints the fit may swap Bottom and Top so that Bottom is the
lower plateau; with constraints it never does, since that would silently
break the values you set (Bottom is whatever you constrained it to be).

#### Comparing with a simpler model

Often the question is "do I need this parameter?": is Bottom really
different from 0, is the slope really 1? In the Analyze dialog tick
**Compare with a simpler model**, choose which parameters the simpler
model holds, and at what values. The fit runs twice, once with everything
estimated and once with those parameters held, and the results add a
comparison table:

- the **extra sum-of-squares F test**. Its null hypothesis is that the
  simpler model is correct and the flexible one fits better only by
  chance. A P value below 0.05 says the extra parameters really improve the
  fit; a larger P is _no evidence_ of an improvement, which isn't proof
  that the simpler model is right (with few points the test has little
  power);
- **AICc**, which weighs how much better the flexible model fits against
  the extra parameters it uses. The model with the lower AICc is preferred,
  and the table gives the chance that each model is the better of the two.
  It has no cut-off, and it needs more points than parameters (with four
  parameters, at least seven points; otherwise it says "Not available").

The two can disagree, especially with few points; AICc leans towards the
simpler model more readily than an F test at 0.05 does. The simpler model
can only hold a parameter your fit estimates: to ask about Bottom, leave
Bottom on "Estimate it" in the fit itself. Comparing a shared parameter
across data sets, or different curve shapes, will come with those features.

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

## Drawing the data: points, lines or replicate traces

An XY graph's **Draw each data set as** setting chooses the style:

- **Points only** (the default) shows every measurement.
- **Connected line** joins the _mean_ Y at each X, in X order, without fitting
  anything. Use it for a time course or titration where the shape between
  points matters. Points can stay on or be switched off.
- **Each replicate as a line, plus the mean** draws one thin, light line per
  replicate column (one animal, one well) with the mean line on top, so you can
  eyeball how much replicates disagree before any statistics. A table entered
  as mean/SD/n has no replicates, so it shows the mean line only.

Click a connected line to change its width; its colour follows the data set.

## What's not here yet

"Help me choose" doesn't yet suggest these analyses — pick them directly
from the **Analyze…** dialog. The dose-response fit has one model so far:
no shared parameters, no comparing curves ("do these EC50s
differ?"), no other curve shapes, weighting or interpolating unknowns
from a standard curve yet (sharing a parameter across data sets is not there either). The growth curve fit likewise has one model
(Gompertz); a logistic alternative, phase boundaries drawn on the graph,
and fitting several data sets together aren't there yet either.
