# Repeated-measures two-way ANOVA, one factor repeated (item 22, #81): a
# Grouped table, subject = subcolumn position, matched across the
# repeated factor's levels (`q` of them); the other factor ("between",
# `p` levels) is between-subjects. Two independent pieces (design note
# 22): a between-subjects part from each subject's own mean across the
# repeated levels (an ordinary one-way ANOVA of those means, scaled by
# q), and a within-subjects part from each subject's own deviation from
# that mean, pooled over every subject regardless of between-level.
# Greenhouse-Geisser/Huynh-Feldt epsilon (shared by the repeated main
# effect and the interaction, both within-subject terms) comes from base
# R's own `stats:::sphericity()`, exactly as `repeated/analysis.R`
# already uses it for the one-way case. Comparisons (item 24, #85) are
# the equal-SD family (`bs_comparisons`, loaded with this file from
# oneway/analysis.R), one of three families each against its own error
# term: `main-between` (MS(subjects) / q, the between-subjects stratum
# scaled back down since a subject's own mean is itself a mean of q
# values), `main-repeated` (MS(residual), pooled -- the "traditional"
# method, #83's own precedent), or `simple` (the between factor's levels
# within one repeated level at a time -- the classical split-plot
# "quasi-F" combined error, MS' = (MS(subjects) + (q - 1) MS(residual)) /
# q with Satterthwaite df; see design note 24 for why this is hand-
# derived rather than reaching for emmeans, which is biased for this
# design's own marginal families whenever between-level sizes are
# unequal). `stop("bs: ...")` messages are shown to the user as written.

# Comparisons after repeated-measures two-way ANOVA (item 24, #85): see
# the file header for the three families and their error terms. `Y` is
# the subject x repeated-level matrix, `level` each subject's
# between-level (1..p), `n_a` the between-level sizes.
bs_repeated_twoway_comparisons <- function(Y, level, n_a, p, q, ms_subjects, df_subjects,
                                           ms_residual, df_residual, family, comps, control, test) {
  if (comps == "none") return(list())
  fam <- function(means, sizes, mse, df, lvl) {
    list(
      level = lvl,
      pairs = bs_comparisons(means, rep(0, length(means)), sizes, mse, df, FALSE, comps, control, test)
    )
  }
  m <- rowMeans(Y)
  switch(family,
    "main-between" = list(fam(unname(tapply(m, level, mean)), n_a, ms_subjects / q, df_subjects, NA_integer_)),
    "main-repeated" = list(fam(unname(colMeans(Y)), rep(nrow(Y), q), ms_residual, df_residual, NA_integer_)),
    "simple" = {
      mse <- (ms_subjects + (q - 1) * ms_residual) / q
      dfp <- mse^2 / ((ms_subjects / q)^2 / df_subjects + ((q - 1) * ms_residual / q)^2 / df_residual)
      lapply(seq_len(q), function(b) fam(unname(tapply(Y[, b], level, mean)), n_a, mse, dfp, b))
    },
    stop("bs: Unknown family of comparisons.")
  )
}

