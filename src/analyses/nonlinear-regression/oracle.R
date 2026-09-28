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
  ref_optimum <- function(x, y, start = NULL) {
    best <- c(Inf, NA, NA, NA, NA)
    if (!is.null(start)) best <- c(0, start)
    if (is.null(start)) for (l in seq(min(x), max(x), length.out = 41)) {
      for (h in c(-seq(0.1, 5, by = 0.05), seq(0.1, 5, by = 0.05))) {
        f <- 1 / (1 + 10^((l - x) * h))
        X <- cbind(1 - f, f)
        co <- qr.coef(qr(X), y)
        if (any(!is.finite(co))) next
        rss <- sum((y - X %*% co)^2)
        if (rss < best[1]) best <- c(rss, co, l, h)
      }
    }
    # unname(): a named number comes back from WebR as an object (CLAUDE.md).
    p <- unname(best[2:5])
    rss <- function(p) sum((y - ref_curve(x, p))^2)
    lambda <- 1e-3
    for (it in 1:1000) {
      J <- ref_jacobian(x, p)
      A <- crossprod(J)
      step <- unname(drop(solve(A + lambda * diag(diag(A)), crossprod(J, y - ref_curve(x, p)))))
      if (rss(p + step) <= rss(p)) {
        p <- p + step
        lambda <- lambda / 10
      } else {
        lambda <- lambda * 10
      }
      if (max(abs(step) / pmax(abs(p), 1e-8)) < 1e-14 || lambda > 1e12) break
    }
    # Near the optimum the sum of squares changes by less than its own
    # rounding, so the LM above can stall a hair short of it; plain
    # Gauss-Newton steps converge the rest of the way.
    for (it in 1:5) {
      J <- ref_jacobian(x, p)
      p <- p + unname(drop(qr.coef(qr(J), y - ref_curve(x, p))))
    }
    if (p[1] > p[2]) p <- c(p[2], p[1], p[3], -p[4])
    p
  }
  ref_param <- function(value, se, t, dependency) {
    list(
      value = value, se = se, lower = value - t * se, upper = value + t * se,
      dependency = dependency, ambiguous = dependency > 0.9999
    )
  }
  # dose: X as entered; log_x: whether it is already log10(dose).
  run_fpl <- function(dose, y, log_x = TRUE) {
    dropped <- if (log_x) 0 else sum(dose <= 0)
    if (!log_x) {
      y <- y[dose > 0]
      dose <- dose[dose > 0]
    }
    x <- if (log_x) dose else log10(dose)
    back <- if (log_x) function(v) v else function(v) 10^v
    n <- length(x)
    p <- ref_optimum(x, y)
    J <- ref_jacobian(x, p)
    A <- crossprod(J)
    Ainv <- solve(A)
    fitted <- ref_curve(x, p)
    resid <- y - fitted
    df <- n - 4
    ss <- sum(resid^2)
    s2 <- ss / df
    se <- sqrt(s2 * diag(Ainv))
    dependency <- 1 - 1 / (diag(A) * diag(Ainv))
    t <- qt(0.975, df)
    ord <- order(x)
    signs <- sign(resid[ord])
    grid <- seq(min(x), max(x), length.out = 100)
    G <- ref_jacobian(grid, p)
    var_fit <- vapply(seq_along(grid), function(i) drop(G[i, ] %*% Ainv %*% G[i, ]), 0) * s2
    fit_grid <- ref_curve(grid, p)
    list(
      n = n, dropped = dropped, ran = TRUE,
      bottom = ref_param(p[1], se[1], t, dependency[1]),
      top = ref_param(p[2], se[2], t, dependency[2]),
      logec50 = ref_param(p[3], se[3], t, dependency[3]),
      hill = ref_param(p[4], se[4], t, dependency[4]),
      ec50 = 10^p[3], ec50_lower = 10^(p[3] - t * se[3]), ec50_upper = 10^(p[3] + t * se[3]),
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
})

# drc agrees on the optimum; randtests on the runs test. x: the log doses
# actually fitted; ref_optimum: the reference fit, from the case's setup.
drc_agrees <- function(x, y, expected, ref_optimum) {
  d <- drm(y ~ x, fct = L.4(), control = drmc(relTol = 1e-12, maxIt = 10000))
  b <- unname(coef(d))
  drc_p <- c(b[2], b[3], b[4], -b[1] / log(10))
  if (drc_p[1] > drc_p[2]) drc_p <- c(drc_p[2], drc_p[1], drc_p[3], -drc_p[4])
  ours <- c(expected$bottom$value, expected$top$value, expected$logec50$value, expected$hill$value)
  # drc's optim stops short of the optimum on a flat valley; polished from
  # where it stopped, it must land on the same optimum as the reference.
  polished <- ref_optimum(x, y, start = drc_p)
  rel <- abs(polished - ours) / pmax(abs(ours), 1e-8)
  if (max(rel) > 1e-6) stop("drc's optimum differs: ", paste(signif(drc_p, 8), collapse = ", "))
  if (max(abs(drc_p - ours) / pmax(abs(ours), 1e-8)) > 1e-2) stop("drc is far off: ", paste(signif(drc_p, 8), collapse = ", "))
  s <- sign(expected$residual)
  rt <- runs.test(s[s != 0], threshold = 0)
  stopifnot(
    rt$runs == expected$runs$n_runs,
    abs(rt$p.value - expected$runs$p) < 1e-10 * max(1, rt$p.value)
  )
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
