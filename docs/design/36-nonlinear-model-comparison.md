# 36 — Nonlinear regression: comparing with a simpler model

Issue #98, the follow-up to notes 32 and 35. Prism's Compare tab asks "is
the more complicated model justified?" with the extra sum-of-squares F test
and AICc. The issue names three kinds of pair: variable vs. standard slope
(needs #95), a shared vs. unshared parameter across data sets (needs #97),
and, once #96 has landed, a fit vs. the same fit with parameters held. Only
the last can be built now; this note covers it and leaves room for the rest.

## What was built

An option `compare: SimplerModel | null` on the dose-response analysis
(`src/model/project.ts`): the values at which the simpler model holds
Bottom, Top and/or HillSlope (null = still estimated). Each data set is fit
twice, the fit as configured (with its own constraints) and the simpler
model, which is that fit with the chosen parameters held.

**Nesting is enforced, not checked afterwards.** The simpler model can hold
only a parameter the fit itself estimates freely (`comparisonProblem` in
`constraints.ts`; the dialog disables the others). A held parameter has to
be free in the fit, so the simpler model is a special case and the F test's
null hypothesis is well defined. Refused as well: nothing held; a
non-finite value; HillSlope = 0; all three held (only EC50 left, which
isn't a curve worth comparing). `.bsig` option `compare` (absent = none, no
schema bump); module version 2 → 3.

## The statistics (`bs_fpl_compare` in `analysis.R`)

- **Extra sum-of-squares F**, Prism's formula:
  F = ((SS_simple − SS_fit) / (df_simple − df_fit)) / (SS_fit / df_fit),
  P = upper tail of F(df_simple − df_fit, df_fit) via `pf(lower.tail =
  FALSE)`. df are those of each fit, counting only parameters actually
  estimated, so a fit whose parameter ended at a limit (note 35) is
  compared with its real df. Not available when SS_fit = 0 (an exact fit)
  or when the simpler model has no more df than the fit.
- **AICc** = n ln(SS/n) + 2K + 2K(K+1)/(n − K − 1), K = parameters
  estimated + 1 (the variance counts, as in R's `AIC`). The constant
  n(ln 2π + 1) that R adds is the same for both models and dropped, so only
  differences are meaningful. Not available unless n > K + 1 for both.
  The probability a model is the better is the Akaike weight,
  1/(1 + exp(±ΔAICc/2)) (`plogis`, so extremes keep their magnitude).
- **Guard:** the simpler model's SS can't be below the fit's. If it is (by
  more than 1e-9 relative) one optimiser missed the optimum, and the
  comparison is reported as impossible ("worse") rather than as a negative F.

## Wording (correctness of the text)

The null hypothesis is stated in the results legend and margin note. A
P ≥ 0.05 reads "no evidence that estimating X improves the fit ... does not
prove the simpler curve is right", never "the same". The results say which
test (extra sum-of-squares F, alpha 0.05) and which criterion (AICc, K
counts the variance) were used, and the headline reading states both
verdicts; when the two disagree the reader sees both.

## Validation

`oracle.R` `run_fpl(..., alt =)` computes the comparison from the textbook
formulas on top of the existing independent reference fit. Each case's
`check` (`compare_agrees`) refits both models with base R `nls` from the
reported optima and requires R's own `anova(simpler, fit)` F, Pr(>F) and Df
and `AIC()` + 2K(K+1)/(n−K−1) differences to match. Cases: Bottom = 0
rejected (real data with Bottom ≈ 6); Bottom = 0 accepted, HillSlope = 1
and Bottom = 0 with Top = 100 on data simulated from such a curve; a fit
that already holds Bottom; concentration X; five points (F available, AICc
not). Not covered by a fixture: "worse" (needs a failed optimiser).

## Differences from Prism

- Prism's Compare tab lets you pick any two models, including different
  equations, and shared/unshared parameters; here only "the fit vs. the same
  fit with parameters held" (#95, #97 add the rest).
- Prism picks the "preferred" model with alpha = 0.05 by default and lets
  you change alpha; alpha is fixed at 0.05 here.
- AICc's K: we count the variance (R's convention). I believe Prism's
  guide does too, but could not check it offline; either way AICc
  differences among models here are consistent with R, which the oracle checks.
- Prism reports the sum of squares, df and AICc for each model; so do we.
