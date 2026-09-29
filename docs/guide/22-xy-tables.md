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

Fits an S-shaped curve — by default Prism's "log(agonist) vs. response,
variable slope", the four-parameter logistic — to each Y data set:

- **Bottom** and **Top**: the two plateaus;
- **EC50** (**IC50** in the inhibitor models): the dose giving a response
  halfway between them, with its 95% CI (also shown as LogEC50, the value
  the fit actually estimates);
- **HillSlope**: how steep the rise is — about 1 for a textbook curve,
  negative when the response falls as the dose rises (an inhibition
  curve fits this same model).

#### Choosing the model

The **Model** menu in the Analyze dialog has Prism's eight dose-response
models. They are one curve; a model only says which numbers are held and
what the halfway dose is called:

- **Agonist or inhibitor.** Choose _agonist_ when the response rises with
  the dose and _inhibitor_ when it falls. It is the same curve either way:
  the halfway dose is called EC50 or IC50, and an inhibitor curve comes out
  with a negative HillSlope. Pick the one that matches your data: a falling
  curve given to an agonist model with a fixed slope fits badly.
- **Variable slope** estimates the HillSlope. **Standard slope** (or "three
  parameters") holds it at 1 for an agonist, or −1 for an inhibitor: the
  shape of simple one-site binding, one number less to estimate.
- **Normalized response** holds Bottom at 0 and Top at 100, for data
  already expressed as a percentage of control or of the maximum, so only
  the halfway dose (and the slope, unless it is standard) is estimated.

A number the model holds is shown as "(fixed)" in the results, without an
SE or CI, exactly like a parameter you hold yourself; the settings say
which ones the model holds. Prism's "[agonist] vs. response" models, with
the dose on a linear axis, are these same fits: choose **doses or
concentrations** below and the fit works on their log.

In the settings, say what your X values are: **logs of the dose** (−9
for 1 nM, the way Prism expects them) or **doses/concentrations**
(1e-9). With doses, the fit uses their log, so a zero dose — usually the
untreated control — has nowhere to go and is left out; the results say
how many points that was.

Every replicate counts as its own point; with summary data, the fit uses
the mean at each dose. The results also give R², Sy.x and a runs test
(as for linear regression, a small runs-test P means the points
systematically miss the curve). By default the CIs are _asymptotic_ —
symmetric around each estimate, the kind Prism 6 and most programs report.
See **Symmetric or asymmetric CIs** below for the alternative.

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
Bottom on "Estimate it" in the fit itself. To compare different curve
shapes, or shared against separate values, see the next two sections.

#### Comparing two curve shapes

**Compare with another model** in the Analyze dialog fits the same data with a
second curve shape (say, variable slope against standard slope, or normalized
against not) and compares the two fits with the same F test and AICc as above.
The F test only works when one shape is a special case of the other, which is
when the simpler one just holds some parameters the other estimates (the
standard slope holds HillSlope at 1, so it sits inside the variable slope). It
tests whether the more flexible shape fits better than chance would give; a
larger P is _no evidence_ of an improvement, not proof that there is none. If
neither shape contains the other (a standard slope against a normalized
variable slope), there is no F test and the table says so; AICc still gives
the chance that each is the better one, and it works for any two shapes. The
results state which model each test prefers. **Alpha** (0.05 unless you change
it) is the cut-off the F test's P value is judged by.
Only the eight dose-response models can be compared with each other, and the
comparison can't be combined with "Compare with a simpler model" above.

#### Sharing or not sharing a parameter

With two or more Y data sets and some parameters shared (see below), choose
**The same model with parameters unshared** and tick the shared parameters you
want to test, for example LogEC50 to ask "is the EC50 different between these
data sets?". The whole fit is compared with the fit where each data set gets its
own value of those parameters. A small P says the data sets really differ in
those parameters; a large P is _no evidence of a difference_, which is not proof
that they are the same. The comparison is of the fits of all data sets together,
so it appears once, in a "Whole fit" column, with the F test's degrees of freedom
and AICc's probabilities. If nothing is shared and you compare two curve shapes,
each data set gets its own comparison.

#### Sharing parameters between data sets

When you pick two or more Y data sets, the Analyze dialog offers **Share
parameters between data sets**: tick Bottom, Top, HillSlope or LogEC50 (LogIC50
for an inhibitor) to give every data set the _same_ value of it. All the data
sets are then fitted together in one go, so a shared parameter is estimated from
every data set's points. This is the usual cure for a data set too short or
noisy to pin a parameter down on its own (say, a short curve that never reaches
its top, sharing Top and HillSlope with a full one), and it is the right model
when you know a parameter should be the same, such as curves from the same assay
with the same plateaus. Parameters you leave unticked stay each data set's own.

In the results a shared parameter reads "(shared)" and shows the same value, SE
and CI in every column. A **Whole fit** table gives the totals: parameters
estimated (a shared one counts once), points, degrees of freedom, sum of
squares and Sy.x for all the data sets together. Degrees of freedom and Sy.x
are the whole fit's, not each data set's own, and every SE and CI comes from that
combined fit; each data set's R² and sum of squares are its own. With nothing
ticked the fit is just each data set on its own, as before.

Limits (see above) and the comparison with a simpler model (holding values)
can't be combined with sharing yet: hold the parameter at a value instead, or
turn sharing off. (Comparing two curve shapes or shared against separate does
work with sharing.)
Sharing works on all the data sets you picked, or none of them; sharing among
some of them only isn't offered.

#### Weighting

An ordinary fit treats every point alike. If your scatter grows with the
response (a big signal is noisier in absolute terms, as in most ELISAs and
qPCR standard curves), the big points then dominate and the small ones are
ignored. **Weight points by** in the Analyze dialog tells the fit to trust the
noisier points less:

- **No weighting** (the default) is right when the scatter is about the same
  everywhere.
- **1/Y** and **1/Y²** give a point less weight the higher the curve is there.
  The height comes from the fitted curve itself (as in Prism), so the fit is
  repeated until the weights stop changing. 1/Y² is the usual choice when the
  scatter is proportional to the response. They need the curve to stay above
  zero at every X you measured; if it doesn't, the results say so (hold Bottom
  above zero, or pick another weighting).
