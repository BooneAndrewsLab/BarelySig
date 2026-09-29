# Fixtures for nonlinear regression, Prism's "log(agonist) vs. response --
# Variable slope" four-parameter logistic (item 32, #37).
#
# Independent of analysis.R (CLAUDE.md): no nls() here. The reference fit
# is a coarse grid over (LogEC50, HillSlope) with the plateaus by linear
# least squares, polished by a hand-written Levenberg-Marquardt using a
# five-point finite-difference Jacobian (the app uses nls "plinear" and an analytic
# one); SEs, CIs, dependency and bands come from that same numerical
# Jacobian. Base R only, so the parity test reruns it in WebR.
#
# Each case's `check` then fits the same data with drc::drm(fct = L.4())
# -- another package, parameterization (c + (d - c) / (1 + exp(b (x - e))),
# so HillSlope = -b / ln 10) and optimizer -- and requires the same
# optimum: its estimates within 1e-2, and polished from them by the
# reference's own LM, the same point to 1e-6 -- both found the same, global
# optimum, not just a local one; and checks
# the runs test against randtests::runs.test. drc's own SEs use the full
# Hessian rather than Prism's J'J, so they aren't compared.
#
# Constraints (#96): Bottom, Top and HillSlope may be held at a constant
# (lower == upper) or bounded. The reference then runs a projected
# Levenberg-Marquardt (steps clipped to the bounds) on the free parameters,
# holds any that end exactly on a bound, and refits the rest; a parameter on
# a bound is reported as "at_bound" without SE, CI or dependency, and df =
# n - the parameters left to estimate. drc is given the same constraints
# (`fixed =` for constants, lowerl/upperl for limits), and `check` verifies
# the Kuhn-Tucker condition at every bound the fit sits on (the sum of
# squares can only rise by moving inward), which is what makes "at the
# bound" the optimum rather than an artefact of the optimiser.

reference <- quote({
  ref_curve <- function(x, p) p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - x) * p[4]))
  # Five-point central differences: truncation error ~h^4 and rounding
  # ~eps/h, both far below what a 1e-6 comparison of near-zero residuals
  # needs (a plain central difference left the optimum ~1e-10 off).
  ref_jacobian <- function(x, p) {
    sapply(1:4, function(j) {
      h <- 1e-4
      at <- function(k) {
        q <- p
        q[j] <- p[j] + k * h
        ref_curve(x, q)
      }
      (at(-2) - 8 * at(-1) + 8 * at(1) - at(2)) / (12 * h)
    })
  }
  ref_runs <- function(s) {
    n1 <- sum(s > 0)
    n2 <- sum(s < 0)
    if (n1 + n2 < 2) return(list(ran = FALSE, why = "few", n_pos = n1, n_neg = n2))
    if (n1 == 0 || n2 == 0) return(list(ran = FALSE, why = "same", n_pos = n1, n_neg = n2))
    r <- 1 + sum(s[-1] != s[-length(s)])
    m <- 2 * n1 * n2 / (n1 + n2) + 1
    v <- (m - 1) * (m - 2) / (n1 + n2 - 1)
    z <- (r - m) / sqrt(v)
    list(ran = TRUE, n_runs = r, n_pos = n1, n_neg = n2, z = z, p = 2 * pnorm(-abs(z)))
  }
  ref_optimum <- function(x, y, start = NULL, lower = rep(-Inf, 4), upper = rep(Inf, 4), w = rep(1, length(x))) {
    sw <- sqrt(w)
    fixed <- lower == upper
    best <- c(Inf, NA, NA, NA, NA)
    if (!is.null(start)) best <- c(0, start)
    hills <- c(-seq(0.1, 5, by = 0.05), seq(0.1, 5, by = 0.05))
    if (fixed[4]) hills <- lower[4] else hills <- hills[hills >= lower[4] & hills <= upper[4]]
    if (is.null(start)) for (l in seq(min(x), max(x), length.out = 41)) {
      for (h in hills) {
        f <- 1 / (1 + 10^((l - x) * h))
        X <- cbind(1 - f, f)
        # Fixed plateaus move to the left-hand side; the free ones are least squares, clipped to their bounds.
        co <- c(lower[1], lower[2])
        free <- !fixed[1:2]
        if (any(free)) {
          fit <- qr.coef(qr(sw * X[, free, drop = FALSE]), sw * (y - X[, !free, drop = FALSE] %*% co[!free]))
          if (any(!is.finite(fit))) next
          co[free] <- pmin(pmax(fit, lower[1:2][free]), upper[1:2][free])
        }
        rss <- sum(w * (y - X %*% co)^2)
        if (rss < best[1]) best <- c(rss, co, l, h)
      }
    }
    # unname(): a named number comes back from WebR as an object (CLAUDE.md).
    p <- unname(best[2:5])
    p <- pmin(pmax(p, lower), upper)
    rss <- function(p) sum(w * (y - ref_curve(x, p))^2)
    # Projected Levenberg-Marquardt on the parameters `idx`: a step that would
    # leave the bounds is clipped to them.
    lm <- function(p, idx) {
      lambda <- 1e-3
      for (it in 1:1000) {
        J <- sw * ref_jacobian(x, p)[, idx, drop = FALSE]
        A <- crossprod(J)
        step <- tryCatch(
          unname(drop(solve(A + lambda * diag(diag(A), length(idx)), crossprod(J, sw * (y - ref_curve(x, p)))))),
          error = function(e) NULL
        )
        if (is.null(step) || any(!is.finite(step))) {
          lambda <- lambda * 10
          if (lambda > 1e12) break
          next
        }
        q <- p
        q[idx] <- pmin(pmax(p[idx] + step, lower[idx]), upper[idx])
        if (rss(q) <= rss(p)) {
          moved <- max(abs(q - p) / pmax(abs(q), 1e-8))
          p <- q
          lambda <- lambda / 10
          if (moved < 1e-14) break
        } else {
          lambda <- lambda * 10
        }
        if (lambda > 1e12) break
      }
      p
    }
    idx <- which(!fixed)
    p <- lm(p, idx)
    # Parameters the projected steps left exactly on a bound are held there;
    # the rest are refit, and converge with plain steps once close.
    idx <- which(!fixed & p > lower & p < upper)
    p <- lm(p, idx)
    # Near the optimum the sum of squares changes by less than its own
    # rounding, so the LM above can stall a hair short of it; plain
    # Gauss-Newton steps converge the rest of the way.
    for (it in 1:5) {
      J <- sw * ref_jacobian(x, p)[, idx, drop = FALSE]
      gn <- unname(drop(qr.coef(qr(J), sw * (y - ref_curve(x, p)))))
      if (all(is.finite(gn))) p[idx] <- p[idx] + gn
    }
    if (all(is.infinite(c(lower, upper))) && p[1] > p[2]) p <- c(p[2], p[1], p[3], -p[4])
    p
  }
  ref_param <- function(value, se, t, dependency) {
    list(
      value = value, status = "fitted", se = se, lower = value - t * se, upper = value + t * se,
      dependency = dependency, ambiguous = dependency > 0.9999
    )
  }
  ref_held <- function(value, status) list(value = value, status = status, ambiguous = FALSE)
  # dose: X as entered; log_x: whether it is already log10(dose).
  # A constraint per parameter: one number = held at it, two = (lower, upper)
  # limits with NA for none, nothing = free. Bounds on (Bottom, Top, LogEC50,
  # HillSlope); a held parameter has lower == upper.
  limits <- function(bottom = NULL, top = NULL, hill = NULL) {
    one <- function(v) {
      if (is.null(v)) return(c(-Inf, Inf))
      if (length(v) == 1) return(c(v, v))
      c(if (is.na(v[1])) -Inf else v[1], if (is.na(v[2])) Inf else v[2])
    }
    b <- one(bottom); t <- one(top); h <- one(hill)
    list(lower = c(b[1], t[1], -Inf, h[1]), upper = c(b[2], t[2], Inf, h[2]))
  }
  # Interpolation (#100): the X where the curve reads y0, by root finding on
  # the curve itself (not the closed-form inverse), and a 95% CI where the
  # curve's 95% confidence bands cross y0 (Prism's method). `half(v)`: the
  # band's half-width at log X v. A Y at or beyond a plateau has no X.
  ref_interpolate <- function(y0, p, half, span, back) {
    res <- function(status, x = NA_real_, lower = NA_real_, upper = NA_real_) {
      list(y = y0, status = status, x = x, lower = lower, upper = upper)
    }
    f <- (y0 - p[1]) / (p[2] - p[1])
    if (f <= 0) return(res("beyond-bottom"))
    if (f >= 1) return(res("beyond-top"))
    reach <- 5 * max(span, 1)
    xh <- uniroot(function(v) ref_curve(v, p) - y0, p[3] + c(-1, 1) * 30 / abs(p[4]), tol = 1e-14)$root
    edge <- function(sgn, dir) {
      fun <- function(v) ref_curve(v, p) + sgn * half(v) - y0
      v <- xh + dir * reach * (0:2000) / 2000
      s0 <- sign(fun(v))
      hit <- which(s0[-1] != s0[1])
      if (length(hit) == 0) return(NA_real_)
      uniroot(fun, sort(v[hit[1] + 0:1]), tol = 1e-13)$root
    }
    rising <- (p[2] - p[1]) * p[4] > 0
    lo <- edge(if (rising) 1 else -1, -1)
    hi <- edge(if (rising) -1 else 1, 1)
    res("ok", back(xh), back(lo), back(hi))
  }
  # Profile-likelihood CIs (#99, note 41): for each estimated parameter, the
  # values where the profiled sum of squares (the others refitted by the
  # reference's own projected LM, the parameter held via lower == upper)
  # reaches SS0 * (1 + qf(0.95, 1, df) / df). A scan outward in fixed multiples
  # of the Wald SE finds the bracket, base uniroot the root; a side still
  # under the threshold at 1e6 SEs is open (NA).
  ref_profile <- function(x, y, w, p, idx, se, lower, upper) {
    df <- length(x) - length(idx)
    ss_of <- function(q) sum(w * (y - ref_curve(x, q))^2)
    thr <- ss_of(p) * (1 + qf(0.95, 1, df) / df)
    refit <- function(i, theta, start) {
      lo <- lower
      up <- upper
      lo[i] <- theta
      up[i] <- theta
      q <- start
      q[i] <- theta
      ref_optimum(x, y, start = q, lower = lo, upper = up, w = w)
    }
    mult <- c(0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64, 128, 1e3, 1e4, 1e5, 1e6)
    out <- vector("list", 4)
    for (j in seq_along(idx)) {
      i <- idx[j]
      side <- function(dir) {
        prev <- p
        prev_theta <- p[i]
        for (m in mult) {
          theta <- p[i] + dir * m * se[j]
          q <- refit(i, theta, prev)
          if (ss_of(q) > thr) {
            g <- function(t) ss_of(refit(i, t, prev)) - thr
            return(uniroot(g, sort(c(prev_theta, theta)), tol = 1e-13 * max(1, abs(p[i]), m * se[j]))$root)
          }
          prev <- q
          prev_theta <- theta
        }
        NA_real_
      }
      out[[i]] <- list(lower = side(-1), upper = side(1))
    }
    out
  }
  # dose: X as entered; w: static weights per row (1 = none), ypow: 1 or 2 for
  # 1/Y or 1/Y^2 (weights from the fitted curve, refitted until they settle,
  # from an unweighted start); unknown: Y values to read off the curve.
  run_fpl_one <- function(dose, y, log_x = TRUE, bounds = limits(), w = NULL, ypow = 0, unknown = numeric(0), profile = FALSE) {
    lower <- bounds$lower
    upper <- bounds$upper
    if (is.null(w)) w <- rep(1, length(dose))
    dropped <- if (log_x) 0 else sum(dose <= 0)
    if (!log_x) {
      y <- y[dose > 0]
      w <- w[dose > 0]
      dose <- dose[dose > 0]
    }
    x <- if (log_x) dose else log10(dose)
    back <- if (log_x) function(v) v else function(v) 10^v
    n <- length(x)
    fixed <- lower == upper
    p <- ref_optimum(x, y, lower = lower, upper = upper, w = w)
    if (ypow > 0) {
      for (it in 1:500) {
        w <- ref_curve(x, p)^-ypow
        q <- ref_optimum(x, y, start = p, lower = lower, upper = upper, w = w)
        moved <- max(abs(q - p) / pmax(abs(p), 1e-8))
        p <- q
        if (moved < 1e-13) break
      }
      w <- ref_curve(x, p)^-ypow
    }
    sw <- sqrt(w)
    idx <- which(!fixed & p > lower & p < upper)
    J <- sw * ref_jacobian(x, p)[, idx, drop = FALSE]
    A <- crossprod(J)
    Ainv <- solve(A)
    fitted <- ref_curve(x, p)
    resid <- y - fitted
    df <- n - length(idx)
    ss <- sum(w * resid^2)
    s2 <- ss / df
    se <- sqrt(s2 * diag(Ainv))
    dependency <- 1 - 1 / (diag(A) * diag(Ainv))
    t <- qt(0.975, df)
    ord <- order(x)
    signs <- sign(resid[ord])
    grid <- seq(min(x), max(x), length.out = 100)
    half <- function(v) {
      G <- matrix(ref_jacobian(v, p), length(v))[, idx, drop = FALSE]
      t * sqrt(vapply(seq_along(v), function(i) drop(G[i, ] %*% Ainv %*% G[i, ]), 0) * s2)
    }
    half_grid <- half(grid)
    # A new observation is assumed to weigh what the nearest measured X does.
    w_new <- vapply(grid, function(v) w[which.min(abs(x - v))], 0)
    fit_grid <- ref_curve(grid, p)
    prof <- if (profile) ref_profile(x, y, w, p, idx, se, lower, upper) else NULL
    par <- function(i) {
      j <- match(i, idx)
      if (is.na(j)) return(ref_held(p[i], if (fixed[i]) "fixed" else "at_bound"))
      r <- ref_param(p[i], se[j], t, dependency[j])
      if (!is.null(prof)) {
        r$lower <- prof[[i]]$lower
        r$upper <- prof[[i]]$upper
      }
      r
    }
    j3 <- match(3, idx)
    list(
      n = n, dropped = dropped, ran = TRUE,
      bottom = par(1), top = par(2), logec50 = par(3), hill = par(4),
      ec50 = 10^p[3],
      ec50_lower = if (is.null(prof)) 10^(p[3] - t * se[j3]) else 10^prof[[3]]$lower,
      ec50_upper = if (is.null(prof)) 10^(p[3] + t * se[j3]) else 10^prof[[3]]$upper,
      ci_method = if (is.null(prof)) "wald" else "profile",
      df = df, ss = ss, syx = sqrt(s2), r2 = 1 - ss / sum(w * (y - weighted.mean(y, w))^2),
      x = back(x[ord]), y = y[ord], fitted = fitted[ord], residual = resid[ord],
      runs = ref_runs(signs[signs != 0]),
      band = list(
        x = back(grid), fit = fit_grid,
        confidence_lower = fit_grid - half_grid,
        confidence_upper = fit_grid + half_grid,
        prediction_lower = fit_grid - t * sqrt((half_grid / t)^2 + s2 / w_new),
        prediction_upper = fit_grid + t * sqrt((half_grid / t)^2 + s2 / w_new)
      ),
      unknowns = lapply(unknown, function(y0) ref_interpolate(y0, p, half, diff(range(x)), back))
    )
  }
  # Model comparison (#98): the fit against the same curve with some
  # parameters held at constants (`alt`, limits() of the simpler model, the
  # fit's own constraints included), by the textbook formulas:
  #   F = ((SS_simple - SS_fit) / (df_simple - df_fit)) / (SS_fit / df_fit)
  #   AICc = n ln(SS/n) + 2K + 2K(K+1)/(n - K - 1), K = parameters + 1
  # and Akaike weights exp(-delta/2) / sum. P from pf(lower.tail = FALSE): 1 - pf()
  # loses a small P's digits.
  run_fpl <- function(dose, y, log_x = TRUE, bounds = limits(), alt = NULL, w = NULL, ypow = 0, unknown = numeric(0), profile = FALSE) {
    fit <- run_fpl_one(dose, y, log_x, bounds, w, ypow, unknown, profile)
    if (is.null(alt) || !isTRUE(fit$ran)) return(fit)
    s <- run_fpl_one(dose, y, log_x, alt, w)
    n <- fit$n
    aicc <- function(ss, df) {
      k <- (n - df) + 1
      n * log(ss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1)
    }
    df_num <- s$df - fit$df
    f_test <- if (fit$ss <= 0) {
      list(ok = FALSE, why = "exact_fit")
    } else if (df_num < 1 || fit$df < 1) {
      list(ok = FALSE, why = "no_extra")
    } else {
      f <- ((s$ss - fit$ss) / df_num) / (fit$ss / fit$df)
      list(ok = TRUE, f = f, df_num = df_num, df_den = fit$df,
        p = pf(f, df_num, fit$df, lower.tail = FALSE))
    }
    k_fit <- (n - fit$df) + 1
    k_alt <- (n - s$df) + 1
    a <- if (n - k_fit - 1 <= 0 || n - k_alt - 1 <= 0 || fit$ss <= 0) {
      list(ok = FALSE)
    } else {
      a_fit <- aicc(fit$ss, fit$df)
      a_alt <- aicc(s$ss, s$df)
      w <- exp(-0.5 * (c(a_fit, a_alt) - min(a_fit, a_alt)))
      list(ok = TRUE, fit = a_fit, simpler = a_alt, prob_fit = w[1] / sum(w), prob_simpler = w[2] / sum(w))
    }
    fit$comparison <- list(
      ran = TRUE,
      simpler = list(
        bottom = s$bottom$value, top = s$top$value, logec50 = s$logec50$value, hill = s$hill$value,
        ec50 = s$ec50, ss = s$ss, df = s$df
      ),
      f_test = f_test, aicc = a
    )
    fit
  }
})

