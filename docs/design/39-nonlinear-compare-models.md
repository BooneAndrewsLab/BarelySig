# 39 — Nonlinear regression: comparing models and shared vs. separate parameters

Issue #105, the follow-up to notes 36 (compare with a simpler model), 37 (the
dose-response models) and 38 (sharing parameters across data sets). Prism's
Compare tab asks three questions; note 36 built the first ("is the extra
flexibility of my curve worth it?", by holding parameters at values). This
note adds the other two, reusing the F test / AICc code and the results grid:

1. **Two different curve shapes** ("variable vs. standard slope", "normalized
   vs. not", "rising vs. falling standard slope"): the fit against the same
   data fitted with another of the eight models of note 37.
2. **Shared vs. separate parameters** ("is the EC50 different between these
   data sets?"): the global fit as configured (note 38) against the same fit
   with the chosen shared parameters unshared.
3. **Alpha** is adjustable (it was fixed at 0.05).

## Options

`compareWith: ComparisonWith | null` on the dose-response analysis, next to
`compare` (note 36; at most one of the two, refused in words otherwise):

- `{ kind: 'model', model }`: fit the data again with this model, and the
  same limits / holds / sharing the analysis has (a model's own holds, e.g. a
  standard slope's HillSlope = 1, replace what the user chose for that
  parameter, as in note 37).
- `{ kind: 'sharing', test: SharedParameters }`: the flags say which of the
  parameters that are shared in this fit to ask about. The other fit is this
  one with just those unshared (one value per data set). Needs two or more
  data sets and every tested parameter ticked as shared (and not held).

`compareAlpha: number` (0 < alpha < 1, default 0.05): only the cut-off for
"the F test prefers ..."; P, F, AICc do not depend on it.

`.bsig`: the fields written explicitly in fixed order; absent (older files) =
`compareWith` null and alpha 0.05, so no schema bump. Module version 5 → 6.

## Nesting (decided in `constraints.ts`, not by the optimiser)

Each parameter of a fit is in one of three states: **held** at a value (by the
model or the user), **shared** (one value for all data sets) or **separate**
(free, or within limits; LogEC50 is never held). Model A is *nested in* model
B (a special case of it) when, parameter by parameter, A's state is no more
flexible than B's (held < shared < separate) and, where two states are equal,
the details are equal too (the same value if held, the same limits if
limited); a held value must lie within the limits of a limited parameter it
is compared with. Then:

- A nested in B, not equal: the F test is valid. The nested one is the
  *simpler* model (null hypothesis), the other the more complex one.
- Equal: nothing to compare ("these estimate the same things and give the
  same curve"), refused. (Agonist and inhibitor variable-slope are this case.)
- Neither nested in the other (e.g. standard slope +1 vs. −1: rising vs.
  falling curve of fixed slope): the F test is **not** valid and is not run
  ("not available: the models are not nested"). AICc is: it needs no nesting,
  only the same data and the same Y (Prism says the same).

Sharing comparisons are nested by construction (shared inside separate).

## The statistics

Exactly note 36's, on any two fits with sums of squares SS and degrees of
freedom df (df = points − parameters estimated, counting a shared parameter
once):

- F = ((SS_simpler − SS_complex) / (df_simpler − df_complex)) / (SS_complex /
  df_complex); P the upper tail of F(df_simpler − df_complex, df_complex).
  For sharing: the numerator df is (data sets − 1) per tested parameter.
- AICc = n ln(SS/n) + 2K + 2K(K+1)/(n − K − 1), K = parameters + 1; the
  Akaike weights give the chance each is the better model. Same n is
  required and holds: both fits use the same points.
- The "worse" guard applies to nested pairs (the simpler cannot fit better).
- **Level.** With independent fits (no sharing in either model) there is one
  comparison per data set, the column layout of note 36. If either model
  shares anything, the comparison is of the two stacked fits, using their
  whole-fit SS and df (`global` of note 38): one comparison, in one "Whole fit"
  column, held in `result.comparison`.

## Wording

- The null hypothesis is stated: the simpler model is correct (for sharing:
  "the parameter has one value for all the data sets"). P < alpha: "the data
  fit significantly better with X than with Y"; P ≥ alpha: "no evidence that
  ...; that does not prove they are the same, only that these data can't tell
  them apart". Never "the same".
- Which model each criterion prefers is named, with alpha. The F test names
  its prerequisite (nested models); a non-nested pair says why there is no P.
- A sharing comparison says it is a test of the tested parameter *given*
  everything else in the fit (the other parameters keep their shared/separate
  status), and that it uses all the data sets together, not pairs of them.

## Differences from Prism

- Prism lets you pick shared/unshared per parameter (and among some data
  sets); here a parameter is shared by all chosen data sets or none (note 38)
  and the test unshares it for all.
- Prism's alpha field is alpha; the same here. Prism's default is 0.05.
- Comparing models needs both to be in this family of eight (which is what
  the analysis fits). Prism can compare unrelated equations.
- Limits together with sharing remain unsupported (#109); the comparison with
  a simpler model by holding values (note 36) still cannot be combined with
  sharing (#109); the new comparisons can.

## Validation

`oracle.R` gains a "Comparing models (#105)" section. References are the
textbook formulas on top of the existing independent references
(`run_fpl`, `run_global`), with the two fits run separately; `check`
recomputes F, P and AICc from R's own `nls` / `anova` / `AIC` on refits from
the reported optima (independent of the reference LM), and for the sharing
comparison from `drc::drm(curveid, pmodels)` sums of squares. Cases: variable
vs. standard slope (rejected; accepted), normalized vs. not, the configured
model the simpler one, a non-nested pair (AICc only), missing values and
unequal n, five points, concentrations, EC50 shared vs. separate for
different and for equal curves, two parameters tested at once, three data
sets, and a small set.
