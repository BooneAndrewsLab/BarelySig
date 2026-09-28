# Fixtures for simple linear regression on an XY table's Y data sets
# (item 29, #38). `lm()` is base R, the trusted reference (same
# relationship this project's other oracles have with `chisq.test`/
# `shapiro.test`); the runs test is a hand-rolled asymptotic formula in
# `analysis.R` (no base-R function computes it), so its reference here is
# a genuinely independent implementation, CRAN's `randtests::runs.test`,
# installed into this environment for reference only (never shipped to
# WebR, the same status `multcomp`/`car`/`dunn.test`/etc. already have).

# Independent check of predict.lm's confidence/prediction band formula
# (CLAUDE.md's oracle lesson: a reference is verified against something
# else before a fixture trusts it), for #87's band: hand-computed t * SE
# at a few grid points against the textbook formula for the standard
# error of a fitted value / a new observation, on synthetic data, once,
# when this oracle loads -- independent of predict.lm() itself, which
# `run_linreg` below then uses to build every fixture's band.
local({
  set.seed(1)
  x <- 1:10
  y <- 2 * x + rnorm(10, sd = 1.5)
  m <- lm(y ~ x)
  grid <- c(min(x), mean(x), max(x))
  s <- summary(m)
  sigma <- s$sigma
  df <- m$df.residual
  xbar <- mean(x)
  sxx <- sum((x - xbar)^2)
  se_fit <- sigma * sqrt(1 / length(x) + (grid - xbar)^2 / sxx)
  fit <- unname(predict(m, newdata = data.frame(x = grid)))
  t_crit <- qt(0.975, df)
  hand_ci_lower <- fit - t_crit * se_fit
  hand_ci_upper <- fit + t_crit * se_fit
  se_pred <- sigma * sqrt(1 + 1 / length(x) + (grid - xbar)^2 / sxx)
  hand_pi_lower <- fit - t_crit * se_pred
  hand_pi_upper <- fit + t_crit * se_pred
  pr_ci <- predict(m, newdata = data.frame(x = grid), interval = "confidence")
  pr_pi <- predict(m, newdata = data.frame(x = grid), interval = "prediction")
  stopifnot(
    max(abs(hand_ci_lower - pr_ci[, "lwr"])) < 1e-9,
    max(abs(hand_ci_upper - pr_ci[, "upr"])) < 1e-9,
    max(abs(hand_pi_lower - pr_pi[, "lwr"])) < 1e-9,
    max(abs(hand_pi_upper - pr_pi[, "upr"])) < 1e-9
  )
})

reference <- quote({
  run_predict_band <- function(m, x) {
    grid <- seq(min(x), max(x), length.out = 100)
    ci <- predict(m, newdata = data.frame(x = grid), interval = "confidence", se.fit = TRUE)
    pi <- predict(m, newdata = data.frame(x = grid), interval = "prediction", se.fit = TRUE)
    list(
      x = grid,
      fit = unname(ci$fit[, "fit"]),
      confidence_lower = unname(ci$fit[, "lwr"]),
      confidence_upper = unname(ci$fit[, "upr"]),
      prediction_lower = unname(pi$fit[, "lwr"]),
      prediction_upper = unname(pi$fit[, "upr"])
    )
  }
  run_linreg <- function(x, y) {
    m <- lm(y ~ x)
    s <- summary(m)
    ci <- confint(m)
    f <- s$fstatistic
    ord <- order(x)
    resid_ord <- unname(resid(m))[ord]
    signs <- sign(resid_ord)
    signs <- signs[signs != 0]
    rt <- runs.test(signs, threshold = 0)
    list(
      n = length(x), ran = TRUE,
      intercept = unname(coef(m)[1]), slope = unname(coef(m)[2]),
      intercept_lower = unname(ci[1, 1]), intercept_upper = unname(ci[1, 2]),
      slope_lower = unname(ci[2, 1]), slope_upper = unname(ci[2, 2]),
      r2 = s$r.squared,
      f = unname(f[1]), df_num = unname(f[2]), df_den = unname(f[3]),
      p = unname(s$coefficients[2, 4]),
      x = x[ord], y = y[ord], fitted = unname(fitted(m))[ord], residual = resid_ord,
      runs = list(
        ran = TRUE,
        n_runs = rt$runs,
        n_pos = sum(signs > 0), n_neg = sum(signs < 0),
        z = unname(rt$statistic), p = rt$p.value
      ),
      band = run_predict_band(m, x)
    )
  }
})