# The comparison agrees with R's own anova() and AIC() on nls fits of the
# same two models, started at the reported optima (base R, other code paths
# from ours; AIC's constant n(ln 2pi + 1) cancels between models, so only
# differences are compared). Tolerance is looser than the fixtures': nls
# stops at its own tolerance a hair from the reference optimum.
compare_agrees <- function(dose, y, expected, log_x, bounds, alt, w = NULL) {
  x <- if (log_x) dose else log10(dose)
  if (is.null(w)) w <- rep(1, length(dose))
  if (!log_x) y <- y[dose > 0]
  if (!log_x) x <- x[dose > 0]
  if (!log_x) w <- w[dose > 0]
  cmp <- expected$comparison
  ref <- function(p) function(x) p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - x) * p[4]))
  build <- function(lim, p) {
    fixed <- lim$lower == lim$upper
    terms <- ifelse(fixed, format(lim$lower, digits = 17), c("b", "t", "l", "h"))
    fml <- as.formula(paste0("y ~ (", terms[1], ") + ((", terms[2], ") - (", terms[1], ")) / (1 + 10^(((", terms[3], ") - x) * (", terms[4], ")))"))
    nls(fml, start = as.list(setNames(p, c("b", "t", "l", "h"))[!fixed]), weights = w,
      control = nls.control(maxiter = 50, tol = 1e-7, scaleOffset = 1, warnOnly = TRUE))
  }
  m_fit <- build(bounds, c(expected$bottom$value, expected$top$value, expected$logec50$value, expected$hill$value))
  m_alt <- build(alt, c(cmp$simpler$bottom, cmp$simpler$top, cmp$simpler$logec50, cmp$simpler$hill))
  close <- function(a, b, tol = 1e-4) abs(a - b) <= tol * max(abs(b), 1e-300)
  stopifnot(close(deviance(m_fit), expected$ss), close(deviance(m_alt), cmp$simpler$ss),
    df.residual(m_fit) == expected$df, df.residual(m_alt) == cmp$simpler$df)
  if (cmp$f_test$ok) {
    a <- anova(m_alt, m_fit)
    stopifnot(close(a$F[2], cmp$f_test$f), close(a$`Pr(>F)`[2], cmp$f_test$p, 1e-3), a$Df[2] == cmp$f_test$df_num)
  }
  if (cmp$aicc$ok) {
    n <- length(y)
    corrected <- function(m) {
      k <- attr(logLik(m), "df")
      AIC(m) + 2 * k * (k + 1) / (n - k - 1)
    }
    stopifnot(abs((corrected(m_alt) - corrected(m_fit)) - (cmp$aicc$simpler - cmp$aicc$fit)) < 1e-4 * max(1, abs(cmp$aicc$simpler - cmp$aicc$fit)))
  }
  TRUE
}

# drc agrees on the optimum; randtests on the runs test. x: the log doses
# actually fitted; ref_optimum: the reference fit, from the case's setup.
# bounds: the case's constraints, from limits() in the reference setup.
drc_agrees <- function(x, y, expected, ref_optimum, bounds = list(lower = rep(-Inf, 4), upper = rep(Inf, 4)), w = NULL) {
  if (is.null(w)) w <- rep(1, length(x))
  lower <- bounds$lower
  upper <- bounds$upper
  fixed <- lower == upper
  # drc's parameters are b (= -HillSlope * ln 10), c (Bottom), d (Top), e (LogEC50).
  fixed_b <- c(NA, if (fixed[1]) lower[1] else NA, if (fixed[2]) lower[2] else NA, NA)
  if (fixed[4]) fixed_b[1] <- -lower[4] * log(10)
  lowerl <- c(-upper[4] * log(10), lower[1], lower[2], -Inf)
  upperl <- c(-lower[4] * log(10), upper[1], upper[2], Inf)
  free <- is.na(fixed_b)
  d <- if (all(is.infinite(c(lower, upper)))) {
    drm(y ~ x, weights = sqrt(w), fct = L.4(), control = drmc(relTol = 1e-12, maxIt = 10000))
  } else {
    drm(y ~ x, weights = sqrt(w), fct = L.4(fixed = fixed_b), lowerl = lowerl[free], upperl = upperl[free],
      control = drmc(relTol = 1e-12, maxIt = 10000))
  }
  b <- fixed_b
  b[free] <- unname(coef(d))
  drc_p <- c(b[2], b[3], b[4], -b[1] / log(10))
  if (all(is.infinite(c(lower, upper))) && drc_p[1] > drc_p[2]) {
    drc_p <- c(drc_p[2], drc_p[1], drc_p[3], -drc_p[4])
  }
  ours <- c(expected$bottom$value, expected$top$value, expected$logec50$value, expected$hill$value)
  # drc's optim stops short of the optimum on a flat valley; polished from
  # where it stopped, it must land on the same optimum as the reference.
  polished <- ref_optimum(x, y, start = drc_p, lower = lower, upper = upper, w = w)
  rel <- abs(polished - ours) / pmax(abs(ours), 1e-8)
  if (max(rel) > 1e-6) stop("drc's optimum differs: ", paste(signif(drc_p, 8), collapse = ", "), " vs ours ", paste(signif(ours, 8), collapse = ", "), " polished ", paste(signif(polished, 8), collapse = ", "))
  if (max(abs(drc_p - ours) / pmax(abs(ours), 1e-8)) > 1e-2) stop("drc is far off: ", paste(signif(drc_p, 8), collapse = ", "))
  s <- sign(expected$residual)
  if (isTRUE(expected$runs$ran)) {
    rt <- runs.test(s[s != 0], threshold = 0)
    stopifnot(
      rt$runs == expected$runs$n_runs,
      abs(rt$p.value - expected$runs$p) < 1e-10 * max(1, rt$p.value)
    )
  } else {
    stopifnot(length(unique(s[s != 0])) < 2 || sum(s != 0) < 2) # nothing to test: one sign only
  }
  # Kuhn-Tucker at every limit the fit sits on: the sum of squares can only
  # rise by moving inward (its gradient points inward there).
  ref_curve <- function(x, p) p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - x) * p[4]))
  rss <- function(p) sum(w * (y - ref_curve(x, p))^2)
  for (i in which(!fixed)) {
    if (ours[i] == lower[i] || ours[i] == upper[i]) {
      h <- 1e-6 * max(1, abs(ours[i]))
      inward <- if (ours[i] == lower[i]) h else -h
      q <- ours
      q[i] <- q[i] + inward
      if (!(rss(q) > rss(ours))) stop("parameter ", i, " sits on a limit it could leave")
    }
  }
  # With nothing on a limit, drc's degrees of freedom are ours.
  if (!any(expected$bottom$status == "at_bound", expected$top$status == "at_bound", expected$hill$status == "at_bound")) {
    stopifnot(df.residual(d) == expected$df)
  }
  TRUE
}

fixture("rising",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum), check_packages = c("drc", "randtests"),
  options = list(x = "log"),
  note = "A rising curve in triplicate across 5 log units, both plateaus well defined: the sanity case for every reported number.")

fixture("falling",
  input = list(
    dose = c(-10, -10, -9.5, -9.5, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5),
    y = c(102.1, 98.09, 105.861, 102.554, 91.793, 92.734, 97.061, 94.949, 88.562, 82.085, 66.684, 60.547, 45.538, 51.583, 29.042, 29.358, 23.183, 19.333, 20.124, 17.618, 12.954, 6.86)
  ),
  expr = run_fpl(dose, y), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum), check_packages = c("drc", "randtests"),
  options = list(x = "log"),
  note = "A falling (inhibition) curve in duplicate: HillSlope comes out negative with Bottom < Top, the form Prism reports for this model.")

fixture("concentration",
  input = list(
    dose = c(0, 0, 1e-10, 1e-10, 3e-10, 3e-10, 1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06),
    y = c(0.199, 0.104, 0.275, 0.181, 0.216, 0.162, 0.379, 0.306, 0.616, 0.597, 1.175, 1.146, 1.676, 1.859, 1.691, 1.995, 1.972, 1.812, 1.998, 1.934)
  ),
  expr = run_fpl(dose, y, log_x = FALSE), setup = reference,
  check = drc_agrees(log10(dose[dose > 0]), y[dose > 0], expected, ref_optimum), check_packages = c("drc", "randtests"),
  options = list(x = "concentration"),
  note = "Molar concentrations with a zero-dose control in duplicate: fit against log10(dose), the two zero-dose points left out and counted, EC50 (about 8e-9 M) kept at its magnitude; residuals and band in the table's own units.")

fixture("tiny-ec50",
  input = list(
    dose = c(-14, -13.6, -13.2, -12.8, -12.4, -12, -11.6, -11.2, -10.8, -10.4, -10),
    y = c(737.723, 1150.136, 1159.753, 1471.001, 2213.309, 3575.24, 4655.509, 4903.662, 5016.579, 5316.403, 5139.133)
  ),
  expr = run_fpl(dose, y), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum), check_packages = c("drc", "randtests"),
  options = list(x = "log"),
  note = "LogEC50 near -12 (EC50 about 1e-12) and responses in the thousands, one point per dose: the EC50 and its CI keep their magnitude.")

fixture("outlier",
  input = list(
    dose = c(-8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -3.5, -3),
    y = c(0.107, 5.367, 4.885, 55.345, 33.887, 56.797, 79.799, 98.645, 98.407, 99.117, 99.227)
  ),
  expr = run_fpl(dose, y), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum), check_packages = c("drc", "randtests"),
  options = list(x = "log"),
  note = "One point (dose -6.5) about 45 units too high: a large residual, and the runs test on what's left.")

fixture("one-plateau",
  input = list(dose = c(-9, -8, -7, -6, -5, -4), y = c(3.065, 2.931, 3.169, 4.152, 17.677, 66.327)),
  expr = run_fpl(dose, y), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum), check_packages = c("drc", "randtests"),
  options = list(x = "log"),
  note = "Six doses that reach the bottom plateau but stop before the top one: the fit converges, but Top, LogEC50 and HillSlope depend on each other strongly (dependency about 0.998, just under Prism's 0.9999 'ambiguous' line) and their CIs are wide.")

fixture("half-curve",
  input = list(
    dose = c(-9, -8.7, -8.4, -8.1, -7.8, -7.5, -7.2, -6.9, -6.6, -6.3, -6),
    y = c(2.513, 1.717, 1.386, 5.129, 3.299, 5.747, 4.781, 5.427, 11.595, 15.921, 25.989)
  ),
  expr = list(n = 11, dropped = 0, ran = FALSE, why = "no_fit"),
  setup = reference,
  check = {
    # The least-squares 'optimum' runs off -- a top plateau far beyond any
    # data -- or, polished, the Jacobian goes singular on the way there.
    p <- tryCatch(ref_optimum(dose, y), error = function(e) NA)
    any(!is.finite(p)) || abs(p[2] - p[1]) > 10 * diff(range(y))
  },
  options = list(x = "log"),
  note = "Doses that only reach the start of the rise: the data define no top plateau, the least-squares curve runs off to an unbounded Top, and the app reports that it could not fit rather than a number.")

fixture("n4",
  input = list(dose = c(-8, -7, -6, -5), y = c(2, 20, 80, 98)),
  expr = list(n = 4, dropped = 0, ran = FALSE, why = "few", minimum = 5),
  options = list(x = "log"),
  note = "Four points for four parameters: nothing left to estimate scatter from.")

fixture("three-doses",
  input = list(dose = c(-8, -8, -7, -7, -6, -6), y = c(2, 4, 48, 53, 96, 99)),
  expr = list(n = 6, dropped = 0, ran = FALSE, why = "few_x", minimum = 4),
  options = list(x = "log"),
  note = "Six points at only three doses: four parameters can't be told apart through three dose levels.")

fixture("constant-y",
  input = list(dose = c(-9, -8, -7, -6, -5, -4), y = c(5, 5, 5, 5, 5, 5)),
  expr = list(n = 6, dropped = 0, ran = FALSE, why = "constant_y"),
  options = list(x = "log"),
  note = "Y never varies: no curve to fit.")

# --- Constraints (#96) -----------------------------------------------------

