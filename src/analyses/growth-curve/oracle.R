# Fixtures for growth curve analysis, Zwietering's reparameterized
# Gompertz growth model (item 33, #94).
#
# Independent of analysis.R (CLAUDE.md): the reference fit is a coarse
# grid over (A, mumax, lambda) -- wider and coarser than the app's
# heuristic-informed multi-start, and built from generic data-driven
# bounds rather than the app's own tangent-line heuristic -- polished by
# a hand-written Levenberg-Marquardt using a five-point finite-difference
# Jacobian (the app uses an analytic one). Base R only, so the parity
# test reruns it in WebR.
#
# Each case's `check` then converts the reference's (A, mumax, lambda) to
# the classical Gompertz parameterization (Y = K exp(-exp(log(K/Y0) -
# mu_c t)), the same curve under a different, more fragile
# parameterization -- confirmed algebraically and numerically before any
# fixture was written) and refits *that* form with base `nls()`, seeded
# at the converted point: a second, independently-coded optimizer
# (`nls`'s own Gauss-Newton, numeric derivatives) on a differently
# conditioned parameterization, required to reconverge to the same curve.
# Not a blind cross-check with its own starting values, unlike note 32's
# `drc` run -- no package fits this parameterization directly, and
# prototyping showed the classical form can't be trusted to find the
# global optimum from generic starts (log(Y0/K) blows up when the lag
# phase starts near Y = 0, confirmed with `growthrates::grow_gompertz`
# before writing this note) -- accepted because the from-scratch
# reference already used a *grid* search, not a single local optimizer
# run, to find the global optimum before any seeding happens. Also
# checks the runs test against randtests::runs.test.

