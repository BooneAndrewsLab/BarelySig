# Growth curve analysis of an XY table's Y data sets (item 33, #94):
# Zwietering's reparameterized Gompertz growth model,
#   Y = A * exp(-exp((mumax * e / A) * (lambda - t) + 1)),
# fit to each series on its own with a hand-rolled Levenberg-Marquardt on
# the model's analytic Jacobian, from a heuristic start (mumax and lambda
# read directly off the data's steepest slope, exploiting the
# parameterization) plus a small multi-start. Not base R's nls(): at very
# small absolute scales (Y around 0.01-0.1, a plausible OD600 range) its
# numeric-derivative Gauss-Newton reported a singular gradient even
# started at the data's own true generating parameters, while the
# analytic Jacobian below has a perfectly ordinary condition number there
# (confirmed before writing this) -- LM's damping is what nls's plain
# Gauss-Newton lacks. No plinear trick here either: unlike note 32's
# model, none of the three parameters enter linearly. Standard errors,
# CIs and the two derived quantities (doubling time, the end of
# exponential phase) are asymptotic, by the delta method through the
# same Jacobian (note 33). Needs linear-regression's bs_runs_test, which
# the module prepends.

bs_gc_k <- function(t, p) (p[2] * exp(1) / p[1]) * (p[3] - t) + 1

bs_gc_curve <- function(t, p) p[1] * exp(-exp(bs_gc_k(t, p)))

# d Y / d (A, mumax, lambda), one row per t.
bs_gc_jacobian <- function(t, p) {
  k <- bs_gc_k(t, p)
  ek <- exp(k)
  base <- exp(-ek)
  d_a <- base * (1 + ek * p[2] * exp(1) * (p[3] - t) / p[1])
  d_mumax <- -base * ek * exp(1) * (p[3] - t)
  d_lambda <- -base * ek * p[2] * exp(1)
  cbind(d_a, d_mumax, d_lambda)
}

# mumax is the curve's own maximum slope by construction, and the tangent
# through that steepest pair of points gives lambda directly (note 33):
# a heuristic start informed by the data, not a blind guess.
bs_gc_start <- function(t, y) {
  ord <- order(t)
  tt <- t[ord]
  yy <- y[ord]
  d <- diff(yy) / diff(tt)
  d[!is.finite(d)] <- -Inf
  i <- which.max(d)
  mumax0 <- max(d[i], 1e-6)
  tstar <- (tt[i] + tt[i + 1]) / 2
  ystar <- (yy[i] + yy[i + 1]) / 2
  lambda0 <- max(min(tt), tstar - ystar / mumax0)
  c(a = max(yy) * 1.05, mumax = mumax0, lambda = lambda0)
}

# Levenberg-Marquardt from one start: damped Gauss-Newton on the analytic
# Jacobian, backing off (larger lambda, smaller step) whenever a step
# doesn't lower the sum of squares. Returns the converged parameters and
# their sum of squares, or NULL (singular Jacobian, or no improvement
# found before lambda saturates).
bs_gc_lm <- function(t, y, p) {
  rss <- function(p) sum((y - bs_gc_curve(t, p))^2)
  ss <- rss(p)
  lambda <- 1e-3
  for (it in 1:200) {
    J <- bs_gc_jacobian(t, p)
    Amat <- crossprod(J)
    step <- tryCatch(
      unname(drop(solve(Amat + lambda * diag(diag(Amat)), crossprod(J, y - bs_gc_curve(t, p))))),
      error = function(e) NULL
    )
    if (is.null(step) || any(!is.finite(step))) {
      lambda <- lambda * 10
      if (lambda > 1e12) return(NULL)
      next
    }
    ss_q <- rss(p + step)
    if (is.finite(ss_q) && ss_q <= ss) {
      converged <- max(abs(step) / pmax(abs(p), 1e-8)) < 1e-10
      p <- p + step
      ss <- ss_q
      lambda <- lambda / 10
      if (converged) break
    } else {
      lambda <- lambda * 10
      if (lambda > 1e12) return(NULL)
    }
  }
  if (!is.finite(ss) || any(!is.finite(p)) || p[1] <= 0) return(NULL)
  list(p = p, ss = ss)
}

# The least-squares fit from the heuristic start and a small multi-start
# around it, or NULL if none converged.
bs_gc_fit <- function(t, y) {
  base <- bs_gc_start(t, y)
  span <- max(t) - min(t)
  best <- NULL
  for (ms in c(1, 0.5, 2, 0.25, 4, 8)) {
    for (ls in c(0, -span / 4, span / 4)) {
      start <- c(
        a = unname(base["a"]), mumax = unname(base["mumax"] * ms),
        lambda = unname(max(min(t), base["lambda"] + ls))
      )
      fit <- bs_gc_lm(t, y, start)
      if (!is.null(fit) && (is.null(best) || fit$ss < best$ss)) best <- fit
    }
  }
  if (is.null(best)) return(NULL)
  best$p
}