fixture("bottom-zero",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0)), check_packages = c("drc", "randtests"),
  options = list(x = "log", bottom = list(kind = "fixed", value = 0)),
  note = "Bottom held at 0 (data already baseline-subtracted): three parameters estimated, df = n - 3, Bottom reported as fixed with no SE or CI.")

fixture("normalized",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0, top = 100)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0, top = 100)), check_packages = c("drc", "randtests"),
  options = list(x = "log", bottom = list(kind = "fixed", value = 0), top = list(kind = "fixed", value = 100)),
  note = "Percent-of-control data: Bottom = 0 and Top = 100 both held, so only LogEC50 and HillSlope are estimated (df = n - 2).")

fixture("hill-one",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(hill = 1)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(hill = 1)), check_packages = c("drc", "randtests"),
  options = list(x = "log", hillSlope = list(kind = "fixed", value = 1)),
  note = "HillSlope held at 1 (simple one-site binding): Bottom, Top and LogEC50 estimated.")

fixture("falling-hill-minus-one",
  input = list(
    dose = c(-10, -10, -9.5, -9.5, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5),
    y = c(102.1, 98.09, 105.861, 102.554, 91.793, 92.734, 97.061, 94.949, 88.562, 82.085, 66.684, 60.547, 45.538, 51.583, 29.042, 29.358, 23.183, 19.333, 20.124, 17.618, 12.954, 6.86)
  ),
  expr = run_fpl(dose, y, bounds = limits(hill = -1)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(hill = -1)), check_packages = c("drc", "randtests"),
  options = list(x = "log", hillSlope = list(kind = "fixed", value = -1)),
  note = "An inhibition curve with HillSlope held at -1: the sign of the held slope keeps the direction, and Bottom < Top.")

fixture("one-plateau-top-fixed",
  input = list(dose = c(-9, -8, -7, -6, -5, -4), y = c(3.065, 2.931, 3.169, 4.152, 17.677, 66.327)),
  expr = run_fpl(dose, y, bounds = limits(top = 100)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(top = 100)), check_packages = c("drc", "randtests"),
  options = list(x = "log", top = list(kind = "fixed", value = 100)),
  note = "Doses that never reach the top plateau, with Top held at 100: the dependency that made the free fit's CIs wide is gone, df = n - 3.")

fixture("bounds-inactive",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = c(0, NA), top = c(NA, 110), hill = c(0.5, 3))), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = c(0, NA), top = c(NA, 110), hill = c(0.5, 3))), check_packages = c("drc", "randtests"),
  options = list(
    x = "log",
    bottom = list(kind = "bounded", lower = 0, upper = NULL),
    top = list(kind = "bounded", lower = NULL, upper = 110),
    hillSlope = list(kind = "bounded", lower = 0.5, upper = 3)
  ),
  note = "Limits the best fit does not touch (Bottom >= 0, Top <= 110, 0.5 <= HillSlope <= 3): the same answer as the free fit, every parameter fitted, df = n - 4.")

fixture("bound-active-bottom",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = c(NA, 4))), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = c(NA, 4))), check_packages = c("drc", "randtests"),
  options = list(x = "log", bottom = list(kind = "bounded", lower = NULL, upper = 4)),
  note = "Bottom limited to at most 4 while the free fit puts it at about 6: the fit runs into the limit, Bottom is held at 4 and reported 'at_bound' without SE or CI, and df counts only the three parameters still estimated.")

fixture("bound-active-hill",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(top = c(NA, 90), hill = c(0.1, 0.9))), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(top = c(NA, 90), hill = c(0.1, 0.9))), check_packages = c("drc", "randtests"),
  options = list(
    x = "log",
    top = list(kind = "bounded", lower = NULL, upper = 90),
    hillSlope = list(kind = "bounded", lower = 0.1, upper = 0.9)
  ),
  note = "Two limits both reached (Top <= 90, HillSlope <= 0.9, kept positive): both held at their limit, only Bottom and LogEC50 estimated, df = n - 2.")

fixture("three-held",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0, top = 100, hill = 1)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0, top = 100, hill = 1)), check_packages = c("drc", "randtests"),
  options = list(
    x = "log",
    bottom = list(kind = "fixed", value = 0),
    top = list(kind = "fixed", value = 100),
    hillSlope = list(kind = "fixed", value = 1)
  ),
  note = "Everything but LogEC50 held (0, 100, slope 1): a one-parameter fit, df = n - 1.")

fixture("concentration-bottom-zero",
  input = list(
    dose = c(0, 0, 1e-10, 1e-10, 3e-10, 3e-10, 1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06),
    y = c(0.199, 0.104, 0.275, 0.181, 0.216, 0.162, 0.379, 0.306, 0.616, 0.597, 1.175, 1.146, 1.676, 1.859, 1.691, 1.995, 1.972, 1.812, 1.998, 1.934)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, bounds = limits(bottom = 0)), setup = reference,
  check = drc_agrees(log10(dose[dose > 0]), y[dose > 0], expected, ref_optimum, limits(bottom = 0)), check_packages = c("drc", "randtests"),
  options = list(x = "concentration", bottom = list(kind = "fixed", value = 0)),
  note = "Concentrations with a zero-dose control (left out) and Bottom held at 0: the constraint composes with the log transform and the dropped points.")

fixture("half-curve-both-fixed",
  input = list(
    dose = c(-9, -8.7, -8.4, -8.1, -7.8, -7.5, -7.2, -6.9, -6.6, -6.3, -6),
    y = c(2.513, 1.717, 1.386, 5.129, 3.299, 5.747, 4.781, 5.427, 11.595, 15.921, 25.989)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 2, top = 40)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 2, top = 40)), check_packages = c("drc", "randtests"),
  options = list(x = "log", bottom = list(kind = "fixed", value = 2), top = list(kind = "fixed", value = 40)),
  note = "The half-curve data that cannot be fit freely (no top plateau), with both plateaus held at values known from elsewhere: the fit converges.")

fixture("few-with-two-held",
  input = list(dose = c(-8, -7), y = c(2, 60)),
  expr = list(n = 2, dropped = 0, ran = FALSE, why = "few", minimum = 3),
  options = list(x = "log", bottom = list(kind = "fixed", value = 0), top = list(kind = "fixed", value = 100)),
  note = "Two points for the two parameters left: nothing left to estimate scatter from, so the minimum is the number estimated plus one.")

fixture("two-doses-hill-held",
  input = list(dose = c(-8, -8, -8, -6, -6, -6), y = c(2, 4, 3, 96, 99, 97)),
  expr = list(n = 6, dropped = 0, ran = FALSE, why = "few_x", minimum = 3),
  options = list(x = "log", hillSlope = list(kind = "fixed", value = 1)),
  note = "Six points at two doses with three parameters to estimate: too few doses to tell them apart.")

# --- Model comparison (#98) ------------------------------------------------

fixture("compare-bottom-zero-rejected",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, alt = limits(bottom = 0)), setup = reference,
  check = { drc_agrees(dose, y, expected, ref_optimum); compare_agrees(dose, y, expected, TRUE, limits(), limits(bottom = 0)) },
  check_packages = c("drc", "randtests"),
  options = list(x = "log", compare = list(bottom = 0)),
  note = "The rising curve really has a Bottom above 0 (about 6): holding it at 0 must be rejected by the F test and preferred against by AICc.")

fixture("compare-bottom-zero-accepted",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl(dose, y, alt = limits(bottom = 0)), setup = reference,
  check = compare_agrees(dose, y, expected, TRUE, limits(), limits(bottom = 0)),
  options = list(x = "log", compare = list(bottom = 0)),
  note = "Data generated from a curve with Bottom = 0 (seed 98, noise SD 3): the simpler model is enough, so a large P and AICc preferring it.")

fixture("compare-hill-one",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl(dose, y, alt = limits(hill = 1)), setup = reference,
  check = compare_agrees(dose, y, expected, TRUE, limits(), limits(hill = 1)),
  options = list(x = "log", compare = list(hillSlope = 1)),
  note = "The same data with HillSlope held at 1 (its true value): one extra parameter, the usual 'is it simple binding?' question.")

fixture("compare-bottom-and-top",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl(dose, y, alt = limits(bottom = 0, top = 100)), setup = reference,
  check = compare_agrees(dose, y, expected, TRUE, limits(), limits(bottom = 0, top = 100)),
  options = list(x = "log", compare = list(bottom = 0, top = 100)),
  note = "Two parameters held at once: numerator df = 2.")

fixture("compare-fit-already-constrained",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0), alt = limits(bottom = 0, hill = 1)), setup = reference,
  check = compare_agrees(dose, y, expected, TRUE, limits(bottom = 0), limits(bottom = 0, hill = 1)),
  options = list(x = "log", bottom = list(kind = "fixed", value = 0), compare = list(hillSlope = 1)),
  note = "The fit itself holds Bottom = 0; the simpler model also holds HillSlope = 1. df are n - 3 and n - 2.")

fixture("compare-concentrations",
  input = list(
    dose = c(1e-09, 1e-09, 3.16228e-09, 3.16228e-09, 1e-08, 1e-08, 3.16228e-08, 3.16228e-08, 1e-07, 1e-07, 3.16228e-07, 3.16228e-07, 1e-06, 1e-06, 3.16228e-06, 3.16228e-06, 1e-05, 1e-05, 3.16228e-05, 3.16228e-05, 0.0001, 0.0001),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, alt = limits(hill = 1)), setup = reference,
  check = compare_agrees(dose, y, expected, FALSE, limits(), limits(hill = 1)),
  options = list(x = "concentration", compare = list(hillSlope = 1)),
  note = "Doses rather than logs: the comparison runs on the fitted log doses, as the fit does.")

fixture("compare-few-points",
  input = list(dose = c(-8, -7, -6, -5, -4), y = c(3.1, 9.8, 51.2, 90.6, 97.4)),
  expr = run_fpl(dose, y, alt = limits(bottom = 0)), setup = reference,
  check = compare_agrees(dose, y, expected, TRUE, limits(), limits(bottom = 0)),
  options = list(x = "log", compare = list(bottom = 0)),
  note = "Five points, four parameters: df = 1 leaves the F test available, but AICc needs n > K + 1 (K = 5) and is reported as unavailable.")

# --- Dose-response models (#95, item 37) ------------------------------------
# Every model is the same curve with some parameters held (the app's model
# presets), so each case states the holds by hand in limits() and its options
# carry only the model: the test builds the request from `model` alone, which
# checks the app's presets against these hand-written bounds. Inhibitor
# models are the falling curve, HillSlope negative, as Prism reports them;
# a standard slope is +1 (agonist) or -1 (inhibitor).

fixture("inhibitor-variable-slope",
  input = list(
    dose = c(0, 0, 1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06, 3e-06, 3e-06, 1e-05, 1e-05),
    y = c(94.91, 93.15, 95.69, 94.81, 100.69, 97.14, 89.01, 88.38, 83.08, 79.4, 54.46, 54.6, 26.15, 19.17, 3.06, 8.78, -2.14, -0.26, 4.18, 1.5)
  ),
  expr = run_fpl(dose, y, log_x = FALSE), setup = reference,
  check = drc_agrees(log10(dose[dose > 0]), y[dose > 0], expected, ref_optimum), check_packages = c("drc", "randtests"),
  options = list(model = "log-inhibitor-variable-slope", x = "concentration"),
  note = "log(inhibitor) vs. response, variable slope: molar concentrations in duplicate with a zero-dose control (left out, counted); the falling curve gives a negative HillSlope and Bottom < Top.")

fixture("inhibitor-standard-slope",
  input = list(
    dose = c(0, 0, 1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06, 3e-06, 3e-06, 1e-05, 1e-05),
    y = c(94.91, 93.15, 95.69, 94.81, 100.69, 97.14, 89.01, 88.38, 83.08, 79.4, 54.46, 54.6, 26.15, 19.17, 3.06, 8.78, -2.14, -0.26, 4.18, 1.5)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, bounds = limits(hill = -1)), setup = reference,
  check = drc_agrees(log10(dose[dose > 0]), y[dose > 0], expected, ref_optimum, limits(hill = -1)), check_packages = c("drc", "randtests"),
  options = list(model = "log-inhibitor-standard-slope", x = "concentration"),
  note = "log(inhibitor) vs. response with the slope held at -1: Bottom, Top and LogIC50 estimated, df = n - 3.")

fixture("inhibitor-normalized-variable-slope",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5),
    y = c(88.65, 102.44, 98.74, 103.18, 93.1, 94.78, 87.65, 84.24, 81.41, 70.94, 57.51, 62.08, 40.96, 40.18, 37.63, 16.54, 17.51, 20.9, 6.44, 16.04, 8.49, -1.4, 4.95, 6.87, -3.41, 3.12, 1.74)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0, top = 100)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0, top = 100)), check_packages = c("drc", "randtests"),
  options = list(model = "log-inhibitor-normalized-variable-slope", x = "log"),
  note = "Percent-of-control inhibition in triplicate: Bottom = 0 and Top = 100 held, LogIC50 and a negative HillSlope estimated.")

fixture("inhibitor-normalized-standard-slope",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5),
    y = c(88.65, 102.44, 98.74, 103.18, 93.1, 94.78, 87.65, 84.24, 81.41, 70.94, 57.51, 62.08, 40.96, 40.18, 37.63, 16.54, 17.51, 20.9, 6.44, 16.04, 8.49, -1.4, 4.95, 6.87, -3.41, 3.12, 1.74)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0, top = 100, hill = -1)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0, top = 100, hill = -1)), check_packages = c("drc", "randtests"),
  options = list(model = "log-inhibitor-normalized-standard-slope", x = "log"),
  note = "Percent-of-control inhibition with the slope also held at -1: only LogIC50 is estimated (df = n - 1).")

fixture("agonist-normalized-variable-slope",
  input = list(
    dose = c(-10, -10, -9.5, -9.5, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6),
    y = c(6.74, -2.53, -6.57, 4.25, 6.44, 7, 25.52, 24.13, 61.19, 58.26, 88.8, 87.65, 101.99, 101.68, 103.02, 104.89, 102.2, 104.59)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0, top = 100)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0, top = 100)), check_packages = c("drc", "randtests"),
  options = list(model = "log-agonist-normalized-variable-slope", x = "log"),
  note = "Percent-of-maximum stimulation in duplicate, with noise taking single values below 0 and above 100: Bottom = 0 and Top = 100 held.")

fixture("agonist-normalized-standard-slope",
  input = list(
    dose = c(-10, -10, -9.5, -9.5, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6),
    y = c(6.74, -2.53, -6.57, 4.25, 6.44, 7, 25.52, 24.13, 61.19, 58.26, 88.8, 87.65, 101.99, 101.68, 103.02, 104.89, 102.2, 104.59)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0, top = 100, hill = 1)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0, top = 100, hill = 1)), check_packages = c("drc", "randtests"),
  options = list(model = "log-agonist-normalized-standard-slope", x = "log"),
  note = "Percent-of-maximum stimulation with the slope held at 1: only LogEC50 is estimated.")

