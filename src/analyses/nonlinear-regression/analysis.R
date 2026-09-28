# Nonlinear regression of an XY table's Y data sets (item 32, #37): Prism's
# "log(agonist) vs. response -- Variable slope" (four-parameter logistic),
#   Y = Bottom + (Top - Bottom) / (1 + 10^((LogEC50 - X) * HillSlope)),
# fit to each series on its own with base R's nls(algorithm = "plinear"):
# Bottom and Top enter linearly, so only LogEC50 and HillSlope need starts.
# Standard errors, CIs, dependency and the bands are asymptotic, from the
# analytic Jacobian (Prism's method; note 32). Needs linear-regression's
# bs_runs_test, which the module prepends.

bs_fpl_frac <- function(x, logec50, hill) 1 / (1 + 10^((logec50 - x) * hill))

bs_fpl_curve <- function(x, p) p[1] + (p[2] - p[1]) * bs_fpl_frac(x, p[3], p[4])

# d Y / d (Bottom, Top, LogEC50, HillSlope), one row per x.
bs_fpl_jacobian <- function(x, p) {
  f <- bs_fpl_frac(x, p[3], p[4])
  d <- (p[2] - p[1]) * f * (1 - f) * log(10)
  cbind(1 - f, f, -p[4] * d, (x - p[3]) * d)
}

# The least-squares fit from a small grid of starts, or NULL if none converged.
bs_fpl_nls <- function(x, y) {
  span <- max(x) - min(x)
  starts <- expand.grid(
    logec50 = unname(quantile(x, c(0.25, 0.5, 0.75))),
    hill = unique(c(1, -1, 4 / span, -4 / span))
  )
  best <- NULL
  for (i in seq_len(nrow(starts))) {
    m <- tryCatch(
      nls(y ~ cbind(1 - bs_fpl_frac(x, logec50, hill), bs_fpl_frac(x, logec50, hill)),
        start = list(logec50 = starts$logec50[i], hill = starts$hill[i]),
        algorithm = "plinear",
        control = nls.control(maxiter = 200, tol = 1e-8, scaleOffset = 1)
      ),
      error = function(e) NULL
    )
    if (!is.null(m) && (is.null(best) || deviance(m) < deviance(best))) best <- m
  }
  best
}

# Full Gauss-Newton steps from nls's answer, kept while they lower the
# sum of squares: nls stops at its relative-offset tolerance, which
# leaves small residuals and near-zero band limits a few 1e-6 off the
# optimum in relative terms.
bs_fpl_polish <- function(x, y, p) {
  ss <- sum((y - bs_fpl_curve(x, p))^2)
  for (i in 1:20) {
    J <- bs_fpl_jacobian(x, p)
    step <- tryCatch(qr.coef(qr(J), y - bs_fpl_curve(x, p)), error = function(e) NULL)
    if (is.null(step) || any(!is.finite(step))) break
    q <- p + unname(step)
    ss_q <- sum((y - bs_fpl_curve(x, q))^2)
    if (!(ss_q <= ss)) break
    p <- q
    ss <- ss_q
    if (max(abs(step) / pmax(abs(p), 1e-8)) < 1e-13) break
  }
  # The last digits: once this close, the sum of squares changes by less
  # than its own rounding, so a step can't be judged by it; Gauss-Newton
  # converges quadratically here, so a few plain steps finish the job.
  for (i in 1:3) {
    step <- tryCatch(qr.coef(qr(bs_fpl_jacobian(x, p)), y - bs_fpl_curve(x, p)), error = function(e) NULL)
    if (is.null(step) || any(!is.finite(step)) || max(abs(step) / pmax(abs(p), 1e-8)) > 1e-6) break
    p <- p + unname(step)
  }
  p
}

bs_fpl_param <- function(value, se, t, dependency) {
  list(
    value = unname(value), se = unname(se),
    lower = unname(value - t * se), upper = unname(value + t * se),
    dependency = unname(dependency), ambiguous = unname(dependency > 0.9999)
  )
}

