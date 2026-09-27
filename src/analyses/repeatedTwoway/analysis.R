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
# already uses it for the one-way case. No comparisons yet (a follow-up
# issue). `stop("bs: ...")` messages are shown to the user as written.

# y: subject-major, length n*q (subject i's q values before subject i+1's).
# level: each subject's between-level, 1..p.
bs_repeated_twoway <- function(y, level, n, p, q) {
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
    interaction_hf_p = pf(f_interaction, df_interaction * hf, df_residual * hf, lower.tail = FALSE)
  )
}