fixture("agonist-standard-slope-small-n",
  input = list(
    dose = c(-8, -7, -6, -5, -4),
    y = c(2.53, 7.68, 26.48, 54.6, 58.73)
  ),
  expr = run_fpl(dose, y, bounds = limits(hill = 1)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(hill = 1)), check_packages = c("drc", "randtests"),
  options = list(model = "log-agonist-standard-slope", x = "log"),
  note = "Five points, one per dose, three parameters (HillSlope held at 1): df = 2, the smallest fit the model allows.")

fixture("inhibitor-normalized-standard-slope-partial",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5),
    y = c(97.49, 101.41, 101.36, 100.43, 93.5, 98.26, 89.44, 91.68, 72.29, 72.24, 47.98, 48.44)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0, top = 100, hill = -1)), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0, top = 100, hill = -1)), check_packages = c("drc", "randtests"),
  options = list(model = "log-inhibitor-normalized-standard-slope", x = "log"),
  note = "Only the upper shoulder of the inhibition curve is measured (no bottom plateau): with both plateaus and the slope held the IC50 is still determined, where the free fit would not converge.")

fixture("inhibitor-normalized-standard-slope-one-point",
  input = list(dose = c(-7), y = c(50)),
  expr = list(n = 1, dropped = 0, ran = FALSE, why = "few", minimum = 2),
  options = list(model = "log-inhibitor-normalized-standard-slope", x = "log"),
  note = "One point for the one parameter left (LogIC50): no residual degrees of freedom, so the minimum is 2.")

# --- Global fits (#97, item 38) ---------------------------------------------
#
# Parameters shared across data sets: one stacked least-squares problem.
# The reference is written from the definition: the unknown vector holds a
# shared parameter once and an unshared one per data set; the residuals of
# all points are minimised by a Levenberg-Marquardt with a five-point
# numerical Jacobian (the app uses the analytic one), from the independent
# fit of each data set and from the pooled fit (`ref_optimum`, above). df =
# points - unknowns; one s^2 = SS / df serves every SE, CI and band, as in
# Prism's global fits. `check` then fits the same data with
# drc::drm(curveid =, pmodels =) and requires the same optimum.
global_extra <- quote({
  # shared: which of (Bottom, Top, LogEC50, HillSlope) are one value for all
  # data sets. g: each row's data set. Rows with a missing dose or response
  # are dropped first (the app never sees them).
  run_global <- function(dose, y, g, shared, log_x = TRUE, bounds = limits(), w = NULL, ypow = 0, unknown = NULL) {
    if (is.null(w)) w <- rep(1, length(dose))
    lower <- bounds$lower
    upper <- bounds$upper
    fixed <- lower == upper
    ids <- sort(unique(g))
    k <- length(ids)
    ok <- !is.na(y) & !is.na(dose)
    dropped <- vapply(ids, function(i) if (log_x) 0 else sum(ok & g == i & dose <= 0), 0)
    if (!log_x) ok <- ok & dose > 0
    x <- (if (log_x) dose else log10(dose))[ok]
    yy <- y[ok]
    wt <- w[ok]
    gg <- match(g[ok], ids)
    n_i <- tabulate(gg, k)
    back <- if (log_x) function(v) v else function(v) 10^v
    # slot[i, j]: which unknown is parameter j of data set i (0 = held).
    slot <- matrix(0L, k, 4)
    m <- 0L
    for (j in 1:4) {
      if (fixed[j]) next
      if (shared[j]) {
        m <- m + 1L
        slot[, j] <- m
      } else {
        for (i in 1:k) {
          m <- m + 1L
          slot[i, j] <- m
        }
      }
    }
    n <- length(x)
    per_row <- function(th, j) ifelse(slot[gg, j] > 0, th[pmax(slot[gg, j], 1L)], lower[j])
    predict <- function(th, xs = x) {
      b <- per_row(th, 1); t <- per_row(th, 2); l <- per_row(th, 3); h <- per_row(th, 4)
      b + (t - b) / (1 + 10^((l - xs) * h))
    }
    rss <- function(th) sum(wt * (yy - predict(th))^2)
    jac <- function(th) {
      sapply(seq_len(m), function(u) {
        h <- 1e-4
        at <- function(s) {
          q <- th
          q[u] <- th[u] + s * h
          predict(q)
        }
        (at(-2) - 8 * at(-1) + 8 * at(1) - at(2)) / (12 * h)
      })
    }
    lm <- function(th) {
      lambda <- 1e-3
      for (it in 1:2000) {
        J <- sqrt(wt) * jac(th)
        A <- crossprod(J)
        step <- tryCatch(
          unname(drop(solve(A + lambda * diag(diag(A), m), crossprod(J, sqrt(wt) * (yy - predict(th)))))),
          error = function(e) NULL
        )
        if (is.null(step) || any(!is.finite(step))) {
          lambda <- lambda * 10
          if (lambda > 1e12) break
          next
        }
        cand <- th + step
        if (rss(cand) <= rss(th)) {
          moved <- max(abs(cand - th) / pmax(abs(cand), 1e-8))
          th <- cand
          lambda <- lambda / 10
          if (moved < 1e-14) break
        } else {
          lambda <- lambda * 10
        }
        if (lambda > 1e12) break
      }
      for (it in 1:5) th <- th + unname(drop(qr.coef(qr(sqrt(wt) * jac(th)), sqrt(wt) * (yy - predict(th)))))
      th
    }
    # A start from a table of parameters, one row per data set.
    start_from <- function(rows) {
      th <- numeric(m)
      for (j in 1:4) {
        if (fixed[j]) next
        if (shared[j]) th[slot[1, j]] <- mean(rows[, j]) else th[slot[, j]] <- rows[, j]
      }
      th
    }
    pooled <- ref_optimum(x, yy, lower = lower, upper = upper)
    own <- t(vapply(1:k, function(i) {
      if (n_i[i] < 6) return(pooled)
      tryCatch(ref_optimum(x[gg == i], yy[gg == i], lower = lower, upper = upper), error = function(e) pooled)
    }, numeric(4)))
    best <- NULL
    for (s in list(start_from(matrix(pooled, k, 4, byrow = TRUE)), start_from(own))) {
      th <- tryCatch(lm(s), error = function(e) NULL)
      if (!is.null(th) && (is.null(best) || rss(th) < rss(best))) best <- th
    }
    th <- best
    if (ypow > 0) {
      for (it in 1:500) {
        wt <- predict(th)^-ypow
        nt <- lm(th)
        moved <- max(abs(nt - th) / pmax(abs(th), 1e-8))
        th <- nt
        if (moved < 1e-13) break
      }
      wt <- predict(th)^-ypow
    }
    J <- sqrt(wt) * jac(th)
    A <- crossprod(J)
    Ainv <- solve(A)
    df <- n - m
    resid <- yy - predict(th)
    ss_all <- sum(wt * resid^2)
    s2 <- ss_all / df
    se <- sqrt(s2 * diag(Ainv))
    dependency <- pmax(0, 1 - 1 / (diag(A) * diag(Ainv))) # a lone parameter: 0, not rounding noise
    t <- qt(0.975, df)
    series <- lapply(1:k, function(i) {
      rows <- which(gg == i)
      p <- vapply(1:4, function(j) if (slot[i, j] > 0) th[slot[i, j]] else lower[j], 0)
      par <- function(j) {
        u <- slot[i, j]
        if (u == 0) return(ref_held(p[j], "fixed"))
        ref_param(p[j], se[u], t, dependency[u])
      }
      xi <- x[rows]
      ord <- order(xi)
      ri <- resid[rows]
      grid <- seq(min(xi), max(xi), length.out = 100)
      on <- which(slot[i, ] > 0)
      # Gradient of the curve at the grid, by five-point differences, against this data set's unknowns.
      G <- sapply(on, function(j) {
        h <- 1e-4
        at <- function(s) {
          q <- p
          q[j] <- p[j] + s * h
          ref_curve(grid, q)
        }
        (at(-2) - 8 * at(-1) + 8 * at(1) - at(2)) / (12 * h)
      })
      Ai <- Ainv[slot[i, on], slot[i, on], drop = FALSE]
      var_fit <- vapply(seq_along(grid), function(r) drop(G[r, ] %*% Ai %*% G[r, ]), 0) * s2
      fit_grid <- ref_curve(grid, p)
      wi <- wt[rows]
      w_new <- vapply(grid, function(v) wi[which.min(abs(xi - v))], 0)
      half <- function(v) {
        Gv <- sapply(on, function(j) {
          h <- 1e-4
          at <- function(s) {
            q <- p
            q[j] <- p[j] + s * h
            ref_curve(v, q)
          }
          (at(-2) - 8 * at(-1) + 8 * at(1) - at(2)) / (12 * h)
        })
        Gv <- matrix(Gv, length(v))
        t * sqrt(vapply(seq_along(v), function(r) drop(Gv[r, ] %*% Ai %*% Gv[r, ]), 0) * s2)
      }
      signs <- sign(ri[ord])
      list(
        n = n_i[i], dropped = dropped[i], ran = TRUE,
        bottom = par(1), top = par(2), logec50 = par(3), hill = par(4),
        ec50 = 10^p[3], ec50_lower = 10^(p[3] - t * se[slot[i, 3]]), ec50_upper = 10^(p[3] + t * se[slot[i, 3]]),
        df = df, ss = sum(wi * ri^2), syx = sqrt(s2), r2 = 1 - sum(wi * ri^2) / sum(wi * (yy[rows] - weighted.mean(yy[rows], wi))^2),
        x = back(xi[ord]), y = yy[rows][ord], fitted = (yy[rows] - ri)[ord], residual = ri[ord],
        runs = ref_runs(signs[signs != 0]),
        band = list(
          x = back(grid), fit = fit_grid,
          confidence_lower = fit_grid - t * sqrt(var_fit),
          confidence_upper = fit_grid + t * sqrt(var_fit),
          prediction_lower = fit_grid - t * sqrt(var_fit + s2 / w_new),
          prediction_upper = fit_grid + t * sqrt(var_fit + s2 / w_new)
        ),
        unknowns = lapply(if (is.null(unknown)) numeric(0) else unknown[[i]], function(y0) ref_interpolate(y0, p, half, diff(range(xi)), back))
      )
    })
    list(series = series, global = list(n = n, parameters = m, df = df, ss = ss_all, syx = sqrt(s2)))
  }
})
global_reference <- as.call(c(as.name("{"), as.list(reference)[-1], as.list(global_extra)[-1]))

# drc fits the same stacked problem: curveid = the data set, and pmodels
# says per parameter whether it is one value (1) or one per data set.
# drc's parameters are b (= -HillSlope * ln 10), c (Bottom), d (Top), e
# (LogEC50); a held parameter is removed with fixed =. The optimum must
# agree to 1e-2 and its sum of squares to 1e-6 relative -- the same minimum,
# not just a local one.
global_drc_agrees <- function(dose, y, g, expected, shared, log_x, bounds, w = NULL) {
  if (is.null(w)) w <- rep(1, length(dose))
  lower <- bounds$lower
  upper <- bounds$upper
  fixed <- lower == upper
  ok <- !is.na(y) & !is.na(dose)
  if (!log_x) ok <- ok & dose > 0
  x <- (if (log_x) dose else log10(dose))[ok]
  yy <- y[ok]
  ww <- w[ok]
  gf <- factor(g[ok])
  k <- nlevels(gf)
  fixed_b <- c(if (fixed[4]) -lower[4] * log(10) else NA, if (fixed[1]) lower[1] else NA,
    if (fixed[2]) lower[2] else NA, NA)
  order_drc <- c(4, 1, 2, 3) # drc's b, c, d, e = our HillSlope, Bottom, Top, LogEC50
  pm <- lapply(which(is.na(fixed_b)), function(u) if (shared[order_drc[u]]) rep(1, length(gf)) else gf)
  pmdf <- as.data.frame(setNames(pm, paste0("p", seq_along(pm))))
  dat <- data.frame(yy = yy, x = x, gf = gf, ww = ww, sqw = sqrt(ww))
  d <- do.call(drm, list(yy ~ x, curveid = quote(gf), data = dat, weights = quote(sqw), fct = L.4(fixed = fixed_b),
    pmodels = pmdf, control = drmc(relTol = 1e-12, maxIt = 10000)))
  cf <- coef(d)
  letters_free <- c("b", "c", "d", "e")[is.na(fixed_b)]
  drc_p <- matrix(NA_real_, k, 4)
  for (i in 1:k) {
    b <- fixed_b
    for (u in seq_along(letters_free)) {
      nm <- paste0(letters_free[u], ":", levels(gf)[i])
      b[match(letters_free[u], c("b", "c", "d", "e"))] <- if (nm %in% names(cf)) cf[[nm]] else cf[[paste0(letters_free[u], ":(Intercept)")]]
    }
    drc_p[i, ] <- c(b[2], b[3], b[4], -b[1] / log(10))
  }
  ours <- t(vapply(expected$series, function(s) c(s$bottom$value, s$top$value, s$logec50$value, s$hill$value), numeric(4)))
  if (max(abs(drc_p - ours) / pmax(abs(ours), 1e-8)) > 1e-2) {
    stop("drc is far off: ", paste(signif(drc_p, 6), collapse = ", "), " vs ours ", paste(signif(ours, 6), collapse = ", "))
  }
  # drc's own sum of squares and df are the stacked fit's: the same
  # minimum, not just a nearby one (drc stops a hair short of it).
  stopifnot(
    abs(sum(ww * residuals(d)^2) - expected$global$ss) <= 1e-6 * expected$global$ss,
    df.residual(d) == expected$global$df
  )
  # A shared parameter has one value in every data set.
  for (j in which(shared & !fixed)) stopifnot(length(unique(round(ours[, j], 12))) == 1)
  TRUE
}

# With nothing actually shared the stacked fit is the separate fits: the
# same parameters and sum of squares for every data set (their SEs differ,
# since one s^2 pools all the data sets). `bounds` as in the case.
global_equals_separate <- function(dose, y, g, expected, bounds, ref_fit) {
  ok <- !is.na(y)
  for (i in sort(unique(g))) {
    one <- ref_fit(dose[ok & g == i], y[ok & g == i], bounds = bounds)
    s <- expected$series[[i]]
    for (nm in c("bottom", "top", "logec50", "hill")) {
      stopifnot(abs(s[[nm]]$value - one[[nm]]$value) <= 1e-6 * max(abs(one[[nm]]$value), 1e-8))
    }
    stopifnot(abs(s$ss - one$ss) <= 1e-6 * one$ss)
  }
  TRUE
}

gopts <- function(bottom = FALSE, top = FALSE, hillSlope = FALSE, logEc50 = FALSE) {
  list(bottom = bottom, top = top, hillSlope = hillSlope, logEc50 = logEc50)
}

