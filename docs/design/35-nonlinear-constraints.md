# 35 — Nonlinear regression: constraining parameters

Issue #96, the follow-up to note 32. Prism's usual advice for sparse
dose-response data is to hold what you know: Bottom = 0 for
baseline-subtracted data, Top = 100 for percent of control, HillSlope = 1
for simple binding. This adds that to the four-parameter logistic.

## What was built

Bottom, Top and HillSlope each take one of three constraints
(`ParameterConstraint` in `src/model/project.ts`):

- `free` (default): estimated;
- `fixed { value }`: held at a constant (Prism's "constant equal to");
- `bounded { lower, upper }`: estimated within limits, one or both finite,
  lower < upper.

LogEC50 is never constrained (Prism doesn't either by default, and a held
EC50 is not a fit).

`.bsig`: the three fields are written explicitly; a file without them
reads as all-free, so there is no schema bump. The module `version` went
1 → 2 so stored results recompute and gain the new `status` field.

## The fit

- **Nothing constrained:** unchanged (nls `plinear`, then Gauss-Newton
  polish). Existing fixtures still pass to tolerance.
- **Anything constrained:** `nls(algorithm = "port")` on the free
  parameters only, multi-started over both plateau orders, a LogEC50
  quantile grid and a few Hill values, the best sum of squares winning.
  Held parameters are constants in the formula.
- **Active set.** A free parameter that ends on a bound (tolerance
  1e-8·max(1, |p|)) is held there and the rest refit. It is reported with
  status `at-bound`: no SE, CI or dependency. Reporting an SE for a
  parameter pinned by a wall would be a false precision (the sum of squares
  isn't locally quadratic in it).
- **Standard errors** come from J'J restricted to the parameters still
  estimated; **df = n − (number estimated)**, so a fit with Bottom held has
  df = n − 3. EC50's CI uses LogEC50's SE as before.
- **No Bottom/Top swap when constrained.** Unconstrained, the fit
  normalises to Bottom < Top (note 32). With any constraint that would
  change what "Bottom" means, so both orders are searched instead and the
  constrained parameter stays the one the user named.
- **Minimum data** generalises the 5 points / 4 doses rule: with k
  parameters estimated, at least k + 1 points ("few") and k distinct doses
  ("few-x"). Two plateaus held means 3 points, not 5.
- A held plateau can turn a `no-fit` (no top to estimate) into a fit.

## Refused up front (`constraints.ts`)

A fixed value must be finite; a fixed HillSlope of 0 (a flat line, EC50
meaningless); a bounded parameter needs at least one finite limit with
lower < upper (equal limits are a fixed value, say so). The Analyze
dialog shows the problem and disables Run.

## UI

Analyze dialog: per parameter a three-way select ("Estimate it" / "Hold it
at a constant" / "Estimate within limits") with number fields. Results
show "(fixed)" / "(at limit)" next to the value and "—" for SE and CI; the
methods paragraph and margin note say which parameters were constrained.

## Validation

Oracle (`oracle.R`), independent of `analysis.R`: a projected
Levenberg–Marquardt with a grid start, an active-set refit, and Gauss-Newton
polish. `check` runs **drc** with the same constraints (`fixed =` for
constants, `lowerl`/`upperl` for limits, b = −HillSlope·ln 10), requires it
to polish to the same optimum, checks the Kuhn–Tucker condition at every
bound the fit sits on (moving inward can only raise the sum of squares) and
drc's `df.residual` when nothing is at a bound. Cases: Bottom = 0;
Bottom = 0 and Top = 100; HillSlope = 1; falling with HillSlope = −1; one
plateau with Top held; limits that don't bind; an active Bottom limit; two
active limits; three held; concentrations with Bottom held; the half curve
made fittable by holding both plateaus; and the two refusals.

A lesson from writing the cases: `Top ≤ 90` with only `HillSlope ≤ 0.9`
looks binding but is not, because a negative slope with swapped plateaus
is the same curve; the case uses `0.1 ≤ HillSlope ≤ 0.9`.

## Differences from Prism

- Prism's "constrain" also allows shared and dataset-specific constraints
  and constraints as equations of other parameters; not here (#97).
- Prism reports a parameter at a limit as a plain value; we mark it and give
  no SE, because Prism's own SE there is unreliable.
- CIs stay asymptotic (#99).
