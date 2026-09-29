# 40 — Nonlinear regression: weighting and interpolating unknowns

Issue #100, on top of notes 32 (the four-parameter fit), 35 (constraints), 37
(models), 38 (global fit) and 39 (comparisons). Two things Prism users do
with a standard curve: fit it with **weights**, and **read unknown samples off
it**.

## Weighting

Weighted least squares: minimise Σ wᵢ (yᵢ − f(xᵢ))². With sw = √w, the
Jacobian and residuals are scaled by sw, A = J′WJ, s² = weighted SS / df, and
SEs, CIs, dependency and the confidence band (half-width t·√(g′A⁻¹g·s²))
follow. R² = 1 − SSw / Σ w (y − ȳw)², with ȳw the weighted mean. The runs
test uses the unweighted residual signs (Prism's residuals plot is
unweighted too).

Options (`weighting`, Prism's list minus what has no meaning here):

| id | weights | how |
|----|---------|-----|
| `none` | 1 | default |
| `y`, `y2` | 1/Ŷ, 1/Ŷ² | from the fitted curve, iteratively reweighted (Prism's "1/Y", "1/Y²" use the predicted Y) |
| `x`, `x2` | 1/X, 1/X² | the X as typed; concentration X only (a log X can be ≤ 0) |
| `sd2` | 1/SD² | per X row; fits the row means |

Not offered: 1/Y (observed), Prism's "1/Y^K" for other K and "Poisson"
(unknown to us, no use case yet), and the "Relative weighting"/robust
options (robust regression is a separate issue).

**Y weights.** The weights depend on the parameters, so the objective is
solved as a fixed point: fit unweighted, set w = f(x)^−k, refit (polish, from
the last parameters), repeat until the relative change of the parameters is
< 1e-12 (at most 200 rounds). The reported SS, df, SEs use the final weights.
If the curve is ≤ 0 (or not finite) at any measured X, 1/Y is undefined and
the fit is refused with `why = 'weights'`, in words: hold Bottom above
zero or choose another weighting.

**Static weights** (X, SD) are computed in TypeScript (`weighting.ts`) from
the table and travel with the points, so the engine only receives a vector.
A dose that is left out of a log fit (≤ 0) has weight 1 and is dropped as
before. `sd2` needs ≥ 2 replicates at every X, and SD > 0 (an SD of zero
gives an infinite weight); both are refused with the row named. For a
summary-format table the SD column is used as typed, with n unused.

**Weighted SD semantics.** Prism's guide says that fitting means weighted
by 1/SD² and fitting replicates weighted by 1/SD² give the same answer only
in the equal-n case; we fit the means (one point per X row) and say so. The
sums of squares differ in scale from the replicate fit, which the results
state ("Weighted").

**Consistency across analyses.** Single fit, each data set of a global fit
(weights stay per point; Y weights come from that point's own data set's
curve, in the stacked fit), and comparisons with a *static* weighting all
work: both fits of a comparison see the same weights, so the F test and AICc
are comparable. Y weights *with* a comparison are **refused** (weights
would differ between the two fits, making SS(simple) − SS(complex) not
an extra-sum-of-squares); the Analyze dialog says so and disables the button.
Prism computes the comparison anyway; a follow-up issue covers doing it the
way Prism does (weights from the more complex fit). The comparison's
fewer-parameter fit for the model/sharing alternatives uses the same `w`.

The prediction band adds s²/w_new, where a new point is assumed to weigh what
the nearest measured X does (Prism does not document its choice).

## Interpolating unknowns

`interpolate: boolean`. Rows of the XY table with a Y value and a **blank X**
are the unknowns (same table, so nothing new to point at; `xyUnknowns`). Raw
replicate columns give each replicate separately; a summary table gives its
mean. A blank Y is skipped (null, never 0). The standards are the rows with an
X, as before.

For an unknown Y₀ and the fitted curve, with f = (Y₀ − Bottom)/(Top − Bottom):

- f ≤ 0 → `beyond-bottom`, f ≥ 1 → `beyond-top`: no X exists on the curve;
  the result carries the status and no numbers (never NaN);
- a flat curve (HillSlope 0 or Top = Bottom) → `undefined`;
- otherwise X = LogEC50 − log10((1−f)/f)/HillSlope, back on the table's scale
  (10^ for concentrations).

**CI:** where the curve's 95% confidence bands cross Y₀ — the definition in
Prism's interpolation guide. For a rising curve the lower limit is where the
upper band equals Y₀ (left of X) and the upper limit where the lower band
does (right of X); a falling curve swaps them. Found by scanning outward
from X (400 steps over 5× the data range) for the first sign change and
refining with `uniroot`. If the band never reaches Y₀ that end is `null`
(shown as "no upper limit"). The band is the one the fit already draws
(weighted, constrained and global fits included; a global fit uses the band
of that data set's own curve).

Differences from Prism: the band is for the *mean* curve, so the CI ignores
scatter in the unknown's own replicates (Prism does the same and says so;
its "SE of interpolated X" is not reported here); an unknown outside the
plateaus is reported as such, where Prism prints an empty cell.

## Validation

`oracle.R`: `ref_optimum` takes `w`; `run_fpl_one`/`run_global` are weighted,
do the Y-weight fixed point, and interpolate (`ref_interpolate`, root finding
on the curve itself). Cross-checks: `drc::drm(weights =)` (given the final
weights for 1/Y, 1/Y², the fixed point) for the optimum; `nls(weights =)` and
`anova` for the comparison; `drm(curveid=)` for the global fit; and for the
CI, drc's own `predict(interval = "confidence")` must reach Y₀ at each end,
and the curve must read Y₀ at X. Cases: 1/Y and 1/Y² (rising, falling, with a
held Bottom, global with missing values and unequal n), 1/X, 1/X²
(concentration, zero dose), 1/SD² (means, n = 7), a static-weight comparison
(single and global), unknowns inside, near a plateau (open-ended CI) and
outside. Zero-variance and single-replicate 1/SD² are unit tests of
`prepare`.

## Follow-ups

- Y weights with a comparison, the Prism way.
- Mark interpolated unknowns on the graph.