fixture("global-hill-shared",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3),
    y = c(-0.089, 16.336, 27.261, 56.968, 77.059, 92.793, 98.189, 96.265, 100.415, 98.148, 102.067, 1.957, 4.991, 11.510, 16.031, 39.788, 69.185, 84.565, 88.809, 94.677, 91.961, 95.367, -1.923, 1.862, 2.706, 6.683, 5.403, 25.828, 59.489, 89.425, 96.085, 100.171, 103.972)
  ),
  expr = run_global(dose, y, g, shared = c(FALSE, FALSE, FALSE, TRUE)), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(FALSE, FALSE, FALSE, TRUE), TRUE, limits()), check_packages = "drc",
  options = list(x = "log", shared = gopts(hillSlope = TRUE)),
  note = "Three curves that differ in potency and plateaus, one HillSlope for all: 3 x 3 + 1 = 10 parameters over 33 points (df 23). The shared slope shows the same value, SE and CI in every data set.")

fixture("global-plateaus-shared",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(0.672, 13.563, 6.998, 7.357, 15.694, 15.210, 32.484, 30.435, 54.036, 50.276, 71.797, 73.730, 86.657, 81.493, 89.367, 91.129, 95.832, 92.929, 98.906, 97.325, 99.071, 98.256, 2.730, 6.385, 6.754, 0.005, 3.577, 6.059, 3.714, 5.202, 6.562, 10.938, 26.612, 26.176, 70.121, 71.514, 94.605, 94.462, 95.280, 95.301, 101.952, 95.855, 103.139, 97.802)
  ),
  expr = run_global(dose, y, g, shared = c(TRUE, TRUE, FALSE, FALSE)), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(TRUE, TRUE, FALSE, FALSE), TRUE, limits()), check_packages = "drc",
  options = list(x = "log", shared = gopts(bottom = TRUE, top = TRUE)),
  note = "Two duplicate curves with the same plateaus but different potency and slope: Bottom and Top shared, LogEC50 and HillSlope separate (6 parameters over 44 points).")

fixture("global-ec50-shared",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(-2.504, -0.319, 1.029, 0.242, 7.419, 2.405, 9.435, 10.354, 22.359, 22.117, 46.582, 46.904, 62.547, 63.364, 82.496, 79.871, 82.312, 90.533, 90.598, 88.994, 92.556, 86.342, 4.285, 5.119, 7.973, 9.674, 6.385, 13.672, 9.253, 13.697, 27.363, 18.958, 52.932, 51.435, 89.241, 80.601, 96.698, 101.758, 100.442, 98.460, 93.787, 97.369, 99.045, 99.733)
  ),
  expr = run_global(dose, y, g, shared = c(FALSE, FALSE, TRUE, FALSE)), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(FALSE, FALSE, TRUE, FALSE), TRUE, limits()), check_packages = "drc",
  options = list(x = "log", shared = gopts(logEc50 = TRUE)),
  note = "Two curves that share their EC50 but differ in plateaus and slope: only LogEC50 is one value (7 parameters over 44 points), and the EC50 CI is the same in both.")

fixture("global-all-shared",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3),
    y = c(-0.875, 0.111, 9.073, 6.263, 27.660, 55.393, 71.104, 79.255, 85.851, 94.801, 100.993, 4.546, 1.634, 4.244, 9.986, 26.442, 49.368, 74.843, 92.572, 99.420, 98.118, 108.829, -1.001, 9.190, 8.979, 18.879, 23.080, 45.928, 77.426, 88.544, 94.911, 105.030, 103.445)
  ),
  expr = run_global(dose, y, g, shared = c(TRUE, TRUE, TRUE, TRUE)), setup = global_reference,
  check = {
    global_drc_agrees(dose, y, g, expected, c(TRUE, TRUE, TRUE, TRUE), TRUE, limits())
    # One curve through all three data sets is the pooled fit: the same
    # parameters and sum of squares as fitting the stacked points as one set.
    pooled <- run_fpl_one(dose, y)
    stopifnot(abs(expected$global$ss - pooled$ss) <= 1e-6 * pooled$ss, expected$global$df == pooled$df,
      abs(expected$series[[1]]$logec50$value - pooled$logec50$value) <= 1e-6 * abs(pooled$logec50$value))
    TRUE
  }, check_packages = "drc",
  options = list(x = "log", shared = gopts(TRUE, TRUE, TRUE, TRUE)),
  note = "Everything shared: one curve through the three data sets, four parameters over 33 points (df 29). Equal to fitting all the points as a single data set.")

fixture("global-off-two-sets",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(4.799, 9.922, 18.835, 46.470, 82.761, 91.531, 96.998, 98.411, 101.658, 93.905, 98.327, 1.619, 3.790, 8.942, 9.313, 21.885, 36.639, 65.609, 74.136, 93.300, 92.122, 99.616)
  ),
  expr = list(series = list(run_fpl(dose[g == 1], y[g == 1]), run_fpl(dose[g == 2], y[g == 2]))),
  setup = reference,
  options = list(x = "log", shared = gopts()),
  note = "Two data sets with nothing shared: the ordinary separate fits, each with its own s^2, its own df and its own curve (the multi-data-set path is the independent single fit).")

fixture("global-none-shared-engine",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3),
    y = c(1.315, 11.972, 25.722, 46.615, 76.472, 97.910, 94.664, 94.645, 101.217, 8.216, 5.614, 5.083, 4.536, 16.631, 48.966, 77.348, 94.545, 96.077, -3.953, -8.188, -1.511, 4.459, 2.789, 19.089, 36.623, 70.888, 79.712)
  ),
  expr = run_global(dose, y, g, shared = c(TRUE, TRUE, FALSE, TRUE), bounds = limits(bottom = 0, top = 100, hill = 1)), setup = global_reference,
  check = {
    global_drc_agrees(dose, y, g, expected, c(TRUE, TRUE, FALSE, TRUE), TRUE, limits(bottom = 0, top = 100, hill = 1))
    global_equals_separate(dose, y, g, expected, limits(bottom = 0, top = 100, hill = 1), run_fpl_one)
  }, check_packages = "drc",
  options = list(x = "log", bottom = list(kind = "fixed", value = 0), top = list(kind = "fixed", value = 100), hillSlope = list(kind = "fixed", value = 1), shared = gopts(TRUE, TRUE, TRUE, FALSE)),
  note = "Bottom, Top and HillSlope are held, so ticking them as shared changes nothing: the stacked fit has only the three LogEC50s free and equals the three separate fits (same parameters and sum of squares; the SEs use one s^2 for all the points, so they differ from the separate fits').")

fixture("global-missing-unequal",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -3.5, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -8, -7.5, -7, -6.5, -6, -5.5, -5),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3),
    y = c(6.216, 7.350, NA, 49.586, 78.683, 90.767, 86.253, 101.803, 95.286, 100.180, 100.104, 104.472, 5.398, 8.893, 21.975, 35.286, 71.221, NA, 96.841, 94.920, 97.840, 3.414, 9.283, 12.638, NA, 51.908, 82.937, 93.061)
  ),
  expr = run_global(dose, y, g, shared = c(TRUE, FALSE, FALSE, TRUE)), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(TRUE, FALSE, FALSE, TRUE), TRUE, limits()), check_packages = "drc",
  options = list(x = "log", shared = gopts(bottom = TRUE, hillSlope = TRUE)),
  note = "Three data sets of 12, 9 and 7 dose levels with an empty Y cell in each (11, 8 and 6 points left): each empty cell drops that point only, and the shared Bottom and HillSlope use every remaining point (25 points, 7 parameters).")

fixture("global-small-set",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -8, -7, -6, -4.5),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2),
    y = c(4.538, 2.446, 12.071, 29.692, 68.385, 89.347, 97.126, 99.889, 97.384, 96.137, 102.674, 9.151, 8.197, 48.407, 96.654)
  ),
  expr = run_global(dose, y, g, shared = c(TRUE, TRUE, FALSE, TRUE)), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(TRUE, TRUE, FALSE, TRUE), TRUE, limits()), check_packages = "drc",
  options = list(x = "log", shared = gopts(TRUE, TRUE, TRUE, FALSE)),
  note = "A second data set of only four points, which no four-parameter curve could fit alone: with Bottom, Top and HillSlope shared, it needs only its own LogEC50 (5 parameters over 15 points).")

fixture("global-concentration",
  input = list(
    dose = c(0, 1e-09, 3e-09, 1e-08, 3e-08, 1e-07, 3e-07, 1e-06, 3e-06, 1e-05, 0, 1e-09, 3e-09, 1e-08, 3e-08, 1e-07, 3e-07, 1e-06, 3e-06, 1e-05),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(0.110, 0.062, 0.195, 0.417, 0.769, 1.439, 1.719, 1.877, 2.047, 2.024, 0.130, 0.102, 0.091, 0.133, 0.290, 0.682, 1.172, 1.680, 1.771, 1.960)
  ),
  expr = run_global(dose, y, g, shared = c(TRUE, TRUE, FALSE, TRUE), log_x = FALSE), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(TRUE, TRUE, FALSE, TRUE), FALSE, limits()), check_packages = "drc",
  options = list(x = "concentration", shared = gopts(TRUE, TRUE, TRUE, FALSE)),
  note = "Molar concentrations with a zero-dose control in each data set: the zeros are left out (and counted) per data set, the fit is on log10(dose), and EC50s keep their magnitude.")

fixture("global-inhibitor-normalized",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(101.586, 97.384, 99.095, 99.876, 91.428, 92.551, 79.059, 79.118, 53.651, 59.411, 18.921, 25.415, 2.132, 3.031, -4.441, 2.939, 2.476, 3.657, 0.020, -13.086, 96.540, 94.733, 104.244, 102.240, 103.644, 94.552, 99.461, 96.191, 88.666, 86.322, 57.270, 57.643, 12.418, 19.194, 9.082, 11.686, -4.830, 3.895, 7.496, 3.529)
  ),
  expr = run_global(dose, y, g, shared = c(FALSE, FALSE, FALSE, TRUE), bounds = limits(bottom = 0, top = 100)), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(FALSE, FALSE, FALSE, TRUE), TRUE, limits(bottom = 0, top = 100)), check_packages = "drc",
  options = list(model = "log-inhibitor-normalized-variable-slope", x = "log", shared = gopts(hillSlope = TRUE)),
  note = "Two inhibition curves as percent of control (Bottom 0 and Top 100 held by the model), one negative HillSlope shared, a LogIC50 each: 3 parameters over 40 points.")

fixture("global-too-few",
  input = list(dose = c(-8, -6, -7, -5), g = c(1, 1, 2, 2), y = c(10, 90, 20, 80)),
  expr = list(series = list(
    list(n = 2, dropped = 0, ran = FALSE, why = "few", minimum = 5),
    list(n = 2, dropped = 0, ran = FALSE, why = "few", minimum = 5))),
  options = list(x = "log", shared = gopts(TRUE, TRUE, TRUE, TRUE)),
  note = "Four points for the four parameters of one shared curve: nothing left to estimate scatter from, so the whole fit is refused (needs at least 5 points).")

# --- Comparing models (#105, item 39) ---------------------------------------
#
# The fit against a different model, or against the same model with some
# shared parameters made separate. Both fits come from the reference above
# (run_fpl_one, run_global); the statistics are written from the textbook:
#   F = ((SS_simpler - SS_complex) / (df_simpler - df_complex)) / (SS_complex / df_complex)
#   AICc = n ln(SS/n) + 2K + 2K(K+1)/(n - K - 1), K = parameters + 1
# with P from pf(lower.tail = FALSE), Akaike weights exp(-delta/2) / sum, and
# the F test only for nested models. `role`: 1 = the other model is a special
# case of the configured one, 2 = the configured one is a special case of the
# other, 3 = neither (AICc only). The comparison's `fit` side is always the
# more complex model (the configured one when not nested).
compare_extra <- quote({
  ref_compare <- function(cx, sm, n, nested = TRUE) {
    aicc <- function(ss, df) {
      k <- (n - df) + 1
      n * log(ss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1)
    }
    df_num <- sm$df - cx$df
    f_test <- if (!nested) {
      list(ok = FALSE, why = "not_nested")
    } else if (cx$ss <= 0) {
      list(ok = FALSE, why = "exact_fit")
    } else if (df_num < 1 || cx$df < 1) {
      list(ok = FALSE, why = "no_extra")
    } else {
      f <- ((sm$ss - cx$ss) / df_num) / (cx$ss / cx$df)
      list(ok = TRUE, f = f, df_num = df_num, df_den = cx$df,
        p = pf(f, df_num, cx$df, lower.tail = FALSE))
    }
    k_cx <- (n - cx$df) + 1
    k_sm <- (n - sm$df) + 1
    a <- if (n - k_cx - 1 <= 0 || n - k_sm - 1 <= 0 || cx$ss <= 0) {
      list(ok = FALSE)
    } else {
      a_cx <- aicc(cx$ss, cx$df)
      a_sm <- aicc(sm$ss, sm$df)
      w <- exp(-0.5 * (c(a_cx, a_sm) - min(a_cx, a_sm)))
      list(ok = TRUE, fit = a_cx, simpler = a_sm, prob_fit = w[1] / sum(w), prob_simpler = w[2] / sum(w))
    }
    list(f_test = f_test, aicc = a)
  }
  # One data set: the configured model (`bounds`) against `other`.
  run_fpl_models <- function(dose, y, log_x = TRUE, bounds = limits(), other = limits(), role = 1) {
    fa <- run_fpl_one(dose, y, log_x, bounds)
    fb <- run_fpl_one(dose, y, log_x, other)
    cx <- if (role == 2) fb else fa
    sm <- if (role == 2) fa else fb
    st <- ref_compare(cx, sm, fa$n, role != 3)
    fa$comparison <- list(
      ran = TRUE,
      simpler = list(
        bottom = sm$bottom$value, top = sm$top$value, logec50 = sm$logec50$value, hill = sm$hill$value,
        ec50 = sm$ec50, ss = sm$ss, df = sm$df
      ),
      f_test = st$f_test, aicc = st$aicc
    )
    fa
  }
  # Several data sets stacked: the whole fit against the other stacked fit.
  run_global_models <- function(dose, y, g, shared, other_shared, log_x = TRUE,
                                bounds = limits(), other = bounds, role = 1, w = NULL) {
    fa <- run_global(dose, y, g, shared, log_x, bounds, w)
    fb <- run_global(dose, y, g, other_shared, log_x, other, w)
    cx <- if (role == 2) fb$global else fa$global
    sm <- if (role == 2) fa$global else fb$global
    st <- ref_compare(cx, sm, fa$global$n, role != 3)
    fa$comparison <- list(ran = TRUE, simpler = list(ss = sm$ss, df = sm$df), f_test = st$f_test, aicc = st$aicc)
    fa
  }
})
compare_reference <- as.call(c(as.name("{"), as.list(reference)[-1], as.list(compare_extra)[-1]))
global_compare_reference <- as.call(c(as.name("{"), as.list(global_reference)[-1], as.list(compare_extra)[-1]))

