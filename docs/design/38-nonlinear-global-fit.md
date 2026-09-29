# 38 — Nonlinear regression: sharing parameters across data sets (global fit)

Issue #97, the follow-up to notes 32, 35, 36 and 37. Until now each Y data
set was fit on its own. Prism's *global fitting* fits several data sets in
one go, with chosen parameters forced to have one value for all of them
("Shared value for all data sets") and the rest free to differ. Typical
uses: one HillSlope for every curve, common plateaus, or one EC50 for
curves that should coincide. It is also the prerequisite for #105, "do the
EC50s differ?" (shared vs. unshared, compared).

## What was built

An option `shared: { bottom, top, hillSlope, logEc50: boolean }` on the
dose-response analysis (`NonlinearRegressionOptions`, `src/model/project.ts`).
A ticked parameter is estimated once, for all the chosen data sets; the
others are estimated per data set. The default (nothing shared) is exactly
today's independent fits.

- **One stacked fit.** The points of every data set are stacked into one
  least-squares problem. The unknowns are the shared parameters (one each)
  plus every unshared parameter of every data set. Model, X handling
  (log or concentration, zero doses dropped per data set) and held parameters
  (the model's presets and the user's "hold at a constant") are as before.
- **Held wins over shared.** A parameter that is held at a constant (by the
  model or the user) is not estimated, so ticking "share" on it means
  nothing; the dialog hides the tick and the fit ignores it. If every
  ticked parameter is held, the fit is still the stacked one (with nothing
  actually shared), which makes it equal to the independent fits: the test
  for "none shared = separate fits" runs that path (below).
- **Needs two or more data sets.** With one data set the option is ignored
  (the dialog only shows it for two or more); the request carries the
  *effective* flags (all false).
- **df over all points.** df = total points − parameters actually estimated
  (a shared one counts once). One s² = SS_total / df is used for every SE,
  CI and band, as Prism does for a global fit. Sy.x is the whole fit's.
- **SEs, CIs, dependency** from the stacked Jacobian: (J'J)⁻¹ covers all
  unknowns, so a shared parameter's SE reflects every data set and the
  curves' bands include the covariance between a data set's own parameters
  and the shared ones. Dependency is Prism's, 1 − 1/(A_jj · Ainv_jj), on the
  stacked matrix. Same asymptotic CI with t(0.975, df).
- **Results per data set, plus the shared values.** Each data set still has
  its own column, curve, residuals, runs test, band, sum of squares, R² and
  point count. A shared parameter shows the same number, SE and CI in
  every column, marked "(shared)". The result also carries
  `global: { shared, n, parameters, df, ss, syx }`: the whole fit's point
  count, number of parameters estimated, df, SS and Sy.x, and each data
  set's `ss` and `n` are already in its outcome. That is everything #105
  needs to run an extra-sum-of-squares F test between "EC50 shared" and
  "EC50 separate" (SS, df and parameter counts of each global fit).
  Per-data-set `df` is the whole fit's df (a data set on its own has none);
  per-data-set `syx` is the whole fit's.

## Fit method (`bs_global_fit` in `analysis.R`)

Levenberg–Marquardt on the stacked residuals with the analytic Jacobian
(each column of a data set's own 4-column Jacobian goes to that parameter's
unknown; a shared unknown collects the columns of every data set), from two
starts: the independent fit of each data set (shared parameters averaged),
and the pooled fit of all points; the lower sum of squares wins. Finished
by plain Gauss–Newton steps like the single fit. There is no `nls` here:
`nls` would need the unknowns as a vector with a formula per case, and the
LM is short and the same Jacobian gives the SEs.

Refusals in words: no fit when the stacked normal matrix is singular, the
iteration runs off (a plateau more than 100× the data's Y range, or a
LogEC50 more than ten dose-ranges outside the data), or the total points
don't exceed the unknowns.

**Not built (follow-up #109):** limits ("estimate, within limits") together with
sharing, and the comparison of #98 together with sharing. Both are refused with
a plain message ("hold it at a value or leave it free"), because a bound the
global fit runs into needs the same at-bound bookkeeping as note 35 for a
stacked problem, and the comparison is naturally #105's shared-vs-separate
one. A parameter *held* at a constant works with sharing.

## UI

Analyze dialog, only when two or more Y data sets are ticked and the kind is
a dose-response fit: a fieldset "Share parameters between data sets" with
one checkbox per parameter (Bottom, Top, HillSlope, LogEC50 / LogIC50).
The hint says what sharing means in plain words ("one value for all the data
sets, estimated from all their points together; use it when you expect the
curves to have, e.g., the same slope"), that a shared parameter has one SE
and CI, and that a shared LogEC50 is a test of nothing by itself: it is an
assumption. A parameter held by the model or the user shows no checkbox.
The results grid marks shared values "(shared)"; a "Whole fit" grid gives
points, parameters estimated, df, SS and Sy.x; the methods line says which
parameters were shared. The headline reading gives the shared values once.

## `.bsig`

Option `shared` written field by field in a fixed order; absent (older
files) = nothing shared, so no schema bump. Module version 4 → 5 so stored
results recompute and carry `global`.

## Intentional differences from Prism

- Prism also lets a parameter be shared *among some* data sets only (via
  column-wise constraints or "Constrain: different for each data set" with
  an equation per column). Here a parameter is shared by all chosen data sets
  or by none.
- Prism can constrain a shared parameter to a limit or hold parameters
  individually per data set; only a constant that applies to all is offered
  (#109 for limits).
- Prism reports per-data-set R² and sums of squares as here; whether its
  per-data-set "Sy.x" is the whole fit's I could not check offline; ours is
  the whole fit's (one s² is what the SEs use).
- The model comparison (#98) is not offered with sharing (see above).

## Validation

`oracle.R` gains a "Global fits" section. The reference is a hand-written
stacked LM (numerical five-point Jacobian, starts different from the app's)
in the same style as the single-fit reference. Per case it is checked against
`drc::drm(y ~ dose, curveid = , pmodels = )` with the same shared parameters:
the parameters to 1e-2, the sum of squares to 1e-6 relative (the same minimum,
not merely a nearby point) and the degrees of freedom exactly. The app's SEs
come from the same J'J as the reference's, so they are validated against the
reference, not against drc. A none-shared global fit has the same estimates and
sum of squares as the independent single fits (checked in the case below), but
its SEs differ, since one pooled s² serves all data sets.
Cases: HillSlope shared across three curves; Bottom and Top shared with
separate EC50 and slopes; EC50 shared; all four shared; none shared through
the global engine (Bottom, Top and HillSlope held so the "shared" ticks
change nothing), whose expected values are the independent single fits;
missing values and unequal n per data set; a small data set (four points next
to a full one, hill shared); a concentration-X pair with zero doses.
