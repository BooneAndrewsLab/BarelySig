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
#
# `idx`: the parameters being estimated (the others are fixed, or sit on a
# bound, and stay put); `lower`/`upper`: a step that leaves them is refused.
bs_fpl_polish <- function(x, y, p, idx = 1:4, lower = rep(-Inf, 4), upper = rep(Inf, 4)) {
  ss <- sum((y - bs_fpl_curve(x, p))^2)
  gn <- function(p) {
    step <- tryCatch(
      qr.coef(qr(bs_fpl_jacobian(x, p)[, idx, drop = FALSE]), y - bs_fpl_curve(x, p)),
      error = function(e) NULL
    )
    if (is.null(step) || any(!is.finite(step))) return(NULL)
    unname(step)
  }
  for (i in 1:20) {
    step <- gn(p)
    if (is.null(step)) break
    q <- p
    q[idx] <- p[idx] + step
    if (any(q < lower | q > upper)) break
    ss_q <- sum((y - bs_fpl_curve(x, q))^2)
    if (!(ss_q <= ss)) break
    p <- q
    ss <- ss_q
    if (max(abs(step) / pmax(abs(p[idx]), 1e-8)) < 1e-13) break
  }
  # The last digits: once this close, the sum of squares changes by less
  # than its own rounding, so a step can't be judged by it; Gauss-Newton
  # converges quadratically here, so a few plain steps finish the job.
  for (i in 1:3) {
    step <- gn(p)
    if (is.null(step) || max(abs(step) / pmax(abs(p[idx]), 1e-8)) > 1e-6) break
    q <- p
    q[idx] <- p[idx] + step
    if (any(q < lower | q > upper)) break
    p <- q
  }
  p
}

# The fit when a parameter is fixed or bounded (#96). p = (Bottom, Top,
# LogEC50, HillSlope); a fixed one has lower == upper. nls(algorithm =
# "port") estimates the rest inside the bounds, from a small grid of starts
# (both plateau orders as well as several LogEC50 and HillSlope); returns
# the best p, or NULL when no start converged.
bs_fpl_constrained_nls <- function(x, y, lower, upper) {
  fixed <- lower == upper
  span <- max(x) - min(x)
  clamp <- function(v, i) min(max(v, lower[i]), upper[i])
  plateaus <- list(c(min(y), max(y)), c(max(y), min(y)))
  ecs <- unname(quantile(x, c(0.25, 0.5, 0.75)))
  hills <- unique(c(1, -1, 4 / span, -4 / span))
  if (fixed[4]) hills <- lower[4]
  terms <- ifelse(fixed, format(lower, digits = 17), c("b", "t", "l", "h"))
  fml <- as.formula(paste0("y ~ bs_fpl_curve(x, c(", paste(terms, collapse = ", "), "))"))
  environment(fml) <- environment()
  best <- NULL
  best_ss <- Inf
  for (pl in plateaus) for (l in ecs) for (h in hills) {
    start <- c(b = clamp(pl[1], 1), t = clamp(pl[2], 2), l = l, h = clamp(h, 4))
    m <- tryCatch(
      nls(fml,
        start = as.list(start[!fixed]), algorithm = "port",
        lower = lower[!fixed], upper = upper[!fixed],
        control = nls.control(maxiter = 500, tol = 1e-8, scaleOffset = 1)
      ),
      error = function(e) NULL
    )
    if (is.null(m)) next
    p <- lower
    p[!fixed] <- unname(coef(m))
    ss <- sum((y - bs_fpl_curve(x, p))^2)
    if (is.finite(ss) && ss < best_ss) {
      best <- p
      best_ss <- ss
    }
  }
  best
}

bs_fpl_param <- function(value, se, t, dependency) {
  list(
    value = unname(value), status = "fitted", se = unname(se),
    lower = unname(value - t * se), upper = unname(value + t * se),
    dependency = unname(dependency), ambiguous = unname(dependency > 0.9999)
  )
}

