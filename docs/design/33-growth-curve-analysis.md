# 33. Growth curve analysis: the reparameterized Gompertz model, and phase detection

Written 2026-09-28 for #94 ("Growth curve analysis: fit curves and detect
phases"). Builds on note 29 (XY tables, linear regression), note 31 (the
XY scatter graph and its fitted-line/band path) and note 32 (the
nonlinear-regression fitting core this reuses the shape of, though not
its code — the model here is not partially linear).

## What was asked, and the scoping decision

#94 is a note for later, filed with the shape of the whole feature: fit
a growth model (logistic, Gompertz, or similar) to an OD600-vs-time XY
series and report lag phase, exponential/log phase (with a growth rate
and doubling time) and stationary phase, each with a value and, where
meaningful, a CI. Model choice, how phases are defined, and precedent
were left to this note.

**This note builds the first slice only:** one model — the Zwietering
reparameterized Gompertz growth curve — fit to one Y data set at a time,
no weighting, no sharing across data sets, asymptotic CIs. Phase
boundaries are read off the fitted curve's own parameters (the tangent
construction below), not a second, separately-fitted windowed
regression, so there is exactly one number to get right per quantity.
Everything reuses note 31's XY scatter graph band unchanged. What's
scoped out is listed at the end, each filed as its own issue.

## The model

**Growth curves aren't a Prism-parity case.** Prism's own equation
library has generic "Growth" models (its "Exponential growth" and
"Sigmoidal, 4PL/5PL" families) but nothing that reports lag time or a
growth rate as a fitted parameter — that vocabulary comes from
predictive microbiology, not Prism. The precedent here is Zwietering et
al., *"Modeling of the bacterial growth curve"*, Appl. Environ.
Microbiol. 56(6), 1990 — the field's standard reference (used by
Combase/DMFit, DIY-branded growth-curve tools, and R packages such as
`growthrates` and `nlsMicrobio`) — for exactly the reason #94 asks for:
it reparameterizes the classical Gompertz function so that the
asymptote, the maximum growth rate and the lag time are themselves the
fitted parameters, rather than quantities read off a curve fit in some
other parameterization after the fact.

Zwietering's reparameterized Gompertz model:

```
Y = A · exp(−exp((μm·e/A)·(λ − t) + 1))
```

Three parameters: **A** (the upper asymptote — the carrying capacity, in
the table's Y units), **μm** (the maximum specific growth rate, the
steepest slope the curve reaches, in Y units per unit time) and **λ**
(the lag time: where the tangent line through that steepest point meets
Y = 0). `e` is Euler's number, fixed. This is the same Gompertz *curve*
as the classical form `Y = A·exp(log(Y₀/A)·exp(−μc·t))`
(`μc` the classical rate, `Y₀` the fitted value at t = 0) — algebraically
identical, `A = A`, `μm = μc·A/e`, `λ = (log(A/Y₀) − 1)/μc` — used below
as an independent check, never as the app's own parameterization: fitting
`Y₀` directly is numerically fragile (a data set whose lag phase starts
near Y = 0 makes `log(Y₀/A)` and its derivatives blow up; confirmed
below), which is the whole reason Zwietering's form exists.