reference <- quote({
  ref_curve <- function(t, p) p[1] * exp(-exp((p[2] * exp(1) / p[1]) * (p[3] - t) + 1))
  # Five-point central differences, the same construction as note 32's
  # reference Jacobian, but a smaller step (1e-4 there): near the model's
  # own asymptote the argument to the inner exp() moves fast enough with
  # the parameters that 1e-4 left the finite-difference derivative about
  # 1.6e-4 relative off the analytic one at the far pre-lag tail
  # (confirmed numerically before writing this note) -- truncation error
  # from too coarse a step, not a formula disagreement: 1e-6 brought every
  # grid point checked back under 1e-6, comfortably inside a 1e-6 fixture
  # comparison, without reintroducing rounding error at the well-behaved
  # points a much smaller step would risk.
  ref_jacobian <- function(t, p) {
    sapply(1:3, function(j) {
      h <- 1e-6
      at <- function(k) {
        q <- p
        q[j] <- p[j] + k * h
        ref_curve(t, q)
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
  # A coarse grid over (lambda, mumax), A at three multiples of max(y),
  # built from the data's own range and its steepest observed slope --
  # generic bounds, not the app's tangent-line heuristic -- then a
  # Levenberg-Marquardt polish from the grid's best point.
  ref_optimum <- function(t, y, start = NULL) {
    best <- c(Inf, NA, NA, NA)
    if (!is.null(start)) best <- c(0, start)
    if (is.null(start)) {
      span <- max(t) - min(t)
      lambda_grid <- seq(min(t) - span * 0.5, max(t) + span * 0.5, length.out = 21)
      yr <- max(y) - min(y)
      ord <- order(t)
      d <- diff(y[ord]) / diff(t[ord])
      slope <- max(d[is.finite(d)], yr / span)
      mumax_grid <- exp(seq(log(slope / 50), log(slope * 5), length.out = 25))
      a_grid <- max(y) * c(1, 1.1, 1.3)
      for (lambda in lambda_grid) for (mumax in mumax_grid) for (a in a_grid) {
        rss <- sum((y - ref_curve(t, c(a, mumax, lambda)))^2)
        if (is.finite(rss) && rss < best[1]) best <- c(rss, a, mumax, lambda)
      }
    }
    p <- unname(best[2:4])
    rss <- function(p) sum((y - ref_curve(t, p))^2)
    lambda_lm <- 1e-3
    for (it in 1:1000) {
      J <- ref_jacobian(t, p)
      A <- crossprod(J)
      step <- tryCatch(
        unname(drop(solve(A + lambda_lm * diag(diag(A)), crossprod(J, y - ref_curve(t, p))))),
        error = function(e) NULL
      )
      if (is.null(step) || any(!is.finite(step))) {
        lambda_lm <- lambda_lm * 10
        if (lambda_lm > 1e12) break
        next
      }
      if (rss(p + step) <= rss(p)) {
        p <- p + step
        lambda_lm <- lambda_lm / 10
      } else {
        lambda_lm <- lambda_lm * 10
      }
      if (max(abs(step) / pmax(abs(p), 1e-8)) < 1e-14 || lambda_lm > 1e12) break
    }
    # Plain Gauss-Newton finishes it, the same reason as note 32's: this
    # close, the sum of squares changes by less than its own rounding.
    for (it in 1:5) {
      J <- ref_jacobian(t, p)
      step <- tryCatch(unname(drop(qr.coef(qr(J), y - ref_curve(t, p)))), error = function(e) NULL)
      if (is.null(step) || any(!is.finite(step))) break
      p <- p + step
    }
    p
  }
  ref_quantity <- function(value, se, t) {
    list(value = value, se = se, lower = value - t * se, upper = value + t * se)
  }
  run_gc <- function(t, y) {
    n <- length(t)
    p <- ref_optimum(t, y)
    J <- ref_jacobian(t, p)
    A <- crossprod(J)
    Ainv <- solve(A)
    fitted <- ref_curve(t, p)
    resid <- y - fitted
    df <- n - 3
    ss <- sum(resid^2)
    s2 <- ss / df
    se <- sqrt(s2 * diag(Ainv))
    tcrit <- qt(0.975, df)
    ord <- order(t)
    signs <- sign(resid[ord])
    grid <- seq(min(t), max(t), length.out = 100)
    G <- ref_jacobian(grid, p)
    var_fit <- vapply(seq_along(grid), function(i) drop(G[i, ] %*% Ainv %*% G[i, ]), 0) * s2
    fit_grid <- ref_curve(grid, p)
    doubling_grad <- c(0, -log(2) / p[2]^2, 0)
    doubling_se <- sqrt(drop(doubling_grad %*% Ainv %*% doubling_grad) * s2)
    tau_grad <- c(1 / p[2], -p[1] / p[2]^2, 1)
    tau_se <- sqrt(drop(tau_grad %*% Ainv %*% tau_grad) * s2)
    list(
      n = n, ran = TRUE,
      asymptote = ref_quantity(p[1], se[1], tcrit),
      growth_rate = ref_quantity(p[2], se[2], tcrit),
      lag = ref_quantity(p[3], se[3], tcrit),
      doubling_time = ref_quantity(log(2) / p[2], doubling_se, tcrit),
      exponential_end = ref_quantity(p[3] + p[1] / p[2], tau_se, tcrit),
      df = df, ss = ss, syx = sqrt(s2), r2 = 1 - ss / sum((y - mean(y))^2),
      x = t[ord], y = y[ord], fitted = fitted[ord], residual = resid[ord],
      runs = ref_runs(signs[signs != 0]),
      band = list(
        x = grid, fit = fit_grid,
        confidence_lower = fit_grid - tcrit * sqrt(var_fit),
        confidence_upper = fit_grid + tcrit * sqrt(var_fit),
        prediction_lower = fit_grid - tcrit * sqrt(var_fit + s2),
        prediction_upper = fit_grid + tcrit * sqrt(var_fit + s2)
      )
    )
  }
})

# Converts (A, mumax, lambda) to the classical parameterization and
# refits it with nls(), seeded at that point: a second, independent
# optimizer confirming the reference's optimum (see the note above).
classical_agrees <- function(t, y, expected) {
  a <- expected$asymptote$value
  mumax <- expected$growth_rate$value
  lambda <- expected$lag$value
  mumax_c <- mumax * exp(1) / a
  y0 <- a * exp(-(mumax_c * lambda + 1))
  m <- nls(y ~ k * exp(-exp(log(k / y0) - mu * t)),
    data = list(t = t, y = y), start = list(y0 = y0, mu = mumax_c, k = a),
    control = nls.control(maxiter = 500, warnOnly = TRUE)
  )
  co <- coef(m)
  k <- unname(co["k"])
  mu <- unname(co["mu"])
  y0f <- unname(co["y0"])
  back <- c(k, mu * k / exp(1), (log(k / y0f) - 1) / mu)
  ours <- c(a, mumax, lambda)
  rel <- abs(back - ours) / pmax(abs(ours), 1e-8)
  if (max(rel) > 1e-4) stop("classical form's optimum differs: ", paste(signif(back, 8), collapse = ", "))
  s <- sign(expected$residual)
  rt <- runs.test(s[s != 0], threshold = 0)
  stopifnot(
    rt$runs == expected$runs$n_runs,
    abs(rt$p.value - expected$runs$p) < 1e-10 * max(1, rt$p.value)
  )
  TRUE
}

fixture("clean",
  input = list(
    t = c(0, 0, 0, 2, 2, 2, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 16, 16, 16, 18, 18, 18, 20, 20, 20, 22, 22, 22, 24, 24, 24),
    y = c(-0.0065, 0.011, -0.0135, 0.0043, 0.0062, 0.0235, 0.0784, 0.0637, 0.0843, 0.8313, 0.8463, 0.8199, 1.0168, 0.9589, 0.9835, 0.9954, 0.9822, 1.0004, 0.9836, 0.9589, 0.9967, 1.0142, 0.9946, 0.9707, 1.0149, 0.9718, 1.0093, 0.9976, 1.0093, 1.01, 1.0179, 1.0056, 1.0202, 0.9585, 1.0238, 0.9855, 1.0034, 1.0184, 0.9666)
  ),
  expr = run_gc(t, y), setup = reference,
  check = classical_agrees(t, y, expected), check_packages = "randtests",
  note = "A clean curve in triplicate with a clear lag, exponential rise and plateau: the sanity case for every reported number and phase.")

fixture("short-lag",
  input = list(
    t = c(0, 0.75, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6, 6.75, 7.5, 8.25, 9, 9.75, 10.5, 11.25, 12, 12.75, 13.5, 14.25, 15),
    y = c(0.0147, 0.3762, 0.854, 1.1481, 1.2006, 1.2177, 1.2163, 1.2047, 1.2109, 1.238, 1.2289, 1.2023, 1.1875, 1.1746, 1.1954, 1.1948, 1.1685, 1.2351, 1.1664, 1.2106, 1.2151)
  ),
  expr = run_gc(t, y), setup = reference,
  check = classical_agrees(t, y, expected), check_packages = "randtests",
  note = "Growth starts almost immediately (lag near the first time point): lambda comes out small but the fit and its CI stay well behaved.")

fixture("no-plateau",
  input = list(
    t = c(0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6),
    y = c(-0.0157, 0.0011, -0.0234, -0.0023, -0.0279, 0.0415, 0.1485, 0.3126, 0.4825, 0.7425, 0.9762, 1.2172, 1.4063)
  ),
  expr = run_gc(t, y), setup = reference,
  check = classical_agrees(t, y, expected), check_packages = "randtests",
  note = "The observed window (to t = 6) ends well before the fitted curve reaches stationary phase (tau about 7): the app still reports it, stated as extrapolated beyond the data.")

fixture("outlier",
  input = list(
    t = c(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20),
    y = c(-0.0104, 0.0188, 0.0193, -0.0094, 0.0317, 0.0099, 0.0642, 0.8434, 0.7518, 0.8848, 0.9934, 0.9803, 1.0128, 0.9935, 0.9948, 0.9924, 1.0357, 0.9507, 0.9639, 0.9839, 0.9835)
  ),
  expr = run_gc(t, y), setup = reference,
  check = classical_agrees(t, y, expected), check_packages = "randtests",
  note = "One point (t = 7) raised well above the curve: a large residual, and the runs test on what's left.")

fixture("few",
  input = list(t = c(0, 1, 2), y = c(0.1, 0.5, 0.9)),
  expr = list(n = 3, ran = FALSE, why = "few", minimum = 4),
  note = "Three points for three parameters: nothing left to estimate scatter from.")

fixture("few-t",
  input = list(t = c(1, 1, 2, 2), y = c(0.1, 0.12, 0.5, 0.53)),
  expr = list(n = 4, ran = FALSE, why = "few_t", minimum = 3),
  note = "Four points at only two distinct times: three parameters can't be told apart through two time points however many replicates.")

fixture("constant-y",
  input = list(t = c(0, 1, 2, 3, 4, 5), y = c(0.4, 0.4, 0.4, 0.4, 0.4, 0.4)),
  expr = list(n = 6, ran = FALSE, why = "constant_y"),
  note = "Y never varies: no curve to fit.")

fixture("declining",
  input = list(
    t = c(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    y = c(1.9741, 1.8907, 1.8027, 1.7259, 1.6024, 1.5081, 1.4048, 1.2838, 1.2073, 1.0933, 0.9775)
  ),
  expr = list(n = 11, ran = FALSE, why = "no_fit"),
  setup = reference,
  check = {
    # A monotonically decreasing series: not a growth curve. The
    # least-squares optimum degenerates into an already-at-the-asymptote
    # step just before the window starts (mumax huge, lambda far
    # negative) rather than failing to converge outright -- the same
    # width check as analysis.R's own no-fit guard, confirmed here to
    # trigger on the reference's independently-found optimum too.
    p <- tryCatch(ref_optimum(t, y), error = function(e) NA)
    any(!is.finite(p)) || p[1] <= 0 || p[2] <= 0 || p[1] / p[2] < (max(t) - min(t)) * 1e-3
  },
  note = "Y only decreases: not a growth curve, and the app reports that it could not fit rather than a number.")