# A parameter held at a constant (fixed by the user, or sitting on a bound):
# no SE, CI or dependency, since nothing about it was estimated.
bs_fpl_held <- function(value, status) {
  list(value = unname(value), status = status, ambiguous = FALSE)
}

# x: log dose. `unlog` maps it back to the table's own X units. `lower` /
# `upper`: bounds on (Bottom, Top, LogEC50, HillSlope), a fixed parameter
# having lower == upper (#96); unbounded by default.
bs_fpl_one <- function(x, y, unlog, dropped, lower = rep(-Inf, 4), upper = rep(Inf, 4)) {
  n <- length(x)
  fixed <- lower == upper
  constrained <- any(is.finite(lower) | is.finite(upper))
  k <- sum(!fixed)
  if (n < k + 1) return(list(n = n, dropped = dropped, ran = FALSE, why = "few", minimum = k + 1))
  if (length(unique(x)) < k) {
    return(list(n = n, dropped = dropped, ran = FALSE, why = "few_x", minimum = k))
  }
  if (max(y) == min(y)) return(list(n = n, dropped = dropped, ran = FALSE, why = "constant_y"))
  idx <- 1:4
  if (!constrained) {
    m <- bs_fpl_nls(x, y)
    if (is.null(m)) return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
    cf <- coef(m)
    p <- unname(c(cf[".lin1"], cf[".lin2"], cf["logec50"], cf["hill"]))
    # The same curve with the plateaus swapped and the slope negated: report
    # the one Prism does, Bottom <= Top, the slope's sign giving the direction.
    if (p[1] > p[2]) p <- c(p[2], p[1], p[3], -p[4])
    p <- bs_fpl_polish(x, y, p)
  } else {
    p <- bs_fpl_constrained_nls(x, y, lower, upper)
    if (is.null(p)) return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
    # A parameter the fit pushed onto a bound is held there: the fit is then
    # the one without it, and it is reported as at its bound, without an SE.
    tol <- 1e-8 * pmax(1, abs(p))
    at_lower <- !fixed & p <= lower + tol
    at_upper <- !fixed & p >= upper - tol
    p[at_lower] <- lower[at_lower]
    p[at_upper] <- upper[at_upper]
    idx <- which(!fixed & !at_lower & !at_upper)
    p <- bs_fpl_polish(x, y, p, idx, lower, upper)
  }
  J <- bs_fpl_jacobian(x, p)[, idx, drop = FALSE]
  A <- crossprod(J)
  Ainv <- tryCatch(solve(A), error = function(e) NULL)
  if (is.null(Ainv) || any(!is.finite(Ainv))) {
    return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
  }
  fitted <- bs_fpl_curve(x, p)
  resid <- y - fitted
  df <- n - length(idx)
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
  G <- bs_fpl_jacobian(grid, p)[, idx, drop = FALSE]
  cg <- rowSums((G %*% Ainv) * G)
  fit_grid <- bs_fpl_curve(grid, p)
  # se and dependency are per estimated parameter (idx); the others are held.
  param <- function(i) {
    j <- match(i, idx)
    if (is.na(j)) return(bs_fpl_held(p[i], if (fixed[i]) "fixed" else "at_bound"))
    bs_fpl_param(p[i], se[j], t, dependency[j])
  }
  logec50 <- param(3)
  list(
    n = n,
    dropped = dropped,
    ran = TRUE,
    bottom = param(1),
    top = param(2),
    logec50 = logec50,
    hill = param(4),
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

# AICc with K = parameters estimated + 1 (the variance counts, as in R's AIC);
# NA when the correction has no finite value (n <= K + 1) or the fit is exact.
bs_fpl_aicc <- function(ss, n, params) {
  k <- params + 1
  if (n - k - 1 <= 0 || ss <= 0) return(NA_real_)
  n * log(ss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1)
}

# The fit `main` against the simpler model `alt` that holds some of its
# parameters (#98): extra sum-of-squares F test and AICc. Both are bs_fpl_one
# results that ran. `alt` is nested in `main`, so its sum of squares can only
# be the larger; a smaller one means an optimiser missed the optimum.
bs_fpl_compare <- function(main, alt, n) {
  if (alt$ss < main$ss * (1 - 1e-9)) return(list(ran = FALSE, why = "worse"))
  df_num <- alt$df - main$df
  f_test <- if (main$ss <= 0) {
    list(ok = FALSE, why = "exact_fit")
  } else if (df_num < 1 || main$df < 1) {
    list(ok = FALSE, why = "no_extra")
  } else {
    f <- max(0, (alt$ss - main$ss) / df_num) / (main$ss / main$df)
    list(
      ok = TRUE, f = f, df_num = df_num, df_den = main$df,
      p = pf(f, df_num, main$df, lower.tail = FALSE)
    )
  }
  a_main <- bs_fpl_aicc(main$ss, n, n - main$df)
  a_alt <- bs_fpl_aicc(alt$ss, n, n - alt$df)
  aicc <- if (is.na(a_main) || is.na(a_alt)) {
    list(ok = FALSE)
  } else {
    list(
      ok = TRUE, fit = a_main, simpler = a_alt,
      prob_fit = plogis((a_alt - a_main) / 2), prob_simpler = plogis((a_main - a_alt) / 2)
    )
  }
  list(
    ran = TRUE,
    simpler = list(
      bottom = alt$bottom$value, top = alt$top$value, logec50 = alt$logec50$value,
      hill = alt$hill$value, ec50 = alt$ec50, ss = alt$ss, df = alt$df
    ),
    f_test = f_test, aicc = aicc
  )
}

# x, y: every series' points, concatenated; g: each point's series (1..k).
# log_x: X is already log10(dose) (Prism's model); otherwise X is a dose,
# fit against its log10, and a dose <= 0 (no log) is left out and counted.
# lo, hi: bounds on (Bottom, Top, HillSlope), used where has_lo / has_hi;
# a fixed parameter has lo == hi (#96).
# cmp_val, cmp_has: the simpler model of a comparison (#98): where it holds
# (Bottom, Top, HillSlope), used where cmp_has; nothing if none is.
bs_nonlinear_regression <- function(x, y, g, k, log_x, lo, hi, has_lo, has_hi,
                                    cmp_val = c(0, 0, 0), cmp_has = c(0, 0, 0)) {
  lo <- ifelse(has_lo != 0, lo, -Inf)
  hi <- ifelse(has_hi != 0, hi, Inf)
  lower <- c(lo[1], lo[2], -Inf, lo[3])
  upper <- c(hi[1], hi[2], Inf, hi[3])
  alt_lower <- lower
  alt_upper <- upper
  held <- c(1, 2, 4)[cmp_has != 0]
  alt_lower[held] <- cmp_val[cmp_has != 0]
  alt_upper[held] <- cmp_val[cmp_has != 0]
  one <- function(xs, ys, unlog, dropped) {
    fit <- bs_fpl_one(xs, ys, unlog, dropped, lower, upper)
    if (length(held) == 0 || !isTRUE(fit$ran)) return(fit)
    alt <- bs_fpl_one(xs, ys, unlog, dropped, alt_lower, alt_upper)
    fit$comparison <- if (isTRUE(alt$ran)) {
      bs_fpl_compare(fit, alt, length(xs))
    } else {
      list(ran = FALSE, why = "no_fit")
    }
    fit
  }
  list(series = lapply(seq_len(k), function(i) {
    xi <- x[g == i]
    yi <- y[g == i]
    if (log_x) return(one(xi, yi, identity, 0))
    keep <- xi > 0
    one(log10(xi[keep]), yi[keep], function(v) 10^v, sum(!keep))
  }))
}
