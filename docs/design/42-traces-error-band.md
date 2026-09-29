# 42. Replicate traces: a mean ± error band

Written 2026-09-29 for #104, following note 34's `traces` style.

## What was asked

The `traces` style draws every replicate and the mean line but no spread
around the mean. Add a band of mean ± SD, SEM or 95% CI, chosen by the user
and stated on the graph, and decide how it sits with a fitted line's band.

## Decisions

- `XyPlot.error: 'none' | 'sd' | 'sem' | 'ci95'`, default `none`. Old files
  open as `none`; the serialiser writes it always, after `band`. It applies
  to the `traces` style only (the field is kept but ignored otherwise, like
  `band` without a fit); the format panel shows the choice only for `traces`.
- Values come from the same pooled Y values `meanByX` averages at each
  distinct X: n = how many Y values sit at that X (null = missing, never 0).
  SD is the sample SD (n − 1), SEM = SD / √n, 95% CI = mean ± t(0.975, n − 1)
  × SEM. The t quantile is our own (`src/model/tdist.ts`, regularised
  incomplete beta plus bisection), tested against R's `qt` to 1e-6. No R
  round trip: the graph must stay synchronous and cacheable.
- Summary-data tables (mean/SD/n entered): each row is one point, with the
  entered mean, SD and n (SEM converted, as the rest of the app does). Rows
  with the same X are not pooled, so such a table gets no band (noted).
  A table entered as mean/lower/upper has no SD or n, so no band.
- **n = 1 has no spread.** An X with a single value contributes no band; the
  graph says how many X values were skipped. A run of two or more adjacent
  X values with n ≥ 2 is a filled band; an isolated X with n ≥ 2 (its
  neighbours skipped) is drawn as a short vertical bar, so it is not lost.
  A gap in the band is never bridged.
- **Stated on the graph:** a note under the graph, e.g. "Shaded band around
  the mean: ± SD of the replicates at each X (X values with a single value
  have no band)". XY graphs have no legend, so the note is the statement,
  as for the fit band; it is in the export because notes are.
- **With a fitted line's band:** the two are different things, so they look
  different. The error band is the data set's colour at half the theme's
  band opacity, under everything; the fit band is drawn over it at the full
  opacity, then the traces, mean line, fit line and points. When both are on,
  the notes name each ("Lighter band: … ; darker band: 95% confidence band of
  the fitted line"). Axis auto-range includes the error band.
- The error band is not a click target (it would sit under the fit band and
  the mean line); its opacity follows `bandOpacity`, so it is themable.

## Prism parity

Prism draws the same shaded mean ± SD/SEM/CI area for a connected line.
Prism's CI uses the t distribution with n − 1 df, as here.