# R's own nls() fits of the two models, started at the reference optima: anova()
# gives the F test and AIC() the AICc (its constant cancels between models, so
# only differences are compared; nls stops a hair short of the optimum, so the
# tolerance is looser than the fixtures').
models_agree <- function(dose, y, log_x, bounds, other, expected, role, fit_one) {
  x <- if (log_x) dose else log10(dose[dose > 0])
  yy <- if (log_x) y else y[dose > 0]
  cmp <- expected$comparison
  build <- function(lim) {
    p <- fit_one(dose, y, log_x, lim)
    p <- c(p$bottom$value, p$top$value, p$logec50$value, p$hill$value)
    fixed <- lim$lower == lim$upper
    terms <- ifelse(fixed, format(lim$lower, digits = 17), c("b", "t", "l", "h"))
    fml <- as.formula(paste0("yy ~ (", terms[1], ") + ((", terms[2], ") - (", terms[1], ")) / (1 + 10^(((", terms[3], ") - x) * (", terms[4], ")))"))
    nls(fml, start = as.list(setNames(p, c("b", "t", "l", "h"))[!fixed]),
      control = nls.control(maxiter = 50, tol = 1e-7, scaleOffset = 1, warnOnly = TRUE))
  }
  m_a <- build(bounds)
  m_b <- build(other)
  cx <- if (role == 2) m_b else m_a
  sm <- if (role == 2) m_a else m_b
  close <- function(a, b, tol = 1e-4) abs(a - b) <= tol * max(abs(b), 1e-300)
  stopifnot(close(deviance(sm), cmp$simpler$ss), close(df.residual(sm), cmp$simpler$df, 1e-12))
  if (cmp$f_test$ok) {
    a <- anova(sm, cx)
    stopifnot(close(a$F[2], cmp$f_test$f), close(a$`Pr(>F)`[2], cmp$f_test$p, 1e-3), a$Df[2] == cmp$f_test$df_num)
  }
  if (cmp$aicc$ok) {
    n <- length(yy)
    corrected <- function(m) {
      k <- attr(logLik(m), "df")
      AIC(m) + 2 * k * (k + 1) / (n - k - 1)
    }
    delta <- corrected(sm) - corrected(cx)
    stopifnot(abs(delta - (cmp$aicc$simpler - cmp$aicc$fit)) < 1e-4 * max(1, abs(delta)))
  }
  TRUE
}

# drc fits both stacked models (curveid, pmodels): anova() of the two is drc's
# extra sum-of-squares F test and its logLik gives the AICc. `shared` and
# `other_shared` as in run_global_models; `bounds`/`other` as limits().
global_models_agree <- function(dose, y, g, expected, shared, other_shared, log_x, bounds, other, role, w = NULL) {
  if (is.null(w)) w <- rep(1, length(dose))
  ok <- !is.na(y) & !is.na(dose)
  if (!log_x) ok <- ok & dose > 0
  x <- (if (log_x) dose else log10(dose))[ok]
  yy <- y[ok]
  ww <- w[ok]
  gf <- factor(g[ok])
  drc_fit <- function(sh, lim) {
    fixed <- lim$lower == lim$upper
    fixed_b <- c(if (fixed[4]) -lim$lower[4] * log(10) else NA, if (fixed[1]) lim$lower[1] else NA,
      if (fixed[2]) lim$lower[2] else NA, NA)
    order_drc <- c(4, 1, 2, 3)
    pm <- lapply(which(is.na(fixed_b)), function(u) if (sh[order_drc[u]]) rep(1, length(gf)) else gf)
    pmdf <- as.data.frame(setNames(pm, paste0("p", seq_along(pm))))
    dat <- data.frame(yy = yy, x = x, gf = gf, ww = ww, sqw = sqrt(ww))
    do.call(drm, list(yy ~ x, curveid = quote(gf), data = dat, weights = quote(sqw), fct = L.4(fixed = fixed_b),
      pmodels = pmdf, control = drmc(relTol = 1e-12, maxIt = 10000)))
  }
  d_a <- drc_fit(shared, bounds)
  d_b <- drc_fit(other_shared, other)
  cx <- if (role == 2) d_b else d_a
  sm <- if (role == 2) d_a else d_b
  cmp <- expected$comparison
  close <- function(a, b, tol = 1e-4) abs(a - b) <= tol * max(abs(b), 1e-300)
  # drc stops a little short of the optimum when the weights span many orders of magnitude (ours is the lower SS).
  ss_tol <- if (max(ww) / min(ww) > 1e6) 1e-4 else 1e-5
  if (!close(sum(ww * residuals(sm)^2), cmp$simpler$ss, ss_tol) || sum(ww * residuals(sm)^2) < cmp$simpler$ss * (1 - 1e-9)) stop("drc simpler ss ", sum(ww * residuals(sm)^2), " vs ", cmp$simpler$ss, " complex drc ", sum(ww * residuals(cx)^2), " ours ", expected$global$ss)
  stopifnot(df.residual(sm) == cmp$simpler$df)
  if (cmp$f_test$ok) {
    a <- anova(sm, cx, details = FALSE)
    # drc's P is 1 - pf(), which runs out of digits for a tiny one.
    stopifnot(close(a[2, 4], cmp$f_test$f, 1e-3),
      if (cmp$f_test$p > 1e-8) close(a[2, 5], cmp$f_test$p, 1e-2) else a[2, 5] < 1e-8)
  }
  if (cmp$aicc$ok) {
    n <- length(yy)
    corrected <- function(m) {
      k <- attr(logLik(m), "df")
      AIC(m) + 2 * k * (k + 1) / (n - k - 1)
    }
    delta <- corrected(sm) - corrected(cx)
    stopifnot(abs(delta - (cmp$aicc$simpler - cmp$aicc$fit)) < 1e-4 * max(1, abs(delta)))
  }
  TRUE
}

model_opts <- function(model = NULL, other, x = "log", ...) c(list(x = x), if (!is.null(model)) list(model = model), list(compareWith = list(kind = "model", model = other)), list(...))
sharing_opts <- function(shared, test, x = "log", ...) list(x = x, shared = shared, compareWith = list(kind = "sharing", test = test), ...)

fixture("compare-model-slope-rejected",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-1.880, 0.602, 2.411, 5.893, 2.449, 3.309, 3.667, 0.513, 11.820, 9.730, 46.622, 48.868, 88.867, 91.349, 97.357, 96.858, 93.392, 95.670, 96.381, 96.195, 95.419, 97.667)
  ),
  expr = run_fpl_models(dose, y, other = limits(hill = 1), role = 1), setup = compare_reference,
  check = models_agree(dose, y, TRUE, limits(), limits(hill = 1), expected, 1, run_fpl_one),
  options = model_opts(other = "log-agonist-standard-slope"),
  note = "Data from a curve with HillSlope 2: the variable-slope model against the same curve with the slope held at 1 (a special case). The F test rejects the standard slope and AICc prefers the variable one.")

fixture("compare-model-slope-accepted",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl_models(dose, y, other = limits(hill = 1), role = 1), setup = compare_reference,
  check = models_agree(dose, y, TRUE, limits(), limits(hill = 1), expected, 1, run_fpl_one),
  options = model_opts(other = "log-agonist-standard-slope"),
  note = "Data from a curve with HillSlope 1: the two models fit almost equally well (the nested fits nearly coincide), so the F test shows no evidence for the extra parameter and AICc prefers the standard slope.")

fixture("compare-model-configured-simpler",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-1.880, 0.602, 2.411, 5.893, 2.449, 3.309, 3.667, 0.513, 11.820, 9.730, 46.622, 48.868, 88.867, 91.349, 97.357, 96.858, 93.392, 95.670, 96.381, 96.195, 95.419, 97.667)
  ),
  expr = run_fpl_models(dose, y, bounds = limits(hill = 1), other = limits(), role = 2), setup = compare_reference,
  check = models_agree(dose, y, TRUE, limits(hill = 1), limits(), expected, 2, run_fpl_one),
  options = model_opts(model = "log-agonist-standard-slope", other = "log-agonist-variable-slope"),
  note = "The same data with the standard slope configured and the variable slope as the other model: the roles swap (the configured fit is the special case) and the comparison is the same.")

fixture("compare-model-normalized",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl_models(dose, y, bounds = limits(bottom = 0, top = 100), other = limits(), role = 2), setup = compare_reference,
  check = models_agree(dose, y, TRUE, limits(bottom = 0, top = 100), limits(), expected, 2, run_fpl_one),
  options = model_opts(model = "log-agonist-normalized-variable-slope", other = "log-agonist-variable-slope"),
  note = "Normalized (Bottom 0 and Top 100 held) against the fully free curve, on data generated from Bottom 0: two extra parameters, numerator df = 2.")

fixture("compare-model-not-nested",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    y = c(-1.880, 0.602, 2.411, 5.893, 2.449, 3.309, 3.667, 0.513, 11.820, 9.730, 46.622, 48.868, 88.867, 91.349, 97.357, 96.858, 93.392, 95.670, 96.381, 96.195, 95.419, 97.667)
  ),
  expr = run_fpl_models(dose, y, bounds = limits(hill = 1), other = limits(bottom = 0, top = 100), role = 3), setup = compare_reference,
  check = models_agree(dose, y, TRUE, limits(hill = 1), limits(bottom = 0, top = 100), expected, 3, run_fpl_one),
  options = model_opts(model = "log-agonist-standard-slope", other = "log-agonist-normalized-variable-slope"),
  note = "Standard slope (Bottom, Top, LogEC50 free) against normalized variable slope (only LogEC50 and HillSlope free): neither is a special case of the other, so there is no F test; only AICc compares them.")

fixture("compare-model-concentrations",
  input = list(
    dose = c(1e-09, 1e-09, 3.16228e-09, 3.16228e-09, 1e-08, 1e-08, 3.16228e-08, 3.16228e-08, 1e-07, 1e-07, 3.16228e-07, 3.16228e-07, 1e-06, 1e-06, 3.16228e-06, 3.16228e-06, 1e-05, 1e-05, 3.16228e-05, 3.16228e-05, 0.0001, 0.0001),
    y = c(-3.192, 4.756, 0.364, 1.825, -1.709, 3.873, 8.614, 8.103, 22.044, 24.062, 58.175, 51.802, 75.18, 73.249, 91.773, 85.67, 99.881, 97.073, 98.7, 99.879, 99.513, 93.658)
  ),
  expr = run_fpl_models(dose, y, log_x = FALSE, other = limits(hill = 1), role = 1), setup = compare_reference,
  check = models_agree(dose, y, FALSE, limits(), limits(hill = 1), expected, 1, run_fpl_one),
  options = model_opts(other = "log-agonist-standard-slope", x = "concentration"),
  note = "Doses rather than logs: both fits and their comparison run on the fitted log doses.")

fixture("compare-model-few-points",
  input = list(dose = c(-8, -7, -6, -5, -4), y = c(3.1, 9.8, 51.2, 90.6, 97.4)),
  expr = run_fpl_models(dose, y, other = limits(hill = 1), role = 1), setup = compare_reference,
  check = models_agree(dose, y, TRUE, limits(), limits(hill = 1), expected, 1, run_fpl_one),
  options = model_opts(other = "log-agonist-standard-slope"),
  note = "Five points: the variable-slope fit has one residual degree of freedom. The F test is available (df 1 and 1), AICc is not (needs n > K + 1).")

fixture("global-compare-two-sets-models",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(4.799, 9.922, 18.835, 46.470, 82.761, 91.531, 96.998, 98.411, 101.658, 93.905, 98.327, 1.619, 3.790, 8.942, 9.313, 21.885, 36.639, 65.609, 74.136, 93.300, 92.122, 99.616)
  ),
  expr = list(series = list(
    run_fpl_models(dose[g == 1], y[g == 1], other = limits(hill = 1)),
    run_fpl_models(dose[g == 2], y[g == 2], other = limits(hill = 1)))),
  setup = compare_reference,
  options = model_opts(other = "log-agonist-standard-slope", shared = gopts()),
  note = "Two data sets, nothing shared, variable against standard slope: each data set gets its own comparison.")

fixture("global-compare-ec50-different",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(0.672, 13.563, 6.998, 7.357, 15.694, 15.210, 32.484, 30.435, 54.036, 50.276, 71.797, 73.730, 86.657, 81.493, 89.367, 91.129, 95.832, 92.929, 98.906, 97.325, 99.071, 98.256, 2.730, 6.385, 6.754, 0.005, 3.577, 6.059, 3.714, 5.202, 6.562, 10.938, 26.612, 26.176, 70.121, 71.514, 94.605, 94.462, 95.280, 95.301, 101.952, 95.855, 103.139, 97.802)
  ),
  expr = run_global_models(dose, y, g, c(FALSE, FALSE, TRUE, FALSE), c(FALSE, FALSE, FALSE, FALSE), role = 2), setup = global_compare_reference,
  check = global_models_agree(dose, y, g, expected, c(FALSE, FALSE, TRUE, FALSE), c(FALSE, FALSE, FALSE, FALSE), TRUE, limits(), limits(), 2), check_packages = "drc",
  options = sharing_opts(gopts(logEc50 = TRUE), gopts(logEc50 = TRUE)),
  note = "Two curves that really differ in potency, fitted with one shared LogEC50 against each getting its own: the F test rejects the shared EC50 and AICc prefers separate values.")

fixture("global-compare-ec50-same",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -4, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(-2.504, -0.319, 1.029, 0.242, 7.419, 2.405, 9.435, 10.354, 22.359, 22.117, 46.582, 46.904, 62.547, 63.364, 82.496, 79.871, 82.312, 90.533, 90.598, 88.994, 92.556, 86.342, 4.285, 5.119, 7.973, 9.674, 6.385, 13.672, 9.253, 13.697, 27.363, 18.958, 52.932, 51.435, 89.241, 80.601, 96.698, 101.758, 100.442, 98.460, 93.787, 97.369, 99.045, 99.733)
  ),
  expr = run_global_models(dose, y, g, c(FALSE, FALSE, TRUE, FALSE), c(FALSE, FALSE, FALSE, FALSE), role = 2), setup = global_compare_reference,
  check = global_models_agree(dose, y, g, expected, c(FALSE, FALSE, TRUE, FALSE), c(FALSE, FALSE, FALSE, FALSE), TRUE, limits(), limits(), 2), check_packages = "drc",
  options = sharing_opts(gopts(logEc50 = TRUE), gopts(logEc50 = TRUE)),
  note = "Two curves generated with the same EC50: sharing it costs almost no fit, so a large P (no evidence of a difference) and AICc preferring the shared model.")

fixture("global-compare-two-parameters",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3),
    y = c(-0.875, 0.111, 9.073, 6.263, 27.660, 55.393, 71.104, 79.255, 85.851, 94.801, 100.993, 4.546, 1.634, 4.244, 9.986, 26.442, 49.368, 74.843, 92.572, 99.420, 98.118, 108.829, -1.001, 9.190, 8.979, 18.879, 23.080, 45.928, 77.426, 88.544, 94.911, 105.030, 103.445)
  ),
  expr = run_global_models(dose, y, g, c(TRUE, TRUE, TRUE, TRUE), c(TRUE, TRUE, FALSE, FALSE), role = 2), setup = global_compare_reference,
  check = global_models_agree(dose, y, g, expected, c(TRUE, TRUE, TRUE, TRUE), c(TRUE, TRUE, FALSE, FALSE), TRUE, limits(), limits(), 2), check_packages = "drc",
  options = sharing_opts(gopts(TRUE, TRUE, TRUE, TRUE), gopts(hillSlope = TRUE, logEc50 = TRUE)),
  note = "Three data sets, everything shared, against LogEC50 and HillSlope both unshared: numerator df = 2 x (3 - 1) = 4.")