fixture("clean-linear",
  input = list(
    x = 1:12,
    y = c(8.242, 6.871, 11.226, 14.266, 16.309, 17.788, 23.523, 22.811, 29.537, 27.875, 33.11, 37.573)
  ),
  expr = run_linreg(x, y), setup = reference, packages = "randtests",
  note = "A clean linear relationship: unambiguous slope, sanity check for every reported number.")

fixture("n2",
  input = list(x = c(1, 2), y = c(2, 4)),
  expr = list(n = 2, ran = FALSE, why = "few", minimum = 3),
  note = "Two points: R's own lm() gives NaN/Inf standard errors and an NA P here (confirmed directly against R), so the app reports why it can't run rather than showing them.")

fixture("constant-x",
  input = list(x = c(5, 5, 5, 5, 5), y = c(1, 4, 2, 8, 3)),
  expr = list(n = 5, ran = FALSE, why = "constant_x"),
  note = "Every X the same value: no line to fit (an undefined, vertical 'slope').")

fixture("constant-y",
  input = list(x = 1:6, y = c(3, 3, 3, 3, 3, 3)),
  expr = list(n = 6, ran = FALSE, why = "constant_y"),
  note = "Y never varies: summary.lm()'s R^2/F/P on an exactly flat Y is floating-point noise on a 0/0 ratio (confirmed directly against R: R^2 came back 0.4667, not 0), so this is reported in words instead.")

fixture("no-linear-association",
  input = list(x = -3:3, y = c(9, 4, 1, 0, 1, 4, 9)),
  expr = run_linreg(x, y), setup = reference, packages = "randtests",
  note = "A perfect parabola: Y varies, but the true linear R^2 is exactly 0 (not rounding noise) and the true slope exactly 0 -- CLAUDE.md's 'a statistic whose true value is 0' lesson, applied here instead of to skewness.")

fixture("outlier",
  input = list(
    x = 1:15,
    y = c(57.949, 42.813, 43.623, 43.551, 40.117, 39.011, 44.593, 39.932, 39.811, 46.76, 38.228, 46.467, 83.526, 34.496, 39.584)
  ),
  expr = run_linreg(x, y), setup = reference, packages = "randtests",
  note = "One point (x=13) is a large outlier: exercises the runs test's ability to find alternating residual signs among the rest despite one residual that breaks up what would otherwise be one long run.")

fixture("very-small-p",
  input = list(
    x = c(58.47, 11.38, 68.43, 99.25, 53.5, 96.66, 67.14, 29.46, 35.84, 17.53, 54.88, 50.55, 19.38, 63.69, 68.78, 64.02, 35.79, 10.26, 9.78, 18.29, 22.79, 8.05, 82.16, 59.11, 77.34, 35.01, 0.61, 81.45, 0.12, 20.07, 50.01, 32.35, 34.68, 54.55, 4.05, 44.38, 69.1, 82.39, 60.68, 97.74, 86.41, 48.23, 77.41, 93.04, 47.63, 91.69, 36.52, 42.68, 58.81, 11.03, 70.95, 81.92, 75.29, 97.91, 29.26, 85.47, 8.57, 54.93, 91.93, 38.84),
    y = c(53.996, 10.692, 61.441, 89.453, 45.855, 85.627, 60.229, 26.582, 32.347, 16.1, 49.525, 43.816, 17.164, 55.769, 60.522, 56.261, 31.29, 8.367, 10.459, 16.306, 18.934, 7.869, 74.274, 52.801, 68.525, 31.432, 0.023, 73.696, -0.572, 17.314, 44.846, 29.001, 30.767, 49.352, 2.545, 38.605, 62.395, 74.186, 54.173, 88.366, 78.354, 43.889, 68.864, 84.039, 42.041, 82.662, 33.608, 39.797, 52.295, 10.166, 63.892, 74.017, 66.655, 89.011, 27.515, 77.274, 7.776, 50.831, 82.724, 35.634)
  ),
  expr = run_linreg(x, y), setup = reference, packages = "randtests",
  note = "n = 60, near-perfect linear relationship: P around 1e-88, so its magnitude must survive parsing rather than underflow.")