- **1/X** and **1/X²** favour the low doses. They use the doses as you typed
  them, so they need "concentrations" (a log X of 0 or below has no 1/X).
- **1/SD²** uses the spread of your replicates at each X: a noisy X counts for
  less. The fit is to the mean at each X (one point per row), so every row needs
  at least two replicates and a spread above zero; if not, the dialog's result
  says which row is the problem. (Prism does the same with means and SDs.)

With weights on, the results say so and label the sum of squares and Sy.x as
_weighted_ (they are not comparable with an unweighted fit's). SEs, CIs and the
confidence and prediction bands all use the weights. Weighting works for one
data set, for sharing parameters, and for comparing models, except that
**1/Y and 1/Y² can't be combined with a comparison**: each of the two fits
would be weighted by its own curve, so their sums of squares could not be
compared. Choose 1/X, 1/X² or 1/SD² there.

#### Symmetric or asymmetric CIs

In **Analyze…**, under **Confidence intervals**, you can choose how each
parameter's 95% CI is worked out.

- **Asymptotic (symmetric)** is the default: the estimate plus or minus the
  same amount on both sides. It is quick, but it assumes the curve behaves
  like a straight line near the best fit, which is often untrue for a curve
  with few points or a poorly reached plateau.
- **Profile likelihood (asymmetric)** does not assume that. For each
  parameter it tries other values, refits everything else each time, and
  keeps the values the data cannot rule out (an F test at P = 0.05). The
  interval can be lopsided, which is more honest when the data pin one side
  down better than the other. This is Prism's default in version 7 and later.
  It takes a little longer to compute.

The results say which kind was used, in the table heading, in the methods
sentence and in the notebook text. A profile CI can be **open** on one side,
shown as "x to unbounded": the data cannot say how large (or small) the
value could be, for instance a top plateau the doses barely reach. That is a
finding, not an error. The EC50 CI is the LogEC50 CI turned back into a
concentration, so it is lopsided too. The SE column, the dependency and the
CI band around the curve stay asymptotic.

Profile CIs work for one data set at a time, with a parameter held at a
value, and with no weights or 1/X, 1/X², 1/SD² weights. With **shared
parameters**, **1/Y or 1/Y² weights**, or a parameter kept **within limits**,
BarelySig uses the asymptotic CIs and says so in the results and next to the
option.

#### Reading unknowns off a standard curve

Tick **Read unknowns off the curve** and type the Y values of your unknown
samples in the same table, on rows where X is left empty. (Rows with an X are
the standards, as always.) Each unknown gets an X read off the fitted curve,
with a 95% CI. The result table shows the row, the Y, the X and its CI. With
replicate columns each replicate is its own unknown; with mean, SD and n only
the mean is.

The CI is where the curve's 95% confidence bands cross that Y (the same
definition as Prism). It therefore reflects how well the _curve_ is known and
not any scatter among the unknown's own replicates, and it is not symmetric
(wider on the flat side of the curve). If the bands never reach the Y within
a wide range, that end of the CI reads "no upper limit" (or "no lower limit").
A Y at or beyond a plateau (below Bottom or above Top) has no X on the curve,
so the table says that rather than printing a number. For X entered as
concentrations the X and CI come back as concentrations. A comparison, if
you have asked for one, applies to the standards only.

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
from the **Analyze…** dialog. The dose-response fit has the
logistic models above only. Interpolated unknowns are listed in the results but not
marked on the graph yet, and 1/Y weights can't be combined with a comparison. Profile-likelihood CIs are not available for shared parameters, 1/Y or 1/Y² weights, or parameters kept within limits, and the growth curve keeps asymptotic CIs. Other curve shapes (exponential growth and decay, Michaelis–Menten, Gaussian and the rest of Prism's library) are not there yet either, and a linear-axis fit cannot keep a zero dose. The growth curve fit likewise has one model
(Gompertz); a logistic alternative, phase boundaries drawn on the graph,
and fitting several data sets together aren't there yet either.
