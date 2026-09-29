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
    r <- 1 + sum(s[-1] != s[-length(s)])
    m <- 2 * n1 * n2 / (n1 + n2) + 1
    v <- (m - 1) * (m - 2) / (n1 + n2 - 1)
    z <- (r - m) / sqrt(v)
    list(ran = TRUE, n_runs = r, n_pos = n1, n_neg = n2, z = z, p = 2 * pnorm(-abs(z)))
  }
  ref_optimum <- function(x, y, start = NULL, lower = rep(-Inf, 4), upper = rep(Inf, 4)) {
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
          fit <- qr.coef(qr(X[, free, drop = FALSE]), y - X[, !free, drop = FALSE] %*% co[!free])
          if (any(!is.finite(fit))) next
          co[free] <- pmin(pmax(fit, lower[1:2][free]), upper[1:2][free])
        }
        rss <- sum((y - X %*% co)^2)
        if (rss < best[1]) best <- c(rss, co, l, h)
      }
    }
    # unname(): a named number comes back from WebR as an object (CLAUDE.md).
    p <- unname(best[2:5])
    p <- pmin(pmax(p, lower), upper)
    rss <- function(p) sum((y - ref_curve(x, p))^2)
    # Projected Levenberg-Marquardt on the parameters `idx`: a step that would
    # leave the bounds is clipped to them.
    lm <- function(p, idx) {
      lambda <- 1e-3
      for (it in 1:1000) {
        J <- ref_jacobian(x, p)[, idx, drop = FALSE]
        A <- crossprod(J)
        step <- unname(drop(solve(A + lambda * diag(diag(A), length(idx)), crossprod(J, y - ref_curve(x, p)))))
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
      J <- ref_jacobian(x, p)[, idx, drop = FALSE]
      p[idx] <- p[idx] + unname(drop(qr.coef(qr(J), y - ref_curve(x, p))))
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
  run_fpl_one <- function(dose, y, log_x = TRUE, bounds = limits()) {
    lower <- bounds$lower
    upper <- bounds$upper
    dropped <- if (log_x) 0 else sum(dose <= 0)
    if (!log_x) {
      y <- y[dose > 0]
      dose <- dose[dose > 0]
    }
    x <- if (log_x) dose else log10(dose)
    back <- if (log_x) function(v) v else function(v) 10^v
    n <- length(x)
    fixed <- lower == upper
    p <- ref_optimum(x, y, lower = lower, upper = upper)
    idx <- which(!fixed & p > lower & p < upper)
    J <- ref_jacobian(x, p)[, idx, drop = FALSE]
    A <- crossprod(J)
    Ainv <- solve(A)
    fitted <- ref_curve(x, p)
    resid <- y - fitted
    df <- n - length(idx)
    ss <- sum(resid^2)
    s2 <- ss / df
    se <- sqrt(s2 * diag(Ainv))
    dependency <- 1 - 1 / (diag(A) * diag(Ainv))
    t <- qt(0.975, df)
    ord <- order(x)
    signs <- sign(resid[ord])
    grid <- seq(min(x), max(x), length.out = 100)
    G <- ref_jacobian(grid, p)[, idx, drop = FALSE]
    var_fit <- vapply(seq_along(grid), function(i) drop(G[i, ] %*% Ainv %*% G[i, ]), 0) * s2
    fit_grid <- ref_curve(grid, p)
    par <- function(i) {
      j <- match(i, idx)
      if (is.na(j)) return(ref_held(p[i], if (fixed[i]) "fixed" else "at_bound"))
      ref_param(p[i], se[j], t, dependency[j])
    }
    j3 <- match(3, idx)
    list(
      n = n, dropped = dropped, ran = TRUE,
      bottom = par(1), top = par(2), logec50 = par(3), hill = par(4),
      ec50 = 10^p[3], ec50_lower = 10^(p[3] - t * se[j3]), ec50_upper = 10^(p[3] + t * se[j3]),
      df = df, ss = ss, syx = sqrt(s2), r2 = 1 - ss / sum((y - mean(y))^2),
      x = back(x[ord]), y = y[ord], fitted = fitted[ord], residual = resid[ord],
      runs = ref_runs(signs[signs != 0]),
      band = list(
        x = back(grid), fit = fit_grid,
        confidence_lower = fit_grid - t * sqrt(var_fit),
        confidence_upper = fit_grid + t * sqrt(var_fit),
        prediction_lower = fit_grid - t * sqrt(var_fit + s2),
        prediction_upper = fit_grid + t * sqrt(var_fit + s2)
      )
    )
  }
  # Model comparison (#98): the fit against the same curve with some
  # parameters held at constants (`alt`, limits() of the simpler model, the
  # fit's own constraints included), by the textbook formulas:
  #   F = ((SS_simple - SS_fit) / (df_simple - df_fit)) / (SS_fit / df_fit)
  #   AICc = n ln(SS/n) + 2K + 2K(K+1)/(n - K - 1), K = parameters + 1
  # and Akaike weights exp(-delta/2) / sum. P from pf(lower.tail = FALSE): 1 - pf()
  # loses a small P's digits.
  run_fpl <- function(dose, y, log_x = TRUE, bounds = limits(), alt = NULL) {
    fit <- run_fpl_one(dose, y, log_x, bounds)
    if (is.null(alt) || !isTRUE(fit$ran)) return(fit)
    s <- run_fpl_one(dose, y, log_x, alt)
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
compare_agrees <- function(dose, y, expected, log_x, bounds, alt) {
  x <- if (log_x) dose else log10(dose)
  if (!log_x) y <- y[dose > 0]
  if (!log_x) x <- x[dose > 0]
  cmp <- expected$comparison
  ref <- function(p) function(x) p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - x) * p[4]))
  build <- function(lim, p) {
    fixed <- lim$lower == lim$upper
    terms <- ifelse(fixed, format(lim$lower, digits = 17), c("b", "t", "l", "h"))
    fml <- as.formula(paste0("y ~ (", terms[1], ") + ((", terms[2], ") - (", terms[1], ")) / (1 + 10^(((", terms[3], ") - x) * (", terms[4], ")))"))
    nls(fml, start = as.list(setNames(p, c("b", "t", "l", "h"))[!fixed]),
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
drc_agrees <- function(x, y, expected, ref_optimum, bounds = list(lower = rep(-Inf, 4), upper = rep(Inf, 4))) {
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
    drm(y ~ x, fct = L.4(), control = drmc(relTol = 1e-12, maxIt = 10000))
  } else {
    drm(y ~ x, fct = L.4(fixed = fixed_b), lowerl = lowerl[free], upperl = upperl[free],
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
  polished <- ref_optimum(x, y, start = drc_p, lower = lower, upper = upper)
  rel <- abs(polished - ours) / pmax(abs(ours), 1e-8)
  if (max(rel) > 1e-6) stop("drc's optimum differs: ", paste(signif(drc_p, 8), collapse = ", "), " vs ours ", paste(signif(ours, 8), collapse = ", "), " polished ", paste(signif(polished, 8), collapse = ", "))
  if (max(abs(drc_p - ours) / pmax(abs(ours), 1e-8)) > 1e-2) stop("drc is far off: ", paste(signif(drc_p, 8), collapse = ", "))
  s <- sign(expected$residual)
  rt <- runs.test(s[s != 0], threshold = 0)
  stopifnot(
    rt$runs == expected$runs$n_runs,
    abs(rt$p.value - expected$runs$p) < 1e-10 * max(1, rt$p.value)
  )
  # Kuhn-Tucker at every limit the fit sits on: the sum of squares can only
  # rise by moving inward (its gradient points inward there).
  ref_curve <- function(x, p) p[1] + (p[2] - p[1]) / (1 + 10^((p[3] - x) * p[4]))
  rss <- function(p) sum((y - ref_curve(x, p))^2)
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