fixture("global-compare-missing-unequal",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -3.5, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -8, -7.5, -7, -6.5, -6, -5.5, -5),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3),
    y = c(6.216, 7.350, NA, 49.586, 78.683, 90.767, 86.253, 101.803, 95.286, 100.180, 100.104, 104.472, 5.398, 8.893, 21.975, 35.286, 71.221, NA, 96.841, 94.920, 97.840, 3.414, 9.283, 12.638, NA, 51.908, 82.937, 93.061)
  ),
  expr = run_global_models(dose, y, g, c(TRUE, FALSE, FALSE, TRUE), c(TRUE, FALSE, FALSE, FALSE), role = 2), setup = global_compare_reference,
  check = global_models_agree(dose, y, g, expected, c(TRUE, FALSE, FALSE, TRUE), c(TRUE, FALSE, FALSE, FALSE), TRUE, limits(), limits(), 2), check_packages = "drc",
  options = sharing_opts(gopts(bottom = TRUE, hillSlope = TRUE), gopts(hillSlope = TRUE)),
  note = "Three data sets of unequal size with an empty Y cell each (25 points): is the shared HillSlope justified?")

fixture("global-compare-small-set",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -8, -7, -6, -4.5),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2),
    y = c(4.538, 2.446, 12.071, 29.692, 68.385, 89.347, 97.126, 99.889, 97.384, 96.137, 102.674, 9.151, 8.197, 48.407, 96.654)
  ),
  expr = run_global_models(dose, y, g, c(TRUE, TRUE, FALSE, TRUE), c(FALSE, TRUE, FALSE, TRUE), role = 2), setup = global_compare_reference,
  check = global_models_agree(dose, y, g, expected, c(TRUE, TRUE, FALSE, TRUE), c(FALSE, TRUE, FALSE, TRUE), TRUE, limits(), limits(), 2), check_packages = "drc",
  options = sharing_opts(gopts(TRUE, TRUE, hillSlope = TRUE), gopts(bottom = TRUE)),
  note = "A second data set of four points: is the shared Bottom justified? Six parameters against five over 15 points, a small n where AICc's correction matters.")

fixture("global-compare-model-and-sharing",
  input = list(
    dose = c(-9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5, -4.5, -4.5),
    g = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    y = c(101.586, 97.384, 99.095, 99.876, 91.428, 92.551, 79.059, 79.118, 53.651, 59.411, 18.921, 25.415, 2.132, 3.031, -4.441, 2.939, 2.476, 3.657, 0.020, -13.086, 96.540, 94.733, 104.244, 102.240, 103.644, 94.552, 99.461, 96.191, 88.666, 86.322, 57.270, 57.643, 12.418, 19.194, 9.082, 11.686, -4.830, 3.895, 7.496, 3.529)
  ),
  expr = run_global_models(dose, y, g, c(FALSE, FALSE, FALSE, TRUE), c(FALSE, FALSE, FALSE, FALSE), bounds = limits(bottom = 0, top = 100), other = limits(bottom = 0, top = 100, hill = -1), role = 1), setup = global_compare_reference,
  check = global_models_agree(dose, y, g, expected, c(FALSE, FALSE, FALSE, TRUE), c(FALSE, FALSE, FALSE, FALSE), TRUE, limits(bottom = 0, top = 100), limits(bottom = 0, top = 100, hill = -1), 1), check_packages = "drc",
  options = model_opts(model = "log-inhibitor-normalized-variable-slope", other = "log-inhibitor-normalized-standard-slope", shared = gopts(hillSlope = TRUE)),
  note = "Two stacked inhibition curves with a shared variable slope against the same with the slope held at -1 (a different model): the stacked fits are compared as a whole.")

# --- Weighting and interpolating unknowns (#100, item 40) -------------------
#
# Weighted least squares: minimise sum w (y - f)^2; SEs, CIs and the bands use
# J'WJ and s^2 = weighted SS / df (`ref_optimum` and the runs above take `w`).
# 1/Y and 1/Y^2 weights come from the fitted curve, refitted from an
# unweighted start until they settle (Prism's iterative reweighting); the
# static ones (1/X, 1/X^2, 1/SD^2) are fixed in advance. `check` fits the
# same data with drc::drm(weights =) -- which multiplies residuals by its
# weights, so it is given sqrt(w) -- given, for 1/Y and 1/Y^2, the weights
# at the reported optimum, the fixed point -- and requires the same optimum.
#
# Unknowns: the X where the fitted curve reads Y (root finding on the curve,
# not the closed-form inverse), and a 95% CI where the curve's 95% confidence
# bands cross Y (Prism's method). The check asks drc's own predict(interval =
# "confidence") whether the band there does reach Y at each end of the CI, and
# whether the curve reads Y at the estimate.
interp_agrees <- function(x, y, w, expected, log_x) {
  w <- w / mean(w) # the fit is invariant to the weights' scale; drc's numerical Hessian is not
  d <- drm(y ~ x, weights = sqrt(w), fct = L.4(), control = drmc(relTol = 1e-12, maxIt = 10000))
  ours <- c(expected$bottom$value, expected$top$value, expected$logec50$value, expected$hill$value)
  curve <- function(v) ours[1] + (ours[2] - ours[1]) / (1 + 10^((ours[3] - v) * ours[4]))
  span <- abs(ours[2] - ours[1])
  lg <- function(v) if (log_x) v else log10(v)
  mdl <- function(p, v) p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - v) * p[4]))
  grad <- function(p, v) sapply(1:4, function(i) {
    h <- 1e-6 * max(abs(p[i]), 1)
    q1 <- p; q2 <- p; q1[i] <- p[i] + h; q2[i] <- p[i] - h
    (mdl(q1, v) - mdl(q2, v)) / (2 * h)
  })
  ph <- ours
  Jm <- t(sapply(x, function(v) grad(ph, v)))
  s2 <- sum(w * (y - mdl(ph, x))^2) / (length(y) - 4)
  Ainv <- solve(crossprod(Jm, w * Jm))
  band <- function(v) {
    g <- grad(ph, v)
    mdl(ph, v) + c(-1, 1) * qt(0.975, length(y) - 4) * sqrt(drop(t(g) %*% Ainv %*% g) * s2)
  }
  n_ok <- 0
  for (u in expected$unknowns) {
    if (u$status != "ok") {
      stopifnot(u$status %in% c("beyond-bottom", "beyond-top"), is.na(u$x))
      f <- (u$y - ours[1]) / (ours[2] - ours[1])
      stopifnot(if (u$status == "beyond-bottom") f <= 0 else f >= 1)
      next
    }
    n_ok <- n_ok + 1
    stopifnot(abs(curve(lg(u$x)) - u$y) <= 1e-9 * span)
    for (e in c(u$lower, u$upper)) {
      if (is.na(e)) next
      # The band from textbook delta-method algebra (central differences for the
      # gradient), at drc's fitted parameters: drc's own weighted predict() band
      # scales its variance differently under extreme weights.
      pr <- band(lg(e))
      if (min(abs(pr - u$y)) > 2e-3 * span) {
        stop("the confidence band does not reach Y = ", u$y, " at ", e, ": ", paste(signif(pr, 6), collapse = " "))
      }
    }
    stopifnot(is.na(u$lower) || is.na(u$upper) || u$lower < u$x && u$x < u$upper || u$upper < u$x && u$x < u$lower)
  }
  stopifnot(n_ok >= 1)
  TRUE
}
final_w <- function(x, expected, pow) {
  p <- c(expected$bottom$value, expected$top$value, expected$logec50$value, expected$hill$value)
  (p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - x) * p[4])))^-pow
}

fixture("weight-y2-standard-curve",
  input = list(
    dose = rep(seq(-3, 2, length.out = 8), each = 2),
    y = c(0.058, 0.07, 0.102, 0.141, 0.297, 0.313, 0.846, 0.919, 1.68, 1.734, 2.356, 2.366, 2.496, 2.654, 2.604, 2.599),
    unk = c(0.5, 1.2, 2.0, 2.55, 0.01, 2.9)
  ),
  expr = run_fpl(dose, y, ypow = 2, unknown = unk), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, w = final_w(dose, expected, 2)) && interp_agrees(dose, y, final_w(dose, expected, 2), expected, TRUE),
  check_packages = c("drc", "randtests"),
  options = list(x = "log", weighting = "y2", interpolate = TRUE),
  note = "An ELISA-style standard curve in duplicate, 1/Y^2 weights (iteratively reweighted), six unknowns: three inside the curve, one so close to the top plateau its CI has no upper limit, one below Bottom and one above Top (no X reported, not a wrong number).")

fixture("weight-y-falling",
  input = list(
    dose = rep(seq(-9, -5, length.out = 9), each = 2),
    y = c(118.146, 118.369, 111.87, 115.723, 113.189, 115.023, 102.487, 101.852, 63.545, 70.286, 28.568, 34.048, 15.648, 17.745, 10.187, 11.418, 8.729, 7.558),
    unk = c(90, 50, 20, 2, 130)
  ),
  expr = run_fpl(dose, y, ypow = 1, unknown = unk), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, w = final_w(dose, expected, 1)) && interp_agrees(dose, y, final_w(dose, expected, 1), expected, TRUE),
  check_packages = c("drc", "randtests"),
  options = list(x = "log", weighting = "y", interpolate = TRUE),
  note = "A falling curve with 1/Y weights: the CI of an interpolated X comes from the opposite band edge to a rising curve's. Unknowns beyond either plateau are refused.")

fixture("weight-y2-held-bottom",
  input = list(
    dose = rep(seq(-3, 2, length.out = 8), each = 2),
    y = c(0.058, 0.07, 0.102, 0.141, 0.297, 0.313, 0.846, 0.919, 1.68, 1.734, 2.356, 2.366, 2.496, 2.654, 2.604, 2.599)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0.05), ypow = 2), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0.05), w = final_w(dose, expected, 2)), check_packages = c("drc", "randtests"),
  options = list(x = "log", weighting = "y2", bottom = list(kind = "fixed", value = 0.05)),
  note = "1/Y^2 weights with Bottom held at 0.05: the constraint and the weights together, df = n - 3.")

fixture("weight-x2-concentration",
  input = list(
    dose = c(0, 0, 1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06, 3e-06, 3e-06, 1e-05, 1e-05),
    y = c(0.087, 0.048, 0.142, 0.193, 0.132, 0.229, 0.339, 0.436, 0.769, 0.703, 1.247, 1.252, 1.637, 1.725, 1.876, 1.85, 1.972, 1.959, 1.983, 1.982),
    unk = c(0.5, 1.5)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, w = ifelse(dose > 0, dose^-2, 1), unknown = unk), setup = reference,
  check = drc_agrees(log10(dose[dose > 0]), y[dose > 0], expected, ref_optimum, w = dose[dose > 0]^-2) && interp_agrees(log10(dose[dose > 0]), y[dose > 0], dose[dose > 0]^-2, expected, FALSE),
  check_packages = c("drc", "randtests"),
  options = list(x = "concentration", weighting = "x2", interpolate = TRUE),
  note = "Concentrations with a zero-dose control (left out, counted), 1/X^2 weights on the doses as typed, two unknowns whose X and CI come back as concentrations.")

fixture("weight-x-concentration",
  input = list(
    dose = c(1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06, 3e-06, 3e-06, 1e-05, 1e-05),
    y = c(0.142, 0.193, 0.132, 0.229, 0.339, 0.436, 0.769, 0.703, 1.247, 1.252, 1.637, 1.725, 1.876, 1.85, 1.972, 1.959, 1.983, 1.982)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, w = 1 / dose), setup = reference,
  check = drc_agrees(log10(dose), y, expected, ref_optimum, w = 1 / dose), check_packages = c("drc", "randtests"),
  options = list(x = "concentration", weighting = "x"),
  note = "1/X weights: the lowest doses count most.")

fixture("weight-sd2-means",
  input = list(
    dose = seq(-9, -4, length.out = 7),
    y = c(2.684, 5.338, 17.937, 54.391, 83.456, 98.101, 99.855),
    sd = c(1.056, 2.372, 2.01, 5.764, 7.494, 2.864, 7.121),
    unk = c(30, 60)
  ),
  expr = run_fpl(dose, y, w = 1 / sd^2, unknown = unk), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, w = 1 / sd^2) && interp_agrees(dose, y, 1 / sd^2, expected, TRUE), check_packages = c("drc", "randtests"),
  options = list(x = "log", weighting = "sd2", interpolate = TRUE),
  note = "Seven means (each of 3 replicates) weighted by 1/SD^2: 7 points, 4 parameters, df 3. The app fits the means, with each row's SD as the weight (the table's summary form).")

fixture("compare-weight-x2",
  input = list(
    dose = c(0, 0, 1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06, 3e-06, 3e-06, 1e-05, 1e-05),
    y = c(0.087, 0.048, 0.142, 0.193, 0.132, 0.229, 0.339, 0.436, 0.769, 0.703, 1.247, 1.252, 1.637, 1.725, 1.876, 1.85, 1.972, 1.959, 1.983, 1.982)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, alt = limits(hill = 1), w = ifelse(dose > 0, dose^-2, 1)), setup = reference,
  check = compare_agrees(dose, y, expected, FALSE, limits(), limits(hill = 1), w = ifelse(dose > 0, dose^-2, 1)),
  options = list(x = "concentration", weighting = "x2", compare = list(hillSlope = 1)),
  note = "A comparison of two fits with the same fixed 1/X^2 weights (so their weighted sums of squares are comparable), against nls(weights =).")

gw_dose <- c(seq(-9, -4, length.out = 10), seq(-9, -4, length.out = 8))
gw_g <- c(rep(1, 10), rep(2, 8))
gw_y <- c(6.365, 7.925, 14.948, 34.185, 72.269, 82.821, 97.767, 92.967, 93.81, 98.242, 6.448, 6.116, 8.188, 16.461, 50.282, 77.942, 87.001, 95.377)

fixture("global-weight-y2",
  input = list(dose = gw_dose, g = gw_g, y = replace(replace(gw_y, 3, NA), 14, NA), u = c(40, 30, 3), ug = c(1, 2, 2)),
  expr = run_global(dose, y, g, shared = c(FALSE, FALSE, FALSE, TRUE), ypow = 2, unknown = list(u[ug == 1], u[ug == 2])), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(FALSE, FALSE, FALSE, TRUE), TRUE, limits(),
    w = vapply(seq_along(dose), function(r) {
      s <- expected$series[[match(g[r], sort(unique(g)))]]
      ref_curve(dose[r], c(s$bottom$value, s$top$value, s$logec50$value, s$hill$value))^-2
    }, 0)),
  check_packages = "drc",
  options = list(x = "log", weighting = "y2", interpolate = TRUE, shared = gopts(hillSlope = TRUE)),
  note = "Two curves of unequal size (a missing response in each), one HillSlope shared, 1/Y^2 weights reweighted on the stacked fit; one unknown in the first data set and two in the second (the last below Bottom).", parity = FALSE)