# Full Gauss-Newton steps from the LM fit's answer, kept while they lower
# the sum of squares, the same construction and the same reason as note
# 32's polish: LM stops once a damped step no longer helps, which can
# still be short of the optimum in relative terms.
bs_gc_polish <- function(t, y, p) {
  ss <- sum((y - bs_gc_curve(t, p))^2)
  for (i in 1:20) {
    J <- bs_gc_jacobian(t, p)
    step <- tryCatch(qr.coef(qr(J), y - bs_gc_curve(t, p)), error = function(e) NULL)
    if (is.null(step) || any(!is.finite(step))) break
    q <- p + unname(step)
    ss_q <- sum((y - bs_gc_curve(t, q))^2)
    if (!(ss_q <= ss)) break
    p <- q
    ss <- ss_q
    if (max(abs(step) / pmax(abs(p), 1e-8)) < 1e-13) break
  }
  for (i in 1:3) {
    step <- tryCatch(qr.coef(qr(bs_gc_jacobian(t, p)), y - bs_gc_curve(t, p)), error = function(e) NULL)
    if (is.null(step) || any(!is.finite(step)) || max(abs(step) / pmax(abs(p), 1e-8)) > 1e-6) break
    p <- p + unname(step)
  }
  p
}

bs_gc_quantity <- function(value, se, t) {
  list(value = unname(value), se = unname(se), lower = unname(value - t * se), upper = unname(value + t * se))
}

bs_gc_one <- function(x, y) {
  n <- length(x)
  if (n < 4) return(list(n = n, ran = FALSE, why = "few", minimum = 4))
  if (length(unique(x)) < 3) return(list(n = n, ran = FALSE, why = "few_t", minimum = 3))
  if (max(y) == min(y)) return(list(n = n, ran = FALSE, why = "constant_y"))
  p <- bs_gc_fit(x, y)
  if (is.null(p)) return(list(n = n, ran = FALSE, why = "no_fit"))
  p <- bs_gc_polish(x, y, p)
  # The exponential phase's own width (A / mumax) far shorter than the
  # observed time span means the fit is a near-instantaneous step the
  # data can't resolve, not a growth phase -- the failure mode a
  # monotonically decreasing series (no growth to fit) runs into: the
  # least-squares optimum degenerates into "already at the asymptote
  # before the window starts", not a refusal to converge.
  if (p[1] / p[2] < (max(x) - min(x)) * 1e-3) return(list(n = n, ran = FALSE, why = "no_fit"))
  J <- bs_gc_jacobian(x, p)
  A <- crossprod(J)
  Ainv <- tryCatch(solve(A), error = function(e) NULL)
  if (is.null(Ainv) || any(!is.finite(Ainv))) return(list(n = n, ran = FALSE, why = "no_fit"))
  fitted <- bs_gc_curve(x, p)
  resid <- y - fitted
  df <- n - 3
  ss <- sum(resid^2)
  s2 <- ss / df
  se <- sqrt(s2 * diag(Ainv))
  tcrit <- qt(0.975, df)
  ord <- order(x)
  resid_ord <- resid[ord]
  runs <- bs_runs_test(sign(resid_ord)[sign(resid_ord) != 0])
  grid <- seq(min(x), max(x), length.out = 100)
  G <- bs_gc_jacobian(grid, p)
  cg <- rowSums((G %*% Ainv) * G)
  fit_grid <- bs_gc_curve(grid, p)

  doubling_value <- log(2) / p[2]
  doubling_grad <- c(0, -log(2) / p[2]^2, 0)
  doubling_se <- sqrt(as.numeric(t(doubling_grad) %*% Ainv %*% doubling_grad) * s2)

  tau_value <- p[3] + p[1] / p[2]
  tau_grad <- c(1 / p[2], -p[1] / p[2]^2, 1)
  tau_se <- sqrt(as.numeric(t(tau_grad) %*% Ainv %*% tau_grad) * s2)

  list(
    n = n,
    ran = TRUE,
    asymptote = bs_gc_quantity(p[1], se[1], tcrit),
    growth_rate = bs_gc_quantity(p[2], se[2], tcrit),
    lag = bs_gc_quantity(p[3], se[3], tcrit),
    doubling_time = bs_gc_quantity(doubling_value, doubling_se, tcrit),
    exponential_end = bs_gc_quantity(tau_value, tau_se, tcrit),
    df = df,
    ss = ss,
    syx = sqrt(s2),
    r2 = 1 - ss / sum((y - mean(y))^2),
    x = x[ord],
    y = y[ord],
    fitted = fitted[ord],
    residual = resid_ord,
    runs = runs,
    band = list(
      x = grid,
      fit = fit_grid,
      confidence_lower = fit_grid - tcrit * sqrt(cg * s2),
      confidence_upper = fit_grid + tcrit * sqrt(cg * s2),
      prediction_lower = fit_grid - tcrit * sqrt((cg + 1) * s2),
      prediction_upper = fit_grid + tcrit * sqrt((cg + 1) * s2)
    )
  )
}

# x, y: every series' points, concatenated; g: each point's series (1..k).
bs_growth_curve <- function(x, y, g, k) {
  list(series = lapply(seq_len(k), function(i) bs_gc_one(x[g == i], y[g == i])))
}