**Why Gompertz and not logistic.** Zwietering's paper reparameterizes
both the logistic and the Gompertz the same way and compares them on
real bacterial growth data; Gompertz's built-in asymmetry (it rises
faster than it falls off into stationary phase) fit the data better than
the symmetric logistic in that comparison, and it is what the field
settled on as the default (Combase/DMFit's primary model). The
reparameterized logistic is a straightforward follow-up model, not a
different fitting method (#101).

**X is time, not logged** — unlike note 32's dose-response model, there
is no log transform: OD600/CFU vs. time is fit directly. Data is note
29/32's usual XY shape: one or more Y data sets on a shared X, replicates
each their own point (summary data fits the means), no weighting — the
same defaults nonlinear-regression uses, for the same reason (Prism's
"consider each replicate value as an individual point").

**Options shape:** `{ model: 'gompertz' }` — a single-value union now, so
the logistic follow-up (#101) adds a member rather than a migration, the
same choice note 32 made for its `model` field.

## Fitting

**No partially-linear structure here** (note 32's `nls(..., "plinear")`
trick needed Bottom/Top to enter the model linearly; here all three
parameters are inside the same nested exponential) **and no `nls()`
either.** Base R's `nls()` uses numeric-derivative Gauss–Newton with no
damping; at the small absolute Y scales an OD600 series plausibly has
(values around 0.01–0.1), it reported "singular gradient" even started
at the data's own true generating parameters, while the model's analytic
Jacobian at that same point has a perfectly ordinary condition number —
confirmed before writing this note. So the app fits with a hand-rolled
**Levenberg–Marquardt** directly on the analytic Jacobian from an
informed start (below): damped Gauss–Newton, backing off (larger damping,
smaller step) whenever a step doesn't lower the sum of squares, exactly
the globalization `nls()` lacks. Finished with the same plain
Gauss–Newton polish note 32 uses once a step is under 1e-6 relative — near
the optimum the sum of squares changes by less than its own rounding, so
a damped step can't be judged by it and a few plain steps finish the job.

**Analytic Jacobian**, `k = (μm·e/A)·(λ − t) + 1`:

```
∂Y/∂A  = exp(−exp(k)) · [1 + exp(k)·μm·e·(λ − t)/A]
∂Y/∂μm = −exp(−exp(k))·exp(k)·e·(λ − t)
∂Y/∂λ  = −exp(−exp(k))·exp(k)·μm·e
```

**Starting values, from the data itself, exploiting the
parameterization's own design:** μm is *defined* as the curve's maximum
slope, so the steepest pair of consecutive points (sorted by t) gives
`μm₀` directly, and the tangent line through their midpoint gives
`λ₀ = t* − Y*/μm₀` (clamped to ≥ min(t): a tangent that would cross Y = 0
before the data starts is clamped to the first time point). `A₀ = 1.05 ·
max(Y)` — the model's asymptote is approached, never reached, so the
largest observed value is always a slight underestimate. **A small
multi-start** on top of this single informed guess — μm₀ scaled ×0.25,
×0.5, ×1, ×2, ×4, ×8 and λ₀ shifted by 0 and ± a quarter of the time
range — covers the rare case the single heuristic start lands somewhere
LM can't climb out of; the lowest converged residual sum of squares
wins, non-converging starts are skipped. Verified before writing this
note, simulating growth curves at different scales and lag times (2%
noise): the informed start converges reliably; the wider multi-start
range earned its keep on one prototype at a very small absolute Y scale
where the narrower ×0.5/×1/×2 range alone missed the optimum. A data set
whose exponential transition is covered by too few points for its scale
(confirmed with a deliberately sparse prototype) correctly lands in
`no-fit` — JᵀJ goes singular chasing a nearly-flat ridge in μm rather
than reporting a spuriously precise number, the same stance note 32
takes when a fit's data don't pin a parameter down.

**Polish**, verbatim in spirit to note 32's: after the LM converges, full
undamped Gauss–Newton steps on the analytic Jacobian while they lower the
sum of squares, then up to three plain steps once a step is under 1e-6
relative.

**Standard errors, CIs, band: asymptotic, from the Jacobian** — the same
construction as note 32: `s² = SS / (n − 3)`, covariance `s²(JᵀJ)⁻¹`,
each parameter's 95% CI at `t(0.975, n − 3)`, and the confidence/prediction
band on a 100-point grid across the observed time range, reusing
`RegressionBand` and note 31's rendering unchanged.

**Derived quantities, by the delta method** (propagated through the same
covariance matrix, not refit): **doubling time** `= ln 2 / μm`, gradient
`(0, −ln2/μm², 0)`; **τ**, the time the tangent line through the
steepest point reaches the asymptote, `= λ + A/μm` — the point past which
the curve is within the tangent's reach of its plateau, and so the
natural end of "exponential phase" below — gradient `(1/μm, −A/μm², 1)`.
Each gets its own SE and CI from `gradᵀ (JᵀJ)⁻¹ grad · s²`, `t(0.975, n − 3)`.

**Can't fit, in words** (`ran: false`, never a `NaN`), mirroring note 32:

- `few`: fewer than 4 points (3 parameters need at least one residual df);
- `few-t`: fewer than 3 distinct time points (3 parameters can't be told
  apart through 2 time points however many replicates);
- `constant-y`: every Y the same;
- `no-fit`: no start converged, or JᵀJ is singular — typically data with
  no visible plateau yet, or too much scatter for any start to climb
  out of; confirmed against R before writing (a straight increasing
  line, and data covering only the lag-into-rise portion, both land
  here rather than reporting a runaway A).

## Phases, read off the fit

Phase boundaries are the two times the tangent line through the curve's
steepest point crosses Y = 0 and Y = A — exactly Zwietering's own
construction for λ, extended one step further for the phase that
follows it, so lag/exponential/stationary and λ/μm/doubling-time are one
fact, not two:

- **Lag phase:** `t ≤ λ`. Reported as the lag time λ (with its CI); the
  results say in words that growth has not yet measurably started by
  this fitted model.
- **Exponential (log) phase:** `λ ≤ t ≤ τ` (τ defined above). Reported
  with the maximum growth rate μm and the doubling time `ln2/μm`
  (each with a CI) — the two numbers #94 asks for by name.
- **Stationary phase:** `t ≥ τ`, reported as "from τ onward", with the
  asymptote A (with its CI) as the plateau value.

τ can fall before λ (or outside the observed time range entirely) if the
fit is very shallow or the data don't reach a plateau; the results state
the phase boundary as computed and don't hide a boundary the data don't
support, the same stance note 32 takes on `ambiguous` parameters rather
than refusing to report a number.

This is a design choice, stated in the results text ("phase boundaries
from the fitted curve's tangent at its steepest point"): the alternative
this note considered and set aside is a windowed regression on the raw
points (a sliding-window slope, independent of any curve shape) to find
the phases directly. That approach has its own literature (e.g. the
"two-step" method some growth-curve tools default to) and is a
reasonable follow-up (#102) if a data set's shape doesn't match Gompertz
well enough for the tangent construction to be trusted, but doubles the
fitting/validation work for this first slice and reports two potentially
disagreeing growth rates (the model's μm and the window's own slope) for
one curve — the model-derived phases are simpler to validate and to
explain to a bench scientist reading the results ("the phases come from
the same curve fit shown on the graph"), so they are the first slice.

## Graph

Unchanged from note 32: the fitted curve and its band are note 31's
`RegressionBand` on a 100-point grid, so `src/graphs/data.ts` only needs
to accept `growth-curve` as a graph's fit source alongside
`linear-regression` and `nonlinear-regression`, and `GraphSettings`'
"Fitted line" list gains the new kind. No new mark role, no phase
shading on the graph in this slice (filed as #103 — vertical guides or
tinted bands at λ and τ are the natural follow-up once there's a fixture
set to check them against).

## Validation

`src/analyses/growth-curve/oracle.R`, independent of `analysis.R`
(CLAUDE.md), base R only so the parity test can rerun it in WebR:

1. **Reference fit:** a coarse grid over λ (21 values spanning the
   observed time range padded by half its span on each side), μm (25
   log-spaced values from the data's own steepest observed slope) and A
   (three multiples of max(Y)) — generic, data-driven bounds, not the
   app's own tangent-line heuristic — then a hand-written
   Levenberg–Marquardt with a **five-point finite-difference Jacobian**,
   finished with plain Gauss–Newton steps — the same two-stage shape as
   note 32's reference, note 32's own reason (parity to 1e-6 needs a
   finished optimum, not merely a converged one). The finite-difference
   step is **1e-6, not note 32's 1e-4**: right at the Gompertz's steepest
   region, the inner exponent moves fast enough with the parameters that
   1e-4 left the finite-difference Jacobian about 1.6e-4 relative off the
   analytic one at the far pre-lag tail of the confidence band — a real
   fixture mismatch, tracked down to finite-difference truncation error
   before any fixture was accepted (confirmed numerically: the analytic
   and a 1e-6-step finite-difference Jacobian agree to under 1e-6 at
   every grid point checked, including that tail).
2. **Independent cross-check, verified before any fixture was written**
   (CLAUDE.md, Lessons): convert the reference's (A, μm, λ) to the
   classical parameterization (`μc = μm·e/A`, `Y₀ = A·exp(−(μc·λ + 1))`),
   refit *that* form with base `nls()` seeded at the converted point, and
   require the re-converted answer to match the reference to 1e-4
   relative. This is `nls`'s own Gauss–Newton (numeric derivatives) on an
   entirely different, differently-conditioned parameterization,
   confirming the reference's optimum from a second, independent
   numerical path — the same role `drc` played for note 32, substituting
   a from-scratch check because no package fits *this* parameterization
   directly and the classical form is too numerically fragile to search
   for a global optimum blind (prototyped: `growthrates::grow_gompertz`,
   the CRAN package for the classical form, could not be trusted to find
   the same optimum from generic starting values on synthetic data with
   an early, near-zero lag phase — confirming the numerical fragility
   above is real, not hypothetical, and why the app fits the
   reparameterized form at all). Not a blind cross-check with an
   independent optimizer's own starting values, unlike note 32's `drc`
   run — noted as a real, if smaller, gap versus note 32's validation,
   accepted because the from-scratch LM reference already used a coarse
   *grid* search (not a single local optimizer run) to find the global
   optimum before any seeding happens.
3. Standard errors, CIs, derived quantities and the band all come from
   that same finite-difference Jacobian, propagated through the delta
   method exactly as `analysis.R` does, so a fixture also checks the
   delta-method plumbing, not only the curve fit.

Prototyped before writing this note (synthetic curves at different
scales and lag times, 2% noise): the app's heuristic-start LM and this
grid+LM reference agree to better than 1e-12 relative on every parameter
before either polish, confirmed again on every fixture below after
writing them.

Fixtures (`npm run oracle:generate growth-curve`):

- `clean`: a clear lag, exponential rise and plateau, in triplicate (the
  sanity case for every reported number, phases included);
- `short-lag`: growth starts almost immediately (λ near the first time
  point);
- `no-plateau`: the observed window ends well before the fitted curve
  reaches stationary phase (τ past the last time point) — the app still
  reports it, stated as extrapolated beyond the data;
- `outlier`: one point raised well above the curve, for the runs test and
  residuals — reusing `bs_runs_test` from `linear-regression`, unchanged,
  exactly as note 32 does;
- `few` (n = 3), `few-t` (two distinct time points), `constant-y`;
- `declining`: Y only decreases — not a growth curve, and the
  least-squares optimum for an increasing Gompertz degenerates into an
  already-at-the-asymptote step just before the window starts rather
  than failing to converge outright. Both `analysis.R` and the reference
  catch this the same way: the fitted exponential phase's own width
  (`A / μm`) coming out far shorter than the observed time span — a
  near-instantaneous step the data can't resolve — is `no-fit`, checked
  identically in both, not just "did an optimizer converge."

Summary data (mean/SD/n) needs no fixture of its own: `xySeries`
(note 29) already reduces summary rows to their means before any
analysis module sees the points, exactly as `linear-regression` and
`nonlinear-regression` rely on, so a growth curve fit to summary data is
the same request shape as one fit to replicates.

No GraphPad worked example: Prism has no built-in growth-phase reporting
to cross-check against, so there is nothing to compare to Prism's own
numbers here, unlike note 32's dose-response case — the R packages and
the from-scratch reference above are the whole of this validation.

## What's scoped out (each filed as its own issue)

- **The reparameterized logistic model** (#101), as an alternative to
  Gompertz, alongside Zwietering's own comparison of when each fits
  better.
- **A windowed-regression alternative to the tangent-derived phases**
  (#102), for data sets whose shape the Gompertz tangent construction
  doesn't describe well.
- **Phase shading on the graph** (#103): vertical guides or tinted
  regions at λ and τ, once a fixture set exists to check them against.
- **Weighting, and fitting multiple data sets together** (a shared A or
  μm across replicate cultures) — the same follow-ups #97/#100 already
  filed for nonlinear regression, extended to this model once either
  lands.
- **The Baranyi–Roberts model** (a mechanistic alternative to Gompertz,
  common in predictive-microbiology software) — not filed yet; only
  worth adding if a real data set fits Gompertz poorly enough to need
  it.