fixture("global-weight-y-all-shared",
  input = list(dose = gw_dose, g = gw_g, y = gw_y, u = c(50), ug = c(1)),
  expr = run_global(dose, y, g, shared = c(TRUE, TRUE, TRUE, TRUE), ypow = 1, unknown = list(u[ug == 1], numeric(0))), setup = global_reference,
  check = global_drc_agrees(dose, y, g, expected, c(TRUE, TRUE, TRUE, TRUE), TRUE, limits(),
    w = ref_curve(dose, c(expected$series[[1]]$bottom$value, expected$series[[1]]$top$value, expected$series[[1]]$logec50$value, expected$series[[1]]$hill$value))^-1),
  check_packages = "drc",
  options = list(x = "log", weighting = "y", interpolate = TRUE, shared = gopts(TRUE, TRUE, TRUE, TRUE)),
  note = "Everything shared: one curve through both data sets with 1/Y weights.", parity = FALSE)

fixture("global-compare-weight-x",
  input = list(
    dose = c(1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1, 4, 8, 32, 64, 128, 256, 512),
    g = c(rep(1, 10), rep(2, 8)),
    y = c(7.3, 5.39, 13.52, 12.57, 31.73, 42.51, 66.18, 78.04, 91.15, 92.83, 4.01, 9.72, 6.43, 27.51, 38.92, 61.77, 74.7, 87.55)
  ),
  expr = run_global_models(dose, y, g, c(FALSE, FALSE, TRUE, FALSE), c(FALSE, FALSE, FALSE, FALSE), log_x = FALSE, role = 2, w = dose^-1), setup = global_compare_reference,
  check = global_models_agree(dose, y, g, expected, c(FALSE, FALSE, TRUE, FALSE), c(FALSE, FALSE, FALSE, FALSE), FALSE, limits(), limits(), 2, w = dose^-1), check_packages = "drc",
  options = sharing_opts(gopts(logEc50 = TRUE), gopts(logEc50 = TRUE), x = "concentration", weighting = "x"),
  note = "A shared-vs-separate EC50 comparison of concentration data (1 to 512) with 1/X weights, both stacked fits weighted alike, against drc's anova().")

# --- Profile-likelihood CIs (#99, item 41) ----------------------------------
#
# `run_fpl(..., profile = TRUE)`: each estimated parameter's 95% CI is where
# its profiled sum of squares reaches SS0 (1 + F(0.95; 1, df) / df), found by
# the reference's own optimiser and uniroot (see `ref_profile`); a side that
# never gets there is NA (unbounded). `check` uses base R's nls, a different
# fitter, in two ways: (1) refitting with the parameter held at each finite
# end, the sum of squares must equal that threshold (1e-6), which is what the
# definition says; (2) stats::confint() (profile.nls, a spline through a
# handful of profile points) must land near the same ends, within 5% of the
# Wald SE -- a sanity check on the reference, not a 1e-6 comparison. A
# reported open side must still be under the threshold with the parameter
# a million SEs away.
profile_agrees <- function(x, y, expected, w = NULL, spline = TRUE) {
  if (is.null(w)) w <- rep(1, length(x))
  # The profile is unchanged by rescaling the weights (the threshold scales
  # with them); nls converges far better on weights near 1 than near 1e18.
  w <- w / max(w)
  curve4 <- function(x, p) p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - x) * p[4]))
  parts <- list(expected$bottom, expected$top, expected$logec50, expected$hill)
  val <- vapply(parts, function(p) p$value, 0)
  held <- vapply(parts, function(p) p$status != "fitted", TRUE)
  nm <- c("b", "t", "l", "h")
  nfit <- function(pin = NULL, from = NULL) {
    # pin: c(index, value) -- one more parameter held for the refit
    fix <- held
    v <- val
    if (!is.null(pin)) {
      fix[pin[1]] <- TRUE
      v[pin[1]] <- pin[2]
    }
    terms <- ifelse(fix, format(v, digits = 17), nm)
    fml <- as.formula(paste0("y ~ curve4(x, c(", paste(terms, collapse = ", "), "))"))
    environment(fml) <- environment()
    start <- as.list(setNames(if (is.null(from)) val[!fix] else from[!fix], nm[!fix]))
    ctl <- nls.control(maxiter = 500, tol = 1e-10, scaleOffset = 1)
    # A pinned parameter can leave nls's Gauss-Newton with a singular
    # gradient: retry with the port algorithm, then from a BFGS optimum.
    tryCatch(
      nls(fml, start = start, weights = w, control = ctl),
      error = function(e) {
        tryCatch(
          nls(fml, start = start, weights = w, algorithm = "port", control = ctl),
          error = function(e) {
            ssq <- function(q) {
              v[!fix] <- q
              sum(w * (y - curve4(x, v))^2)
            }
            o <- optim(unlist(start), ssq, method = "BFGS", control = list(maxit = 5000, reltol = 1e-15))
            tryCatch(
              nls(fml, start = as.list(setNames(o$par, nm[!fix])), weights = w, algorithm = "port", control = ctl),
              error = function(e) list(value = o$value)
            )
          }
        )
      }
    )
  }
  full <- nfit()
  stopifnot(inherits(full, "nls"))
  k <- sum(!held)
  df <- length(x) - k
  ss0 <- sum(w * (y - curve4(x, val))^2)
  thr <- ss0 * (1 + qf(0.95, 1, df) / df)
  checked <- 0
  for (i in which(!held)) {
    pr <- parts[[i]]
    stopifnot(is.na(pr$lower) || pr$lower < pr$value, is.na(pr$upper) || pr$upper > pr$value)
    for (e in c(pr$lower, pr$upper)) {
      if (is.na(e)) next
      m <- nfit(c(i, e))
      stopifnot(!is.null(m))
      ss <- if (inherits(m, "nls")) deviance(m) else m$value
      if (abs(ss - thr) > 1e-6 * thr) stop("parameter ", i, " end ", e, ": profiled SS ", ss, " vs threshold ", thr)
      checked <- checked + 1
    }
    # An open side: the sum of squares stays under the threshold far away.
    for (side in c("lower", "upper")) {
      if (!is.na(pr[[side]])) next
      # Walked out in steps, each refit warm-started from the last (a
      # cold start a million SEs away is a bad start, not a finding).
      cur <- val
      dir <- if (side == "lower") -1 else 1
      for (mult in c(1, 2, 4, 8, 16, 32, 64, 128, 1e3, 1e4, 1e5, 1e6)) {
        theta <- pr$value + dir * mult * pr$se
        cur[i] <- theta
        m <- nfit(c(i, theta), from = cur)
        if (is.null(m) || !inherits(m, "nls")) break
        if (deviance(m) > thr) stop("parameter ", i, " ", side, " is open but the profile exceeds the threshold at ", mult, " SEs")
        cf <- coef(m)
        cur[!held & seq_along(cur) != i] <- unname(cf[nm[!held & seq_along(cur) != i]])
      }
      checked <- checked + 1
    }
  }
  stopifnot(checked >= 1)
  # confint()'s spline through a few profile points is rough where a
  # profile is steep and lopsided; there only the definition (above) is checked.
  ci <- if (!spline) NULL else tryCatch(suppressMessages(suppressWarnings(confint(full))), error = function(e) NULL)
  if (!is.null(ci)) {
    rows <- nm[!held]
    for (j in seq_along(rows)) {
      pr <- parts[[which(!held)[j]]]
      for (s in 1:2) {
        e <- c(pr$lower, pr$upper)[s]
        m <- ci[rows[j], s]
        if (is.na(e) || is.na(m)) next
        if (abs(m - e) > 0.05 * pr$se) stop("confint() ", rows[j], " side ", s, ": ", m, " vs ", e)
      }
    }
  }
  TRUE
}

fixture("profile-rising",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, profile = TRUE), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum) && profile_agrees(dose, y, expected), check_packages = c("drc", "randtests"),
  options = list(x = "log", ci = "profile"),
  note = "A well-determined rising curve in triplicate: the profile CIs sit close to, but not exactly at, the symmetric ones.")

fixture("profile-falling",
  input = list(
    dose = c(-10, -10, -9.5, -9.5, -9, -9, -8.5, -8.5, -8, -8, -7.5, -7.5, -7, -7, -6.5, -6.5, -6, -6, -5.5, -5.5, -5, -5),
    y = c(102.1, 98.09, 105.861, 102.554, 91.793, 92.734, 97.061, 94.949, 88.562, 82.085, 66.684, 60.547, 45.538, 51.583, 29.042, 29.358, 23.183, 19.333, 20.124, 17.618, 12.954, 6.86)
  ),
  expr = run_fpl(dose, y, profile = TRUE), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum) && profile_agrees(dose, y, expected), check_packages = c("drc", "randtests"),
  options = list(x = "log", ci = "profile"),
  note = "A falling curve in duplicate (negative HillSlope): the profile of HillSlope and the plateaus is asymmetric.")

fixture("profile-one-plateau",
  input = list(dose = c(-9, -8, -7, -6, -5, -4), y = c(3.065, 2.931, 3.169, 4.152, 17.677, 66.327)),
  expr = run_fpl(dose, y, profile = TRUE), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum) && profile_agrees(dose, y, expected), check_packages = c("drc", "randtests"),
  options = list(x = "log", ci = "profile"),
  note = "Six doses that stop before the top plateau (df 2): the profile of Top (and of HillSlope) is unbounded on one side, reported as open rather than as a number or NaN.")

fixture("profile-concentration",
  input = list(
    dose = c(0, 0, 1e-10, 1e-10, 3e-10, 3e-10, 1e-09, 1e-09, 3e-09, 3e-09, 1e-08, 1e-08, 3e-08, 3e-08, 1e-07, 1e-07, 3e-07, 3e-07, 1e-06, 1e-06),
    y = c(0.199, 0.104, 0.275, 0.181, 0.216, 0.162, 0.379, 0.306, 0.616, 0.597, 1.175, 1.146, 1.676, 1.859, 1.691, 1.995, 1.972, 1.812, 1.998, 1.934)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, profile = TRUE), setup = reference,
  check = drc_agrees(log10(dose[dose > 0]), y[dose > 0], expected, ref_optimum) && profile_agrees(log10(dose[dose > 0]), y[dose > 0], expected), check_packages = c("drc", "randtests"),
  options = list(x = "concentration", ci = "profile"),
  note = "Concentrations with a zero-dose control (left out): the EC50's CI is 10^ of the LogEC50 profile bounds, so it is asymmetric on the concentration scale and keeps its magnitude (about 1e-8).")

fixture("profile-single-replicates",
  input = list(
    dose = c(-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4),
    y = c(5.589, 4.182, 5.636, 11.206, 28.768, 43.33, 78.544, 94.795, 96.552, 94.739, 96.338)
  ),
  expr = run_fpl(dose, y, profile = TRUE), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum) && profile_agrees(dose, y, expected), check_packages = c("drc", "randtests"),
  options = list(x = "log", ci = "profile"),
  note = "One point per dose (df 7): the profile CIs are noticeably lopsided, unlike the symmetric ones.")

fixture("profile-small-n-standard-slope",
  input = list(dose = c(-8, -7, -6, -5, -4), y = c(2.53, 7.68, 26.48, 54.6, 58.73)),
  expr = run_fpl(dose, y, bounds = limits(hill = 1), profile = TRUE), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(hill = 1)) && profile_agrees(dose, y, expected), check_packages = c("drc", "randtests"),
  options = list(x = "log", model = "log-agonist-standard-slope", ci = "profile"),
  note = "Five points, standard slope (HillSlope held at 1): three parameters, df 2, where the F cut-off is large and the profile CIs are far from symmetric.")

fixture("profile-bottom-zero",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, bounds = limits(bottom = 0), profile = TRUE), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, limits(bottom = 0)) && profile_agrees(dose, y, expected), check_packages = c("drc", "randtests"),
  options = list(x = "log", bottom = list(kind = "fixed", value = 0), ci = "profile"),
  note = "Bottom held at 0: only the three estimated parameters are profiled (K = 3, df = n - 3); Bottom is reported as fixed with no CI.")

fixture("profile-weight-x-concentration",
  input = list(
    dose = 10^c(-3, -3, -3, -2.5, -2.5, -2.5, -2, -2, -2, -1.5, -1.5, -1.5, -1, -1, -1, -0.5, -0.5, -0.5, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 1.5, 1.5, 1.5, 2, 2, 2),
    y = c(5.589, 6.618, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, 9.828, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, 78.544, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, 93.927, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose, y, log_x = FALSE, w = 1 / dose, profile = TRUE), setup = reference,
  check = drc_agrees(log10(dose), y, expected, ref_optimum, w = 1 / dose) && profile_agrees(log10(dose), y, expected, w = 1 / dose), check_packages = c("drc", "randtests"),
  options = list(x = "concentration", weighting = "x", ci = "profile"),
  note = "Concentrations weighted 1/X: the profile uses the weighted sum of squares and the weighted threshold.")

fixture("profile-weight-sd2-means",
  input = list(
    dose = seq(-9, -4, length.out = 7),
    y = c(2.684, 5.338, 17.937, 54.391, 83.456, 98.101, 99.855),
    sd = c(1.056, 2.372, 2.01, 5.764, 7.494, 2.864, 7.121)
  ),
  expr = run_fpl(dose, y, w = 1 / sd^2, profile = TRUE), setup = reference,
  check = drc_agrees(dose, y, expected, ref_optimum, w = 1 / sd^2) && profile_agrees(dose, y, expected, w = 1 / sd^2), check_packages = c("drc", "randtests"),
  options = list(x = "log", weighting = "sd2", ci = "profile"),
  note = "Seven means weighted by 1/SD^2 (df 3): a weighted profile with few degrees of freedom.")

fixture("profile-missing",
  input = list(
    dose = c(-9, -9, -9, -8.5, -8.5, -8.5, -8, -8, -8, -7.5, -7.5, -7.5, -7, -7, -7, -6.5, -6.5, -6.5, -6, -6, -6, -5.5, -5.5, -5.5, -5, -5, -5, -4.5, -4.5, -4.5, -4, -4, -4),
    y = c(5.589, NA, 7.407, 4.182, 2.043, 4.026, 5.636, 11.856, NA, 11.206, 8.831, 10.496, 28.768, 26.998, 24.31, 43.33, 39.181, 43.052, NA, 74.003, 75.818, 94.795, 92.955, 80.121, 96.552, 91.76, NA, 94.739, 86.227, 96.495, 96.338, 92.824, 97.532)
  ),
  expr = run_fpl(dose[!is.na(y)], y[!is.na(y)], profile = TRUE), setup = reference,
  check = drc_agrees(dose[!is.na(y)], y[!is.na(y)], expected, ref_optimum) && profile_agrees(dose[!is.na(y)], y[!is.na(y)], expected), check_packages = c("drc", "randtests"),
  options = list(x = "log", ci = "profile"),
  note = "Four empty cells: they are left out (counted), and the profile threshold uses n - K with the remaining n.")
