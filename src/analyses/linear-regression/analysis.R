# Simple linear regression of an XY table's Y data sets against its
# shared X (item 29, #38): slope, intercept with CIs, R^2, residuals and
# a runs test for lack of fit. Base R only (`lm`); the runs test itself
# is a textbook asymptotic formula (Wald-Wolfowitz), not something base R
# ships as a function -- see oracle.R for why this is safe to hand-write
# once here and independently verify against the R package `randtests`.

# Wald-Wolfowitz runs test on a sequence of already-ordered signs (+1/-1),
# zeros (exact ties with the fit) already dropped by the caller.
bs_runs_test <- function(s) {
  n1 <- sum(s > 0)
  n2 <- sum(s < 0)
  n <- n1 + n2
  if (n < 2) return(list(ran = FALSE, why = "few", n_pos = n1, n_neg = n2))
  if (n1 == 0 || n2 == 0) return(list(ran = FALSE, why = "same", n_pos = n1, n_neg = n2))
  runs <- 1 + sum(diff(s) != 0)
  mu <- 1 + 2 * n1 * n2 / n
  variance <- 2 * n1 * n2 * (2 * n1 * n2 - n) / (n^2 * (n - 1))
  z <- (runs - mu) / sqrt(variance)
  list(ran = TRUE, n_runs = runs, n_pos = n1, n_neg = n2, z = unname(z), p = 2 * pnorm(-abs(z)))
}

bs_linreg_one <- function(x, y) {
  n <- length(x)
  if (n < 3) return(list(n = n, ran = FALSE, why = "few", minimum = 3))
  if (max(x) == min(x)) return(list(n = n, ran = FALSE, why = "constant_x"))
  # An exactly constant y makes summary.lm()'s R^2/F/P floating-point noise
  # (its sums of squares are both ~0, so their ratio isn't meaningfully 0 or
  # 1) rather than the "no line explains anything" answer that's actually
  # true here -- reported in words instead of a number that looks precise
  # but isn't (CLAUDE.md: a statistic whose true value is 0 can't be read
  # off noise).
  if (max(y) == min(y)) return(list(n = n, ran = FALSE, why = "constant_y"))
  m <- lm(y ~ x)
  s <- summary(m)
  ci <- confint(m)
  f <- s$fstatistic
  ord <- order(x)
  resid_ord <- unname(resid(m))[ord]
  runs <- bs_runs_test(sign(resid_ord)[sign(resid_ord) != 0])
  list(
    n = n,
    ran = TRUE,
    intercept = unname(coef(m)[1]),
    slope = unname(coef(m)[2]),
    intercept_lower = unname(ci[1, 1]),
    intercept_upper = unname(ci[1, 2]),
    slope_lower = unname(ci[2, 1]),
    slope_upper = unname(ci[2, 2]),
    r2 = s$r.squared,
    f = unname(f[1]),
    df_num = unname(f[2]),
    df_den = unname(f[3]),
    p = unname(s$coefficients[2, 4]),
    x = x[ord],
    y = y[ord],
    fitted = unname(fitted(m))[ord],
    residual = resid_ord,
    runs = runs
  )
}

# x, y: every series' points, concatenated; g: each point's series (1..k).
bs_linear_regression <- function(x, y, g, k) {
  list(series = lapply(seq_len(k), function(i) bs_linreg_one(x[g == i], y[g == i])))
}
