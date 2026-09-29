# 41 — Nonlinear regression: profile-likelihood confidence intervals

Issue #99, on top of notes 32 (the four-parameter fit), 35 (constraints), 38
(global fit), 39 (comparison) and 40 (weighting). Until now every CI is
asymptotic (Wald): estimate ± t·SE, symmetric. For a nonlinear model that is
an approximation that can be poor with few points or when the data pin a
parameter down badly. The profile-likelihood CI (Venzon–Moolgavkar) does not
assume symmetry and is the one Prism recommends.

## Decision: an option, Wald stays the default

`ci: 'wald' | 'profile'` in the analysis options (`.bsig` files without it
are `wald`). **Prism's default is profile likelihood** (Prism 7+; "asymptotic
(symmetrical)" is the alternative). We keep Wald as the default so that
existing projects, guide screenshots and fixtures keep meaning what they
did, and so that the cheap path stays the default in WebR. Switching the
default is a one-line change (`DEFAULT_OPTIONS` in `model/project.ts`, plus
the `.bsig` reader's "absent" value only if old files should change too,
which they should not); the user may want to make it once the option has
been used a while. Recorded as an intentional difference from Prism.

The results always state the method: the methods line and the CI table's
title ("95% CI (asymptotic)" / "95% CI (profile likelihood)").

## Definition

For a fitted parameter θᵢ with K estimated parameters, n points and
minimum (weighted) sum of squares SS₀, the profile is
SS(θ) = min over the other parameters of SS with θᵢ held at θ. The
95% interval is {θ : SS(θ) ≤ SS₀ · (1 + F/(n−K))}, F = qf(0.95, 1, n−K).
This is exactly where the extra-sum-of-squares F test of "θᵢ = θ vs. free"
reaches P = 0.05. The endpoints are the two roots of SS(θ) − threshold.

## Algorithm (`bs_fpl_profile` in analysis.R)

Per parameter and side:

1. Start at the estimate, step = its Wald SE (never 0), moving outward and
   doubling the step each time. At each probe θ the other parameters are
   re-fitted by Levenberg–Marquardt (analytic Jacobian, warm start from the
   previous probe), so the profile follows the ridge.
2. The first probe whose SS exceeds the threshold brackets the root together
   with the previous probe; `uniroot` (tol tight) finishes it, each
   evaluation refitting from the inner bracket end's parameters.
3. **Unbounded side:** if the SS is still below the threshold after 30
   doublings (2³⁰ SEs), the side is open. The result carries `NA` there and
   the display says "unbounded" (e.g. Top when the data never reach the top
   plateau); never NaN, never a huge invented number. LogEC50's open side
   makes EC50's open (EC50 = 10^LogEC50; a lower end of −∞ is EC50 → 0).
4. If a probe cannot be fitted (non-finite) the whole series falls back to
   Wald CIs and says so in the results (`ciMethod` per series). A silent
   partial mixture would be wrong.

Dependency and SE stay Wald (they are properties of the local curvature and
are reported as before); "ambiguous" (dependency > 0.9999) still shows
"very wide", as Prism does.

## Interaction with the rest

| feature | with profile CIs |
|---|---|
| held (fixed) parameters, model presets | supported: only estimated parameters are profiled, K counts them; held ones stay without CI |
| static weights (1/X, 1/X², 1/SD²) | supported: weighted SS in both the profile and the threshold |
| 1/Y, 1/Y² weights | **not supported, falls back to Wald** with a stated reason: the weights change with the parameter, so the profile is not a plain least-squares profile. Follow-up filed |
| limits (bounded, non-fixed) | **falls back to Wald**, stated: the profile would have to be a constrained fit and can end on a limit; follow-up filed |
| global fit (any shared parameter), and comparisons that stack data sets | **falls back to Wald**, stated. A stacked-fit profile is the same idea with more parameters, not done here; follow-up filed |
| model comparison (F test, AICc) | unaffected; the comparison's fits use no CIs |
| EC50 | 10^ of the LogEC50 profile bounds (invariant to the log transform) |
| derived quantities | Span has no CI; interpolated X keeps the confidence-band definition (note 40), which is Wald-based by Prism's own definition; the results say so |
| growth curve | unchanged (Wald), out of scope |

The fallback is decided in TypeScript (`profileFallback`, `ci.ts`) from the
request, so the Analyze dialog can say it before the run, and the result
carries `ci` (what was used) and `ciFallback` (why not what was asked).

## Cost and the UI thread

Each side is ~10 to 60 refits of at most four parameters over n points, times
up to four parameters. Runs in the WebR worker like every fit, so the UI does
not block; measured time is in the validation section below. The option is
off by default.

## Validation

`oracle.R`: `run_fpl_one(..., profile = TRUE)` computes the profile with the
oracle's own projected-LM optimiser (numerical five-point Jacobian, nothing
shared with the app's analytic-Jacobian LM), a scan outward in fixed
multiples of the SE for the bracket, and base `uniroot` on the profiled SS
minus the threshold. Checks: at every reported end the profiled SS equals
the threshold, an unbounded side is confirmed by the profile staying below
the threshold at 10⁶ SEs, and for finite ends `MASS::confint` on an `nls` fit
agrees within its own interpolation error (a sanity check on the reference,
not the 1e-6 comparison). Cases: symmetric-ish well-determined curves,
asymmetric (small n), one plateau (open Top), missing values via the table's
gaps, held Bottom, static weights, concentration X (EC50 10^ bounds), n = K+1.

## Validation as landed

- Nine oracle cases (`profile-*`): rising, falling, one plateau, concentrations
  with a zero dose, single replicates, five points with a held slope
  (df 2), Bottom held at 0, 1/X weights, 1/SD² means, and empty cells. The
  reference is the oracle's own projected Levenberg-Marquardt plus base
  `uniroot`; in desktop R each end is also checked by refitting with base `nls`
  (port/BFGS fallbacks) with that parameter pinned at the end: the weighted SS
  must equal the F threshold to 1e-6, and `confint.nls` must agree within 5% of
  the SE where it is not too rough.
- Parity in WebR: each case runs in about 10 s, no `parity = FALSE`.
- No oracle case has an unbounded side: a fit that runs at all rarely has one,
  and a reference that follows a runaway profile (a long, flat valley) proved
  too slow and unreliable. The null-for-NA mapping is unit tested instead;
  a follow-up covers the oracle case.
- Not a Prism difference we know of: bounds use the same F criterion as
  Prism's profile CIs; we have not compared to Prism output numerically.