# y: subject-major, length n*q (subject i's q values before subject i+1's).
# level: each subject's between-level, 1..p.
bs_repeated_twoway <- function(y, level, n, p, q, family = "main-between", comps = "none",
                                control = 1, test = "tukey") {
  if (p < 2 || q < 2) {
    stop("bs: Repeated-measures two-way ANOVA needs at least two levels of each factor.")
  }
  if (n < p + 1) {
    stop("bs: Repeated-measures two-way ANOVA needs more subjects than between-subject levels.")
  }
  level <- as.integer(level)
  n_a <- tabulate(level, p)
  if (any(n_a == 0)) stop("bs: Every level of the between-subjects factor needs at least one subject.")

  Y <- matrix(y, nrow = n, ncol = q, byrow = TRUE)
  grand <- mean(Y)

  # --- Between-subjects part: an ordinary one-way ANOVA of subject means ---
  m <- rowMeans(Y)
  level_mean <- unname(unclass(ave(m, level)))
  group_mean <- unname(unclass(tapply(m, level, mean)))
  ss_between <- q * sum(n_a * (group_mean - mean(m))^2)
  ss_subjects <- q * sum((m - level_mean)^2)
  df_between <- p - 1
  df_subjects <- n - p
  if (ss_subjects <= 0) {
    stop("bs: Every subject's mean is identical within its group, so there is no residual scatter left to test the between-subjects factor with; ANOVA can't be computed.")
  }
  ms_between <- ss_between / df_between
  ms_subjects <- ss_subjects / df_subjects
  f_between <- ms_between / ms_subjects
  p_between <- pf(f_between, df_between, df_subjects, lower.tail = FALSE)

  # --- Within-subjects part: each subject's deviation from its own mean ---
  d <- Y - m
  col_mean_d <- unname(colMeans(d))
  cell_mean_d <- unname(t(sapply(seq_len(p), function(a) colMeans(d[level == a, , drop = FALSE]))))
  ss_repeated <- n * sum(col_mean_d^2)
  ss_interaction <- sum(vapply(seq_len(p), function(a) n_a[a] * sum((cell_mean_d[a, ] - col_mean_d)^2), numeric(1)))
  df_repeated <- q - 1
  df_interaction <- (p - 1) * (q - 1)
  ss_within_total <- sum(d^2)
  ss_residual <- ss_within_total - ss_repeated - ss_interaction
  df_residual <- (n - p) * (q - 1)
  if (ss_residual <= 0) {
    stop("bs: Every subject's values move together perfectly, so there is no residual scatter left to compare the repeated factor and interaction with; ANOVA can't be computed.")
  }
  ms_repeated <- ss_repeated / df_repeated
  ms_interaction <- ss_interaction / df_interaction
  ms_residual <- ss_residual / df_residual
  f_repeated <- ms_repeated / ms_residual
  f_interaction <- ms_interaction / ms_residual
  p_repeated <- pf(f_repeated, df_repeated, df_residual, lower.tail = FALSE)
  p_interaction <- pf(f_interaction, df_interaction, df_residual, lower.tail = FALSE)

  sph <- stats:::sphericity(stats::SSD(lm(Y ~ factor(level))), X = ~1)
  # HF.eps is 0/0 (NaN) when q = 2 and the residual stratum's df is 1
  # (pp = q - 1 = 1 makes both the numerator and denominator vanish);
  # epsilon is analytically exactly 1 whenever q = 2 regardless (Prism's
  # own guide says so), so that is the fallback rather than propagating NaN.
  clamp <- function(e) if (is.nan(e)) 1 else max(1 / (q - 1), min(1, e))
  gg <- clamp(sph$GG.eps)
  hf <- clamp(sph$HF.eps)

  list(
    p = p, q = q, n = n,
    between = list(ss = ss_between, df = df_between, ms = ms_between, f = f_between, p = p_between),
    subjects = list(ss = ss_subjects, df = df_subjects, ms = ms_subjects),
    repeated = list(ss = ss_repeated, df = df_repeated, ms = ms_repeated, f = f_repeated, p = p_repeated),
    interaction = list(ss = ss_interaction, df = df_interaction, ms = ms_interaction, f = f_interaction, p = p_interaction),
    residual = list(ss = ss_residual, df = df_residual, ms = ms_residual),
    total = list(ss = sum((Y - grand)^2), df = n * q - 1),
    gg_epsilon = gg, hf_epsilon = hf,
    repeated_gg_p = pf(f_repeated, df_repeated * gg, df_residual * gg, lower.tail = FALSE),
    repeated_hf_p = pf(f_repeated, df_repeated * hf, df_residual * hf, lower.tail = FALSE),
    interaction_gg_p = pf(f_interaction, df_interaction * gg, df_residual * gg, lower.tail = FALSE),
    interaction_hf_p = pf(f_interaction, df_interaction * hf, df_residual * hf, lower.tail = FALSE),
    families = bs_repeated_twoway_comparisons(
      Y, level, n_a, p, q, ms_subjects, df_subjects, ms_residual, df_residual,
      family, comps, control, test
    )
  )
}
