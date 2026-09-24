# t tests (item 04, #17), reported as Prism does. Group A is the first
# data set, B the second; differences are B - A (Prism's convention).
# `stop("bs: ...")` messages are shown to the user as written.

bs_f_test <- function(va, na, vb, nb) {
  # Prism puts the larger variance on top; the P value is two-tailed.
  if (!is.finite(va) || !is.finite(vb) || min(va, vb) == 0) {
    return(list(f = NA_real_, f_dfn = NA_real_, f_dfd = NA_real_, f_p = NA_real_))
  }
  if (va >= vb) { f <- va / vb; dfn <- na - 1; dfd <- nb - 1 } else { f <- vb / va; dfn <- nb - 1; dfd <- na - 1 }
  list(f = f, f_dfn = dfn, f_dfd = dfd, f_p = min(1, 2 * pf(f, dfn, dfd, lower.tail = FALSE)))
}

bs_ttest_unpaired <- function(a, b, welch) {
  if (length(a) < 2 || length(b) < 2) {
    stop("bs: Each group needs at least two values for a t test.")
  }
  va <- var(a)
  vb <- var(b)
  if (va == 0 && vb == 0) {
    stop("bs: Every value within each group is the same, so there is no variation to compare the difference with; a t test can't be computed.")
  }
  r <- t.test(b, a, var.equal = !welch)
  t <- unname(r$statistic)
  df <- unname(r$parameter)
  c(list(
    t = t, df = df, p_two = r$p.value,
    n_a = length(a), n_b = length(b), mean_a = mean(a), mean_b = mean(b), sd_a = sqrt(va), sd_b = sqrt(vb),
    difference = mean(b) - mean(a), se_difference = r$stderr,
    ci_lower = r$conf.int[1], ci_upper = r$conf.int[2],
    r_squared = t^2 / (t^2 + df)
  ), bs_f_test(va, length(a), vb, length(b)))
}

bs_ttest_summary <- function(mean_a, sd_a, n_a, mean_b, sd_b, n_b, welch) {
  if (any(is.na(c(mean_a, sd_a, n_a, mean_b, sd_b, n_b)))) {
    stop("bs: A t test from summary data needs the mean, SD and n of both groups.")
  }
  if (n_a < 2 || n_b < 2) stop("bs: Each group needs n of at least 2 for a t test.")
  if (n_a != round(n_a) || n_b != round(n_b)) stop("bs: n must be a whole number.")
  if (sd_a < 0 || sd_b < 0) stop("bs: An SD can't be negative.")
  if (sd_a == 0 && sd_b == 0) {
    stop("bs: Both SDs are 0, so there is no variation to compare the difference with; a t test can't be computed.")
  }
  va <- sd_a^2
  vb <- sd_b^2
  if (welch) {
    se <- sqrt(va / n_a + vb / n_b)
    df <- (va / n_a + vb / n_b)^2 / ((va / n_a)^2 / (n_a - 1) + (vb / n_b)^2 / (n_b - 1))
  } else {
    pooled <- ((n_a - 1) * va + (n_b - 1) * vb) / (n_a + n_b - 2)
    se <- sqrt(pooled * (1 / n_a + 1 / n_b))
    df <- n_a + n_b - 2
  }
  d <- mean_b - mean_a
  t <- d / se
  half <- qt(0.975, df) * se
  c(list(
    t = t, df = df, p_two = 2 * pt(-abs(t), df),
    n_a = n_a, n_b = n_b, mean_a = mean_a, mean_b = mean_b, sd_a = sd_a, sd_b = sd_b,
    difference = d, se_difference = se, ci_lower = d - half, ci_upper = d + half,
    r_squared = t^2 / (t^2 + df)
  ), bs_f_test(va, n_a, vb, n_b))
}

bs_ttest_paired <- function(a, b) {
  n <- length(a)
  if (n < 2) stop("bs: A paired t test needs at least two complete pairs (rows with a value in both groups).")
  d <- b - a
  if (sd(d) == 0) {
    stop("bs: Every pair differs by exactly the same amount, so there is no variation to compare it with; a paired t test can't be computed.")
  }
  r <- t.test(b, a, paired = TRUE)
  t <- unname(r$statistic)
  df <- unname(r$parameter)
  # Prism's "was the pairing effective?": Pearson r, one-tailed P for r > 0.
  pairing <- if (n > 2 && sd(a) > 0 && sd(b) > 0) {
    ct <- cor.test(a, b, alternative = "greater")
    list(pairing_r = unname(ct$estimate), pairing_p = ct$p.value)
  } else {
    list(pairing_r = NA_real_, pairing_p = NA_real_)
  }
  c(list(
    t = t, df = df, p_two = r$p.value, n_pairs = n,
    mean_a = mean(a), mean_b = mean(b),
    difference = mean(d), sd_difference = sd(d), se_difference = r$stderr,
    ci_lower = r$conf.int[1], ci_upper = r$conf.int[2],
    r_squared = t^2 / (t^2 + df)
  ), pairing)
}