# x: log dose. `unlog` maps it back to the table's own X units.
bs_fpl_one <- function(x, y, unlog, dropped) {
  n <- length(x)
  if (n < 5) return(list(n = n, dropped = dropped, ran = FALSE, why = "few", minimum = 5))
  if (length(unique(x)) < 4) {
    return(list(n = n, dropped = dropped, ran = FALSE, why = "few_x", minimum = 4))
  }
  if (max(y) == min(y)) return(list(n = n, dropped = dropped, ran = FALSE, why = "constant_y"))
  m <- bs_fpl_nls(x, y)
  if (is.null(m)) return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
  cf <- coef(m)
  p <- unname(c(cf[".lin1"], cf[".lin2"], cf["logec50"], cf["hill"]))
  # The same curve with the plateaus swapped and the slope negated: report
  # the one Prism does, Bottom <= Top, the slope's sign giving the direction.
  if (p[1] > p[2]) p <- c(p[2], p[1], p[3], -p[4])
  p <- bs_fpl_polish(x, y, p)
  J <- bs_fpl_jacobian(x, p)
  A <- crossprod(J)
  Ainv <- tryCatch(solve(A), error = function(e) NULL)
  if (is.null(Ainv) || any(!is.finite(Ainv))) {
    return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
  }
  fitted <- bs_fpl_curve(x, p)
  resid <- y - fitted
  df <- n - 4
  ss <- sum(resid^2)
  s2 <- ss / df
  se <- sqrt(s2 * diag(Ainv))
  # Prism's dependency: 1 - (SE with the others fixed / SE)^2.
  dependency <- 1 - 1 / (diag(A) * diag(Ainv))
  t <- qt(0.975, df)
  ord <- order(x)
  resid_ord <- resid[ord]
  runs <- bs_runs_test(sign(resid_ord)[sign(resid_ord) != 0])
  grid <- seq(min(x), max(x), length.out = 100)
  G <- bs_fpl_jacobian(grid, p)
  cg <- rowSums((G %*% Ainv) * G)
  fit_grid <- bs_fpl_curve(grid, p)
  logec50 <- bs_fpl_param(p[3], se[3], t, dependency[3])
  list(
    n = n,
    dropped = dropped,
    ran = TRUE,
    bottom = bs_fpl_param(p[1], se[1], t, dependency[1]),
    top = bs_fpl_param(p[2], se[2], t, dependency[2]),
    logec50 = logec50,
    hill = bs_fpl_param(p[4], se[4], t, dependency[4]),
    ec50 = 10^p[3],
    ec50_lower = 10^logec50$lower,
    ec50_upper = 10^logec50$upper,
    df = df,
    ss = ss,
    syx = sqrt(s2),
    r2 = 1 - ss / sum((y - mean(y))^2),
    x = unlog(x[ord]),
    y = y[ord],
    fitted = fitted[ord],
    residual = resid_ord,
    runs = runs,
    band = list(
      x = unlog(grid),
      fit = fit_grid,
      confidence_lower = fit_grid - t * sqrt(cg * s2),
      confidence_upper = fit_grid + t * sqrt(cg * s2),
      prediction_lower = fit_grid - t * sqrt((cg + 1) * s2),
      prediction_upper = fit_grid + t * sqrt((cg + 1) * s2)
    )
  )
}

# x, y: every series' points, concatenated; g: each point's series (1..k).
# log_x: X is already log10(dose) (Prism's model); otherwise X is a dose,
# fit against its log10, and a dose <= 0 (no log) is left out and counted.
bs_nonlinear_regression <- function(x, y, g, k, log_x) {
  list(series = lapply(seq_len(k), function(i) {
    xi <- x[g == i]
    yi <- y[g == i]
    if (log_x) return(bs_fpl_one(xi, yi, identity, 0))
    keep <- xi > 0
    bs_fpl_one(log10(xi[keep]), yi[keep], function(v) 10^v, sum(!keep))
  }))
}
