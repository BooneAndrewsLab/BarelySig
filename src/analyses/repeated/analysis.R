# Repeated-measures one-way ANOVA with the Geisser-Greenhouse correction
# (item 17, #50), reported as Prism does: a Column table paired by row,
# n subjects x k treatments, every cell filled. Comparisons are the
# equal-SD family only (bs_comparisons, loaded with this file, from
# oneway/analysis.R) against the ANOVA's own residual MS and df -- FAQ
# 1609's "traditional method" (#83 is the sphericity-free one).
# Geisser-Greenhouse and Huynh-Feldt epsilon come from base R's own
# `stats:::sphericity()` (the same helper `anova.mlm` calls internally
# for `test = "Spherical"`), the one correct implementation, used
# directly rather than re-derived -- as the app already does for
# `ptukey`/`qtukey` in the comparisons this file shares. Huynh-Feldt can
# exceed 1 (R returns it uncapped); Prism's guide says epsilon is never
# above 1.0, so both are capped for display and for the correction, as
# R's own corrected P already does internally. `stop("bs: ...")`
# messages are shown to the user as written.

# y: subject-major, length n*k (row i's k values before row i+1's).
bs_repeated <- function(y, n, k, comps, control, test) {
  if (k < 2) stop("bs: Repeated-measures ANOVA compares two or more matched groups.")
  if (n < 2) stop("bs: Repeated-measures ANOVA needs at least two complete rows.")
  Y <- matrix(y, nrow = n, ncol = k, byrow = TRUE)
  grand <- mean(Y)
  col_means <- unname(colMeans(Y))
  row_means <- rowMeans(Y)

  ss_total <- sum((Y - grand)^2)
  ss_treatment <- n * sum((col_means - grand)^2)
  ss_subjects <- k * sum((row_means - grand)^2)
  ss_residual <- ss_total - ss_treatment - ss_subjects
  if (ss_residual <= 0) {
    stop("bs: Every subject's values move together perfectly, so there is no residual scatter left to compare the treatment effect with; ANOVA can't be computed.")
  }
  df_treatment <- k - 1
  df_subjects <- n - 1
  df_residual <- df_treatment * df_subjects
  ms_treatment <- ss_treatment / df_treatment
  ms_subjects <- ss_subjects / df_subjects
  ms_residual <- ss_residual / df_residual
  f <- ms_treatment / ms_residual
  p <- pf(f, df_treatment, df_residual, lower.tail = FALSE)

  sph <- stats:::sphericity(stats::SSD(lm(Y ~ 1)), X = ~1)
  # Epsilon is never outside [1 / (k - 1), 1] (the Statistics Guide); Huynh-
  # Feldt's raw value can fall outside that range with very few subjects
  # relative to treatments (n <= k), where it isn't reliably estimated.
  clamp <- function(e) max(1 / (k - 1), min(1, e))
  gg <- clamp(sph$GG.eps)
  hf <- clamp(sph$HF.eps)

  list(
    k = k, n = n,
    ss_treatment = ss_treatment, ss_subjects = ss_subjects,
    ss_residual = ss_residual, ss_total = ss_total,
    df_treatment = df_treatment, df_subjects = df_subjects,
    df_residual = df_residual, df_total = n * k - 1,
    ms_treatment = ms_treatment, ms_subjects = ms_subjects, ms_residual = ms_residual,
    f = f, p = p,
    gg_epsilon = gg, hf_epsilon = hf,
    gg_p = pf(f, df_treatment * gg, df_residual * gg, lower.tail = FALSE),
    hf_p = pf(f, df_treatment * hf, df_residual * hf, lower.tail = FALSE),
    r_squared_treatment = ss_treatment / (ss_treatment + ss_residual),
    r_squared_subjects = ss_subjects / ss_total,
    groups = lapply(seq_len(k), function(j) list(mean = col_means[j])),
    comparisons = bs_comparisons(
      col_means, rep(0, k), rep(n, k), ms_residual, df_residual, FALSE, comps, control, test
    )
  )
}
