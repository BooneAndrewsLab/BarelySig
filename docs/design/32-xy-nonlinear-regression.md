# 32. Nonlinear regression: the four-parameter dose-response curve

Written 2026-09-28 for #37 ("XY tables and nonlinear regression").
Builds on note 29 (the XY table type, linear regression — and the first
time #37 was scoped down) and note 31 (the XY scatter graph, whose
fitted-line/band path this plugs into).

## What was asked, and the scoping decision

After note 29, #37 is "just" nonlinear regression: a dose-response model
library (log(agonist) vs. response, variable-slope 4PL, inhibitor
models), EC50/IC50 with CIs, constraints, parameters shared across data
sets, extra sum-of-squares and AICc model comparison, validated against R
and GraphPad's Curve Fitting Guide. Each of those is its own piece of
work with its own correctness risk; landing them together would make one
unreviewable change and put every new number behind the least-tested
part.

**This note builds the first slice only:** Prism's single most-used
model, *log(agonist) vs. response — Variable slope (four parameters)*,
fit to each chosen Y data set on its own, no constraints, no sharing, no
model comparison — with EC50 and its CI, goodness of fit, the runs test,
residuals, and the curve and its confidence/prediction band on note 31's
XY scatter graph. Everything after it (below, "What's scoped out") reuses
this slice's fitting core, parameter/result shape and oracle, so doing it
first is also the right order. #37 is commented as rescoped to this
slice and closes with it; the rest is filed as #95–#100.

## The model

Prism's equation, verbatim from the Curve Fitting Guide
("log(agonist) vs. response — Variable slope"):

```
Y = Bottom + (Top - Bottom) / (1 + 10^((LogEC50 - X) * HillSlope))
```

X is the **log₁₀ of the dose**. Four parameters: Bottom and Top (the
plateaus), LogEC50 (the X halfway between them) and HillSlope
(steepness; negative for a falling curve). Prism reports EC50 =
10^LogEC50 alongside.

**X on a log scale.** Prism's model takes log X and its guide says to
transform raw concentrations first. Most bench users type concentrations
(1e-9, 1e-8, …), and fitting the log model to them gives a meaningless
curve with no error. So the analysis has one option, asked in plain words
in the Analyze dialog:

- `x: 'log'` (default, Prism's model as written): X is already
  log(concentration), e.g. −9 for 1 nM.
- `x: 'concentration'`: X is a concentration; the analysis fits against
  log₁₀(X). A row with X ≤ 0 (usually the zero-dose control) has no log
  and is **dropped from the fit, counted and stated** ("2 points with a
  zero or negative dose left out: a log axis has no place for 0") —
  Prism's own log transform turns such an X into a blank. Residuals and
  the band come back in the table's own X units, so the graph plots them
  against what the user typed (a log X axis is one click in note 31's
  axis format).

The fitting is the same either way; only the X handed to it differs.

**Falling curves.** Inhibition data fits this same model with a negative
HillSlope — that is Prism's own behaviour for this equation. Prism's
separate *log(inhibitor) vs. response* model (IC50 naming, sign
convention flipped) is a follow-up, not a second fitting method.

**Plateau ordering.** The curve is unchanged by swapping Bottom and Top
and negating HillSlope. Results are reported in the one form Prism uses:
Bottom ≤ Top, the sign of HillSlope carrying the direction.

**Options shape.** `{ model: 'log-agonist-variable-slope'; x: 'log' |
'concentration' }` — `model` has one value now so the follow-up models
add a union member rather than a migration.

**Data.** Exactly `linear-regression`'s input: `xySeries` points, one
fit per ticked Y data set. Replicates are each their own point; summary
data fits the means — both Prism's defaults ("consider each replicate Y
value as an individual point"; no weighting). Weighting is a follow-up.

## Fitting: base R `nls`, partially linear

`drc` is the usual R package for this, but WebR ships only base R +
mvtnorm + emmeans (CLAUDE.md, Stack), so the app fits with `stats::nls`
and `drc` is reference-only.

**Bottom and Top enter the model linearly.** Given LogEC50 and
HillSlope, `Y = Bottom · (1 − f) + Top · f` with
`f = 1 / (1 + 10^((LogEC50 − X) · HillSlope))`, so the best plateaus are
an ordinary least-squares solve. `nls(..., algorithm = "plinear")`
(Golub–Pereyra) exploits exactly this: it iterates over the two
nonlinear parameters only and needs starting values for just those two.
That removes the usual failure mode — bad plateau starts — entirely.

**Starting values: a small multi-start**, rather than one guess. LogEC50
starts at the 25th, 50th and 75th percentiles of X; HillSlope at ±1 (the
textbook slope, right for data spanning a few log units) and ±4 / (X
range) (a transition spanning the data, right when X is on an unusual
scale). Twelve fits of two parameters each; failed starts are skipped and
the lowest residual sum of squares wins. The sign of both slope starts
means rising and falling data need no guess. `nls.control(tol = 1e-8,
scaleOffset = 1, maxiter = 200)`; `scaleOffset` keeps near-perfect data
from failing R's relative-offset convergence test.

**Polish.** `nls` stops at its relative-offset tolerance, about 1e-9
relative short of the optimum — enough to put a near-zero residual or
band limit a few 1e-6 off in relative terms, which a 1e-6 fixture
comparison catches (it did, in the first run). So the fit is finished
with full four-parameter Gauss–Newton steps on the analytic Jacobian:
first while they lower the sum of squares, then up to three plain steps
once a step is below 1e-6 relative — that close, the sum of squares
changes by less than its own rounding and can't judge a step, while
Gauss–Newton converges quadratically.

Not `SSfpl`: its self-start refuses fewer than five distinct X values,
fits the natural-log `scal` parameterization (one more conversion to get
wrong), and gives one start rather than several.

**Standard errors, CIs, bands: asymptotic, from the Jacobian.** After the
fit, the app computes the analytic Jacobian J of the model in (Bottom,
Top, LogEC50, HillSlope), the covariance `s² (JᵀJ)⁻¹` with
`s² = SS / (n − 4)`, and:

- each parameter's SE and 95% CI `estimate ± t(0.975, n − 4) · SE`;
- the EC50 CI as `10^` of the LogEC50 CI (asymmetric around EC50,
  symmetric in log) — exactly how Prism reports EC50 from this model;
- the confidence band `fit ± t · sqrt(c) · s` and prediction band
  `fit ± t · sqrt(c + 1) · s`, `c = g(x)ᵀ (JᵀJ)⁻¹ g(x)` with g the
  model's gradient at x — Prism's documented formula ("How confidence
  and prediction bands are computed"), on note 31's fixed 100-point grid
  across the observed X range (in log X), reusing `RegressionBand`
  unchanged. `predict.nls` computes no intervals, so this is ours either
  way.

**The CI method is an intentional, stated difference from Prism's
recommendation.** Prism (7 and later) offers asymmetric *profile
likelihood* CIs on its Confidence tab and recommends them; its asymptotic
("symmetrical", Wald) CIs are the other choice, and the only kind Prism 6
and most other programs report. This slice ships the asymptotic ones:
they are deterministic, need no nested fitting that can itself fail to
converge, and for LogEC50 — the parameter people report — the log scale
already makes them close to the profile interval when the data define
both plateaus. The results say "asymptotic 95% CI". Profile-likelihood
CIs (Venzon–Moolgavkar, as Prism uses; an extra-sum-of-squares F with 1
and n − 4 df per bound, robust here because each profile is a
one-parameter `plinear` fit) are a follow-up, and the choice between them
is Matej's to confirm.

**Ambiguous fits.** Prism flags a parameter "ambiguous" when its
*dependency* exceeds 0.9999, dependency being `1 − (SE with the others
fixed / SE)²` = `1 − 1 / ((JᵀJ)ᵢᵢ · ((JᵀJ)⁻¹)ᵢᵢ)` (Curve Fitting Guide,
"How dependency is calculated"). Each parameter reports its dependency
and an `ambiguous` flag; the results show such a value with Prism's "~"
and its CI as "very wide", and say in words that the data don't pin that
parameter down (usually: no points on one plateau).

**Can't fit, in words** (`ran: false`, never a `NaN`):

- `few`: fewer than 5 points — 4 parameters need at least one degree of
  freedom left for scatter;
- `few-x`: fewer than 4 distinct X values — four parameters can't be
  told apart through three dose levels however many replicates each has;
- `constant-y`: every Y the same (as linear regression: nothing to fit);
- `no-fit`: no start converged, or JᵀJ is singular — Prism's "Didn't
  converge". Typically the data trace neither plateau (a straight line,
  or half a curve); the text says so and suggests a wider dose range.
  Confirmed against R before writing: linear data and data covering
  only the bottom half of a sigmoid both end here.

**Goodness of fit.** Degrees of freedom (n − 4), SS, Sy.x
(`sqrt(SS / df)`), R² = `1 − SS / SStotal` (Prism's definition for
nonlinear fits, and why a nonlinear R² can't be read like a linear one —
stated in the guide), residuals, and the same Wald–Wolfowitz runs test
as linear regression (note 29), sharing `analysis.R`'s `bs_runs_test`
rather than a second copy.

## Graph

Note 31 built the fitted line and band as "a polyline evaluated at a grid
of x", forward-compatible with this. The result carries the same
`RegressionBand`, so `src/graphs/data.ts` only has to accept a
`nonlinear-regression` analysis as the graph's fit source as well as a
`linear-regression` one, and `GraphSettings`' "Fitted line" list offers
both. No new layout, mark role or hit-testing.

## Validation

`src/analyses/nonlinear-regression/oracle.R` must be independent of
`analysis.R` (CLAUDE.md) — and base R alone, so the parity test can run
it in WebR. Its reference fit shares no code path with `nls`:

1. A coarse grid over (LogEC50, HillSlope) — 41 LogEC50 values across the
   X range × slopes ±0.1…±5 in steps of 0.05 — with the plateaus by
   linear least squares at each point, as a start;
2. a hand-written Levenberg–Marquardt with a **five-point
   finite-difference** Jacobian (step 1e-4; not the analytic one
   `analysis.R` uses), finished with five plain Gauss–Newton steps for
   the same rounding reason as the app's polish. A plain central
   difference, or a step scaled to the parameter, left the reference
   ~1e-9 off the optimum on a steep curve — its truncation error, not
   the app's — and was replaced before any fixture was kept;
3. covariance, CIs, dependency and bands from that same finite-difference
   Jacobian.

Each fixture's `check` (note 06) then fits the same data with
`drc::drm(..., fct = L.4())` — a different package, parameterization
(`c + (d − c) / (1 + exp(b (x − e)))`, so HillSlope = −b / ln 10) and
optimizer (`optim`) — and stops unless its estimates are within 1e-2 relative and, polished
from them by the reference's own LM, land on the reference's optimum to
1e-6: evidence both found the same, global least-squares optimum, which
a local polish alone can't show. (Polished, because `optim` stops short
on a flat valley: on the outlier case `drc` alone was 3e-3 off.) The
same `check` confirms the runs test against `randtests::runs.test`,
kept out of the recorded call so the parity test can still run it. Only the
estimates are compared with `drc`: its standard errors come from the full
numerical Hessian, not Prism's JᵀJ, and legitimately differ in the third
digit.

Prototyped before writing this note: on the rising data below, the app's
`plinear` fit and the oracle's LM already agreed to 4e-9 relative on
every estimate and 1e-9 on every SE, before either polish; `drc` agreed
on the estimates to its own convergence tolerance (~4e-6). With both
polishes, every fixture agrees to well inside 1e-6, in desktop R and in
WebR.

Fixtures (`npm run oracle:generate nonlinear-regression`):

- a rising curve with triplicates across 5 log units (the sanity case);
- a falling curve (negative HillSlope, plateau ordering);
- concentrations with a zero-dose control (`x: 'concentration'`: the
  zero row dropped and counted; EC50 near 1e-8 keeps its magnitude);
- a very small EC50 (log X near −12), magnitude through parsing;
- an outlier (runs test, residuals);
- six doses reaching the bottom plateau but not the top: converges, with
  dependencies of 0.998 (Top), 0.997 (LogEC50) and 0.991 (HillSlope) —
  high, wide CIs, but under Prism's 0.9999 line;
- doses covering only the start of the rise (`no-fit`; the `check`
  shows the reference's own least-squares curve running off to an
  unbounded Top). No converged-but-ambiguous case: a search of 120
  simulated sparse-plateau data sets found none — with `plinear`, data
  that loose fail to converge instead — so the `ambiguous` flag is
  covered through the dependency values it is computed from;
- n = 4 (`few`), three distinct X values (`few-x`), constant Y.

GraphPad worked example: the Curve Fitting Guide's dose-response pages
describe the model and its reporting but publish no data table with
fitted values to match to digits, so there is no numeric Prism
cross-check to add here; the parameterization and every reported
quantity follow its text as cited above. If Matej can export a Prism fit
of any fixture's data, it becomes one more fixture `check`.

## What's scoped out (each filed as its own issue)

- **More models** (#95): log(inhibitor) vs. response (IC50 naming), the
  standard-slope (Hill = 1, three-parameter) models, normalized-response
  variants, [agonist] vs. response on a linear X, and the wider curve
  library (exponentials, Michaelis–Menten, …).
- **Constraints** (#96): fixing or bounding a parameter (Bottom = 0,
  Top = 100, HillSlope = 1), Prism's usual advice when data are sparse.
- **Shared parameters across data sets** (#97, global fitting).
- **Model comparison** (#98): extra sum-of-squares F test and AICc,
  between models or between shared/unshared fits ("do these EC50s
  differ?").
- **Profile-likelihood (asymmetric) CIs** (#99), Prism's recommended
  choice.
- **Weighting** (1/Y², by SD) and **interpolating unknowns** from a
  standard curve (#100).
- "Help me choose" wiring for XY tables stays #86.
