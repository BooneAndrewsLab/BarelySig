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
bs_fpl_nls <- function(x, y, w = rep(1, length(x))) {
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
        algorithm = "plinear", weights = w,
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
bs_fpl_polish <- function(x, y, p, idx = 1:4, lower = rep(-Inf, 4), upper = rep(Inf, 4),
                          w = rep(1, length(x))) {
  sw <- sqrt(w)
  ss <- sum(w * (y - bs_fpl_curve(x, p))^2)
  gn <- function(p) {
    step <- tryCatch(
      qr.coef(qr(sw * bs_fpl_jacobian(x, p)[, idx, drop = FALSE]), sw * (y - bs_fpl_curve(x, p))),
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
    ss_q <- sum(w * (y - bs_fpl_curve(x, q))^2)
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
bs_fpl_constrained_nls <- function(x, y, lower, upper, w = rep(1, length(x))) {
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
        start = as.list(start[!fixed]), algorithm = "port", weights = w,
        lower = lower[!fixed], upper = upper[!fixed],
        control = nls.control(maxiter = 500, tol = 1e-8, scaleOffset = 1)
      ),
      error = function(e) NULL
    )
    if (is.null(m)) next
    p <- lower
    p[!fixed] <- unname(coef(m))
    ss <- sum(w * (y - bs_fpl_curve(x, p))^2)
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

# Interpolating unknowns (#100): the X at which the curve reaches each Y in
# `y0`, with the 95% CI where the two confidence bands of the curve cross
# that Y (Prism's method). p: the curve's parameters; `half(v)`: the
# half-width of the confidence band at log dose v; `span`: the range of the
# fitted log doses. A Y at or beyond a plateau has no X: it is reported as
# such, never as a number. A side of the CI the bands never reach within
# five spans of the estimate is open (NA).
bs_interpolate <- function(y0, p, span, half, unlog) {
  reach <- 5 * max(span, 1)
  one <- function(y0) {
    res <- function(status, x = NA_real_, lower = NA_real_, upper = NA_real_) {
      list(y = y0, status = status, x = x, lower = lower, upper = upper)
    }
    f <- (y0 - p[1]) / (p[2] - p[1])
    if (!is.finite(f) || p[4] == 0) return(res("undefined"))
    if (f <= 0) return(res("beyond-bottom"))
    if (f >= 1) return(res("beyond-top"))
    xh <- p[3] - log10((1 - f) / f) / p[4]
    if (!is.finite(xh)) return(res("undefined"))
    up <- function(v) bs_fpl_curve(v, p) + half(v) - y0
    dn <- function(v) bs_fpl_curve(v, p) - half(v) - y0
    # The first place going from the estimate in direction `dir` where `fun` changes sign.
    find <- function(fun, dir) {
      steps <- xh + dir * reach * (0:400) / 400
      vals <- fun(steps)
      hit <- which(sign(vals[-1]) != sign(vals[1]))
      if (length(hit) == 0) return(NA_real_)
      i <- hit[1]
      uniroot(fun, sort(c(steps[i], steps[i + 1])), tol = 1e-13)$root
    }
    rising <- (p[2] - p[1]) * p[4] > 0
    lo <- find(if (rising) up else dn, -1)
    hi <- find(if (rising) dn else up, 1)
    if (half(xh) == 0) {
      lo <- xh
      hi <- xh
    }
    res("ok", unlog(xh), unlog(lo), unlog(hi))
  }
  lapply(y0, one)
}

# x: log dose. `w`: the point weights (1 = unweighted; static ones from the
# table); `ypow`: 1 or 2 for 1/Y or 1/Y^2, whose weights come from the fitted
# curve, iteratively reweighted from an unweighted start (Prism's way; #100),
# `w` then being ones. `unlog` maps x back to the table's own X units.
# `lower` / `upper`: bounds on (Bottom, Top, LogEC50, HillSlope), a fixed
# parameter having lower == upper (#96); unbounded by default. `unknown`: Y
# values to interpolate from the fitted curve.
bs_fpl_one <- function(x, y, w, unlog, dropped, lower = rep(-Inf, 4), upper = rep(Inf, 4),
                       ypow = 0, unknown = numeric(0)) {
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
    m <- bs_fpl_nls(x, y, w)
    if (is.null(m)) return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
    cf <- coef(m)
    p <- unname(c(cf[".lin1"], cf[".lin2"], cf["logec50"], cf["hill"]))
    # The same curve with the plateaus swapped and the slope negated: report
    # the one Prism does, Bottom <= Top, the slope's sign giving the direction.
    if (p[1] > p[2]) p <- c(p[2], p[1], p[3], -p[4])
    p <- bs_fpl_polish(x, y, p, w = w)
  } else {
    p <- bs_fpl_constrained_nls(x, y, lower, upper, w)
    if (is.null(p)) return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
    # A parameter the fit pushed onto a bound is held there: the fit is then
    # the one without it, and it is reported as at its bound, without an SE.
    tol <- 1e-8 * pmax(1, abs(p))
    at_lower <- !fixed & p <= lower + tol
    at_upper <- !fixed & p >= upper - tol
    p[at_lower] <- lower[at_lower]
    p[at_upper] <- upper[at_upper]
    idx <- which(!fixed & !at_lower & !at_upper)
    p <- bs_fpl_polish(x, y, p, idx, lower, upper, w)
  }
  if (ypow > 0) {
    for (it in 1:200) {
      f <- bs_fpl_curve(x, p)
      if (any(!is.finite(f)) || any(f <= 0)) {
        return(list(n = n, dropped = dropped, ran = FALSE, why = "weights"))
      }
      w <- f^-ypow
      q <- bs_fpl_polish(x, y, p, idx, lower, upper, w)
      change <- max(abs(q - p) / pmax(abs(p), 1e-8))
      p <- q
      if (change < 1e-12) break
    }
    f <- bs_fpl_curve(x, p)
    if (any(!is.finite(f)) || any(f <= 0)) {
      return(list(n = n, dropped = dropped, ran = FALSE, why = "weights"))
    }
    w <- f^-ypow
  }
  sw <- sqrt(w)
  J <- sw * bs_fpl_jacobian(x, p)[, idx, drop = FALSE]
  A <- crossprod(J)
  Ainv <- tryCatch(solve(A), error = function(e) NULL)
  if (is.null(Ainv) || any(!is.finite(Ainv))) {
    return(list(n = n, dropped = dropped, ran = FALSE, why = "no_fit"))
  }
  fitted <- bs_fpl_curve(x, p)
  resid <- y - fitted
  df <- n - length(idx)
  ss <- sum(w * resid^2)
  s2 <- ss / df
  se <- sqrt(s2 * diag(Ainv))
  # Prism's dependency: 1 - (SE with the others fixed / SE)^2.
  dependency <- 1 - 1 / (diag(A) * diag(Ainv))
  t <- qt(0.975, df)
  ord <- order(x)
  resid_ord <- resid[ord]
  runs <- bs_runs_test(sign(resid_ord)[sign(resid_ord) != 0])
  grid <- seq(min(x), max(x), length.out = 100)
  band_half <- function(v) {
    G <- bs_fpl_jacobian(v, p)[, idx, drop = FALSE]
    t * sqrt(rowSums((G %*% Ainv) * G) * s2)
  }
  half_grid <- band_half(grid)
  # A new observation is assumed to weigh what the nearest measured X does.
  w_new <- vapply(grid, function(v) w[which.min(abs(x - v))], 0)
  pred_half <- t * sqrt((half_grid / t)^2 + s2 / w_new)
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
    r2 = 1 - ss / sum(w * (y - weighted.mean(y, w))^2),
    x = unlog(x[ord]),
    y = y[ord],
    fitted = fitted[ord],
    residual = resid_ord,
    runs = runs,
    band = list(
      x = unlog(grid),
      fit = fit_grid,
      confidence_lower = fit_grid - half_grid,
      confidence_upper = fit_grid + half_grid,
      prediction_lower = fit_grid - pred_half,
      prediction_upper = fit_grid + pred_half
    ),
    unknowns = bs_interpolate(unknown, p, diff(range(x)), band_half, unlog)
  )
}

# AICc with K = parameters estimated + 1 (the variance counts, as in R's AIC);
# NA when the correction has no finite value (n <= K + 1) or the fit is exact.
bs_fpl_aicc <- function(ss, n, params) {
  k <- params + 1
  if (n - k - 1 <= 0 || ss <= 0) return(NA_real_)
  n * log(ss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1)
}

# Two fits of the same n points (#98, #105): each a list with `ss` and `df`
# (a bs_fpl_one result, or a global fit's totals). `simpler` is nested in
# `complex`, so its sum of squares can only be the larger; a smaller one means
# an optimiser missed the optimum. The extra sum-of-squares F test and AICc.
# With nested = FALSE the pair is not nested: there is no F test (not_nested),
# `complex` is then just the first model and `simpler` the second, and only
# AICc compares them.
bs_compare_stats <- function(complex, simpler, n, nested = TRUE) {
  if (nested && simpler$ss < complex$ss * (1 - 1e-9)) return(NULL)
  df_num <- simpler$df - complex$df
  f_test <- if (!nested) {
    list(ok = FALSE, why = "not_nested")
  } else if (complex$ss <= 0) {
    list(ok = FALSE, why = "exact_fit")
  } else if (df_num < 1 || complex$df < 1) {
    list(ok = FALSE, why = "no_extra")
  } else {
    f <- max(0, (simpler$ss - complex$ss) / df_num) / (complex$ss / complex$df)
    list(
      ok = TRUE, f = f, df_num = df_num, df_den = complex$df,
      p = pf(f, df_num, complex$df, lower.tail = FALSE)
    )
  }
  a_cx <- bs_fpl_aicc(complex$ss, n, n - complex$df)
  a_sm <- bs_fpl_aicc(simpler$ss, n, n - simpler$df)
  aicc <- if (is.na(a_cx) || is.na(a_sm)) {
    list(ok = FALSE)
  } else {
    list(
      ok = TRUE, fit = a_cx, simpler = a_sm,
      prob_fit = plogis((a_sm - a_cx) / 2), prob_simpler = plogis((a_cx - a_sm) / 2)
    )
  }
  list(f_test = f_test, aicc = aicc)
}

# The fit `main` against the simpler model `alt` that holds some of its
# parameters (#98), or (#105) two single-data-set fits in either orientation:
# `main` = the more complex one. Both are bs_fpl_one results that ran.
bs_fpl_compare <- function(main, alt, n, nested = TRUE) {
  st <- bs_compare_stats(main, alt, n, nested)
  if (is.null(st)) return(list(ran = FALSE, why = "worse"))
  list(
    ran = TRUE,
    simpler = list(
      bottom = alt$bottom$value, top = alt$top$value, logec50 = alt$logec50$value,
      hill = alt$hill$value, ec50 = alt$ec50, ss = alt$ss, df = alt$df
    ),
    f_test = st$f_test, aicc = st$aicc
  )
}

# --- Global fit (#97) -------------------------------------------------------
# Shared parameters across the data sets: one stacked least-squares problem.
# The unknowns are each shared parameter once and each unshared one per data
# set; a parameter held at a constant (lower == upper) is not an unknown.

# Row i of the result maps data set i's (Bottom, Top, LogEC50, HillSlope) to
# unknown numbers; 0 = held.
bs_global_map <- function(k, shared, fixed) {
  map <- matrix(0L, k, 4)
  m <- 0L
  for (j in 1:4) {
    if (fixed[j]) next
    if (shared[j]) {
      m <- m + 1L
      map[, j] <- m
    } else {
      map[, j] <- m + seq_len(k)
      m <- m + k
    }
  }
  list(map = map, m = m)
}

# The k x 4 matrix of every data set's parameters from the unknowns.
bs_global_params <- function(theta, map, held) {
  P <- matrix(held, nrow(map), 4, byrow = TRUE)
  P[map > 0] <- theta[map[map > 0]]
  P
}

# d Y / d (Bottom, Top, LogEC50, HillSlope) per point, with per-point parameters.
bs_global_jacobian4 <- function(x, Q) {
  f <- 1 / (1 + 10^((Q[, 3] - x) * Q[, 4]))
  d <- (Q[, 2] - Q[, 1]) * f * (1 - f) * log(10)
  cbind(1 - f, f, -Q[, 4] * d, (x - Q[, 3]) * d)
}

bs_global_curve <- function(x, Q) Q[, 1] + (Q[, 2] - Q[, 1]) / (1 + 10^((Q[, 3] - x) * Q[, 4]))

# Jacobian with respect to the unknowns: a shared unknown collects the
# columns of every data set that uses it.
bs_global_jacobian <- function(x, g, theta, map, held) {
  P <- bs_global_params(theta, map, held)
  J4 <- bs_global_jacobian4(x, P[g, , drop = FALSE])
  J <- matrix(0, length(x), length(theta))
  for (j in 1:4) {
    u <- map[g, j]
    on <- which(u > 0)
    J[cbind(on, u[on])] <- J[cbind(on, u[on])] + J4[on, j]
  }
  J
}

# Levenberg-Marquardt from `theta`, then plain Gauss-Newton steps kept while
# they lower the sum of squares; returns theta (NULL if the step is singular
# or not finite at the start).
bs_global_lm <- function(x, y, w, g, map, held, theta) {
  sw <- sqrt(w)
  ss_of <- function(th) {
    r <- y - bs_global_curve(x, bs_global_params(th, map, held)[g, , drop = FALSE])
    if (any(!is.finite(r))) Inf else sum(w * r^2)
  }
  ss <- ss_of(theta)
  if (!is.finite(ss)) return(NULL)
  lambda <- 1e-3
  for (it in 1:500) {
    J <- sw * bs_global_jacobian(x, g, theta, map, held)
    r <- sw * (y - bs_global_curve(x, bs_global_params(theta, map, held)[g, , drop = FALSE]))
    A <- crossprod(J)
    step <- tryCatch(
      solve(A + lambda * diag(pmax(diag(A), 1e-12), ncol(J)), crossprod(J, r)),
      error = function(e) NULL
    )
    if (is.null(step) || any(!is.finite(step))) {
      lambda <- lambda * 10
      if (lambda > 1e12) break
      next
    }
    cand <- theta + drop(step)
    ss_c <- ss_of(cand)
    if (ss_c <= ss) {
      moved <- max(abs(cand - theta) / pmax(abs(cand), 1e-8))
      theta <- cand
      ss <- ss_c
      lambda <- lambda / 10
      if (moved < 1e-14) break
    } else {
      lambda <- lambda * 10
      if (lambda > 1e12) break
    }
  }
  for (it in 1:5) {
    J <- sw * bs_global_jacobian(x, g, theta, map, held)
    r <- sw * (y - bs_global_curve(x, bs_global_params(theta, map, held)[g, , drop = FALSE]))
    step <- tryCatch(qr.coef(qr(J), r), error = function(e) NULL)
    if (is.null(step) || any(!is.finite(step))) break
    cand <- theta + unname(step)
    if (!(ss_of(cand) <= ss_of(theta) * (1 + 1e-12))) break
    theta <- cand
  }
  theta
}

# The whole global fit. x: log doses of the kept points, g: their data set
# (1..k), xs/ys: per data set. `lower == upper` = held. `unlog`/`dropped`:
# per data set, as bs_fpl_one takes them. Returns one entry per data set and
# the whole fit's numbers.
bs_global_fit <- function(xs, ys, ws, unlogs, dropped, shared, lower, upper, ypow = 0,
                          unknowns = NULL) {
  k <- length(xs)
  fixed <- lower == upper
  held <- ifelse(fixed, lower, 0)
  ns <- vapply(xs, length, 0L)
  empty <- function(i, why, minimum = NULL) {
    out <- list(n = ns[i], dropped = dropped[i], ran = FALSE, why = why)
    if (!is.null(minimum)) out$minimum <- minimum
    out
  }
  use <- which(ns > 0)
  none <- function(why, minimum = NULL) {
    list(series = lapply(seq_len(k), function(i) empty(i, if (ns[i] == 0) "few" else why, if (ns[i] == 0) 1 else minimum)), global = NULL)
  }
  if (length(use) < 2) return(none("few"))
  x <- unlist(xs[use])
  y <- unlist(ys[use])
  w <- unlist(ws[use])
  g <- rep(seq_along(use), ns[use])
  kk <- length(use)
  layout <- bs_global_map(kk, shared, fixed)
  map <- layout$map
  m <- layout$m
  n <- length(x)
  if (n < m + 1) return(none("few", m + 1))
  if (max(y) == min(y)) return(none("constant_y"))
  # Starts: every data set's own fit (shared parameters averaged), and the pooled fit.
  pooled <- bs_fpl_one(x, y, w, identity, 0, lower, upper)
  singles <- lapply(seq_len(kk), function(i) bs_fpl_one(xs[[use[i]]], ys[[use[i]]], ws[[use[i]]], identity, 0, lower, upper))
  pvec <- function(f) c(f$bottom$value, f$top$value, f$logec50$value, f$hill$value)
  pooled_p <- if (isTRUE(pooled$ran)) pvec(pooled) else NULL
  starts <- list()
  from_p <- function(rows) {
    th <- numeric(m)
    for (j in 1:4) {
      if (fixed[j]) next
      if (shared[j]) th[map[1, j]] <- mean(rows[, j]) else th[map[, j]] <- rows[, j]
    }
    th
  }
  if (!is.null(pooled_p)) {
    starts[[1]] <- from_p(matrix(pooled_p, kk, 4, byrow = TRUE))
    rows <- t(vapply(singles, function(f) if (isTRUE(f$ran)) pvec(f) else pooled_p, numeric(4)))
    starts[[2]] <- from_p(rows)
  } else if (all(vapply(singles, function(f) isTRUE(f$ran), TRUE))) {
    starts[[1]] <- from_p(t(vapply(singles, pvec, numeric(4))))
  }
  if (length(starts) == 0) return(none("no_fit"))
  best <- NULL
  best_ss <- Inf
  for (s in starts) {
    th <- bs_global_lm(x, y, w, g, map, held, s)
    if (is.null(th)) next
    ss <- sum(w * (y - bs_global_curve(x, bs_global_params(th, map, held)[g, , drop = FALSE]))^2)
    if (is.finite(ss) && ss < best_ss) {
      best <- th
      best_ss <- ss
    }
  }
  if (is.null(best)) return(none("no_fit"))
  theta <- best
  if (ypow > 0) {
    # Weights from the fitted curve (1/Y, 1/Y^2), iterated from the unweighted fit (#100).
    curve_at <- function(th) bs_global_curve(x, bs_global_params(th, map, held)[g, , drop = FALSE])
    for (it in 1:200) {
      f <- curve_at(theta)
      if (any(!is.finite(f)) || any(f <= 0)) return(none("weights"))
      w <- f^-ypow
      nxt <- bs_global_lm(x, y, w, g, map, held, theta)
      if (is.null(nxt)) return(none("no_fit"))
      change <- max(abs(nxt - theta) / pmax(abs(theta), 1e-8))
      theta <- nxt
      if (change < 1e-12) break
    }
    f <- curve_at(theta)
    if (any(!is.finite(f)) || any(f <= 0)) return(none("weights"))
    w <- f^-ypow
  }
  P <- bs_global_params(theta, map, held)
  # A plateau far beyond the data or a LogEC50 far outside the dose range is
  # the optimiser running off to infinity: the data don't define the curve.
  span <- diff(range(x))
  if (any(abs(P[, 2] - P[, 1]) > 100 * diff(range(y))) ||
      any(P[, 3] < min(x) - 10 * span | P[, 3] > max(x) + 10 * span)) {
    return(none("no_fit"))
  }
  J <- sqrt(w) * bs_global_jacobian(x, g, theta, map, held)
  A <- crossprod(J)
  Ainv <- tryCatch(solve(A), error = function(e) NULL)
  if (is.null(Ainv) || any(!is.finite(Ainv))) return(none("no_fit"))
  df <- n - m
  resid <- y - bs_global_curve(x, P[g, , drop = FALSE])
  ss_all <- sum(w * resid^2)
  s2 <- ss_all / df
  se <- sqrt(s2 * diag(Ainv))
  dependency <- pmax(0, 1 - 1 / (diag(A) * diag(Ainv)))
  t <- qt(0.975, df)
  series <- vector("list", k)
  for (i in seq_len(k)) {
    if (ns[i] == 0) {
      series[[i]] <- empty(i, "few", 1)
      next
    }
    u <- match(i, use)
    rows <- which(g == u)
    xi <- x[rows]
    yi <- y[rows]
    ri <- resid[rows]
    wi <- w[rows]
    ord <- order(xi)
    ssi <- sum(wi * ri^2)
    param <- function(j) {
      th <- map[u, j]
      if (th == 0) return(bs_fpl_held(P[u, j], "fixed"))
      bs_fpl_param(P[u, j], se[th], t, dependency[th])
    }
    logec50 <- param(3)
    grid <- seq(min(xi), max(xi), length.out = 100)
    G4 <- bs_global_jacobian4(grid, matrix(P[u, ], length(grid), 4, byrow = TRUE))
    on <- which(map[u, ] > 0)
    Gi <- G4[, on, drop = FALSE]
    Ai <- Ainv[map[u, on], map[u, on], drop = FALSE]
    cg <- rowSums((Gi %*% Ai) * Gi)
    fit_grid <- bs_global_curve(grid, matrix(P[u, ], length(grid), 4, byrow = TRUE))
    band_half <- function(v) {
      G4v <- bs_global_jacobian4(v, matrix(P[u, ], length(v), 4, byrow = TRUE))[, on, drop = FALSE]
      t * sqrt(rowSums((G4v %*% Ai) * G4v) * s2)
    }
    w_new <- vapply(grid, function(v) wi[which.min(abs(xi - v))], 0)
    ri_ord <- ri[ord]
    series[[i]] <- list(
      n = ns[i], dropped = dropped[i], ran = TRUE,
      bottom = param(1), top = param(2), logec50 = logec50, hill = param(4),
      ec50 = 10^P[u, 3], ec50_lower = 10^logec50$lower, ec50_upper = 10^logec50$upper,
      df = df, ss = ssi, syx = sqrt(s2), r2 = 1 - ssi / sum(wi * (yi - weighted.mean(yi, wi))^2),
      x = unlogs[[i]](xi[ord]), y = yi[ord], fitted = (yi - ri)[ord], residual = ri_ord,
      runs = bs_runs_test(sign(ri_ord)[sign(ri_ord) != 0]),
      band = list(
        x = unlogs[[i]](grid), fit = fit_grid,
        confidence_lower = fit_grid - t * sqrt(cg * s2),
        confidence_upper = fit_grid + t * sqrt(cg * s2),
        prediction_lower = fit_grid - t * sqrt((cg + 1 / w_new) * s2),
        prediction_upper = fit_grid + t * sqrt((cg + 1 / w_new) * s2)
      ),
      unknowns = bs_interpolate(
        if (is.null(unknowns)) numeric(0) else unknowns[[i]], P[u, ],
        diff(range(xi)), band_half, unlogs[[i]]
      )
    )
  }
  list(
    series = series,
    global = list(n = n, parameters = m, df = df, ss = ss_all, syx = sqrt(s2))
  )
}

# x, y: every series' points, concatenated; g: each point's series (1..k).
# w: each point's weight (1 = unweighted; 1/X, 1/X^2 and 1/SD^2 weights are
# worked out from the table by the caller); ypow: 1 or 2 when the weights are
# 1/Y or 1/Y^2 of the fitted curve (then w is ones). u, ug: Y values to
# interpolate and the series each belongs to (#100).
# log_x: X is already log10(dose) (Prism's model); otherwise X is a dose,
# fit against its log10, and a dose <= 0 (no log) is left out and counted.
# lo, hi: bounds on (Bottom, Top, HillSlope), used where has_lo / has_hi;
# a fixed parameter has lo == hi (#96).
# cmp_val, cmp_has: the simpler model of a comparison (#98): where it holds
# (Bottom, Top, HillSlope), used where cmp_has; nothing if none is.
# shared: which of (Bottom, Top, LogEC50, HillSlope) are one value for all
# the data sets (#97); any at all makes it one stacked fit.
# alt_*: the other fit of a comparison of models or of shared vs. separate
# (#105), in the same terms as lo .. shared; alt_role: 0 none, 1 the other
# is a special case of the fit, 2 the fit is a special case of the other,
# 3 neither (AICc only). If either fit shares anything the comparison is of
# the two stacked fits (one, at the top level); else one per data set.
bs_nonlinear_regression <- function(x, y, w, g, k, log_x, lo, hi, has_lo, has_hi,
                                    cmp_val = c(0, 0, 0), cmp_has = c(0, 0, 0),
                                    shared = c(0, 0, 0, 0),
                                    alt_lo = lo, alt_hi = hi, alt_has_lo = has_lo,
                                    alt_has_hi = has_hi, alt_shared = shared, alt_role = 0,
                                    ypow = 0, u = numeric(0), ug = numeric(0)) {
  lo <- ifelse(has_lo != 0, lo, -Inf)
  hi <- ifelse(has_hi != 0, hi, Inf)
  lower <- c(lo[1], lo[2], -Inf, lo[3])
  upper <- c(hi[1], hi[2], Inf, hi[3])
  alo <- ifelse(alt_has_lo != 0, alt_lo, -Inf)
  ahi <- ifelse(alt_has_hi != 0, alt_hi, Inf)
  alt_lower <- c(alo[1], alo[2], -Inf, alo[3])
  alt_upper <- c(ahi[1], ahi[2], Inf, ahi[3])
  held <- c(1, 2, 4)[cmp_has != 0]
  if (length(held) > 0) {
    alt_lower[held] <- cmp_val[cmp_has != 0]
    alt_upper[held] <- cmp_val[cmp_has != 0]
  }
  role <- if (length(held) > 0) 1 else alt_role
  parts <- lapply(seq_len(k), function(i) {
    xi <- x[g == i]
    yi <- y[g == i]
    wi <- w[g == i]
    ui <- u[ug == i]
    if (log_x) return(list(x = xi, y = yi, w = wi, unlog = identity, dropped = 0, u = ui))
    keep <- xi > 0
    list(
      x = log10(xi[keep]), y = yi[keep], w = wi[keep], unlog = function(v) 10^v,
      dropped = sum(!keep), u = ui
    )
  })
  stacked <- function(sh, lw, up, unknowns = NULL) {
    bs_global_fit(
      lapply(parts, `[[`, "x"), lapply(parts, `[[`, "y"), lapply(parts, `[[`, "w"),
      lapply(parts, `[[`, "unlog"), vapply(parts, `[[`, 0, "dropped"), sh != 0, lw, up, ypow,
      unknowns
    )
  }
  if (any(shared != 0) || (role > 0 && any(alt_shared != 0))) {
    fit <- stacked(shared, lower, upper, lapply(parts, `[[`, "u"))
    if (role > 0 && !is.null(fit$global)) {
      alt <- stacked(alt_shared, alt_lower, alt_upper)
      fit$comparison <- if (is.null(alt$global)) {
        list(ran = FALSE, why = "no_fit")
      } else {
        cx <- if (role == 2) alt$global else fit$global
        sm <- if (role == 2) fit$global else alt$global
        st <- bs_compare_stats(cx, sm, fit$global$n, role != 3)
        if (is.null(st)) {
          list(ran = FALSE, why = "worse")
        } else {
          list(
            ran = TRUE, simpler = list(ss = sm$ss, df = sm$df),
            f_test = st$f_test, aicc = st$aicc
          )
        }
      }
    }
    return(fit)
  }
  one <- function(part) {
    fit <- bs_fpl_one(part$x, part$y, part$w, part$unlog, part$dropped, lower, upper, ypow, part$u)
    if (role == 0 || !isTRUE(fit$ran)) return(fit)
    alt <- bs_fpl_one(part$x, part$y, part$w, part$unlog, part$dropped, alt_lower, alt_upper, ypow)
    fit$comparison <- if (!isTRUE(alt$ran)) {
      list(ran = FALSE, why = "no_fit")
    } else if (role == 2) {
      bs_fpl_compare(alt, fit, length(part$x))
    } else {
      bs_fpl_compare(fit, alt, length(part$x), role != 3)
    }
    fit
  }
  list(series = lapply(parts, one))
}
