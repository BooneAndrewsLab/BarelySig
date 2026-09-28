# Fixtures for Pearson/Spearman correlation on an XY table's Y data sets
# (item 29, #38). `cor.test()` is base R, the trusted reference (same
# relationship this project's other oracles have with `chisq.test`/
# `shapiro.test`).

reference <- quote({
  run_pearson <- function(x, y) {
    t <- cor.test(x, y, method = "pearson")
    ci <- t$conf.int
    list(
      n = length(x), ran = TRUE,
      r = unname(t$estimate), lower = unname(ci[1]), upper = unname(ci[2]),
      statistic = unname(t$statistic), df = unname(t$parameter), p = t$p.value
    )
  }
  run_spearman <- function(x, y) {
    ties <- anyDuplicated(x) > 0 || anyDuplicated(y) > 0
    exact <- !ties && length(x) < 1290
    t <- suppressWarnings(cor.test(x, y, method = "spearman", exact = exact))
    list(
      n = length(x), ran = TRUE,
      r = unname(t$estimate), lower = NA_real_, upper = NA_real_,
      statistic = unname(t$statistic), df = NA_real_, p = t$p.value,
      exact = exact, ties = ties
    )
  }
})

fixture("pearson-clean",
  input = list(
    x = 1:12,
    y = c(8.242, 6.871, 11.226, 14.266, 16.309, 17.788, 23.523, 22.811, 29.537, 27.875, 33.11, 37.573)
  ),
  expr = run_pearson(x, y), setup = reference,
  note = "A clean linear relationship: unambiguous r and CI, sanity check for Pearson.")

fixture("pearson-n2",
  input = list(x = c(1, 2), y = c(2, 4)),
  expr = list(n = 2, ran = FALSE, why = "few", minimum = 3),
  note = "Two points: R's own cor.test(method = \"pearson\") errors outright ('not enough finite observations', confirmed directly against R), so the app reports why rather than crashing.")

fixture("constant-y",
  input = list(x = 1:5, y = c(3, 3, 3, 3, 3)),
  expr = list(n = 5, ran = FALSE, why = "constant"),
  note = "Y never varies: cor.test() itself returns NA for r and P here (with a warning) rather than erroring, so the app checks for zero variance first and reports it in words.")

fixture("spearman-ties",
  input = list(
    x = c(1, 2, 2, 3, 4, 4, 4, 5, 6, 7),
    y = c(2, 3, 5, 5, 6, 6, 9, 8, 9, 12)
  ),
  expr = run_spearman(x, y), setup = reference,
  note = "Repeated values in both X and Y: R's own exact Spearman P is unavailable with ties, so cor.test() falls back to its asymptotic approximation -- confirmed here rather than assumed (exact Spearman with ties is #48's own separate, deferred scope).")

fixture("spearman-no-ties",
  input = list(
    x = c(2.1, 5.4, 1.2, 8.9, 3.3, 7.7, 6.6, 4.4, 9.9, 0.5),
    y = c(3.0, 6.1, 0.9, 9.5, 2.8, 8.0, 7.2, 5.1, 9.0, 1.1)
  ),
  expr = run_spearman(x, y), setup = reference,
  note = "No ties in either column: R's exact Spearman P is available and used (exact = TRUE), the ordinary case.")

fixture("outlier",
  input = list(
    x = 1:15,
    y = c(57.949, 42.813, 43.623, 43.551, 40.117, 39.011, 44.593, 39.932, 39.811, 46.76, 38.228, 46.467, 83.526, 34.496, 39.584)
  ),
  expr = run_pearson(x, y), setup = reference,
  note = "One point (x=13) is a large outlier: Pearson r is sensitive to it in a way Spearman would not be -- the results text says so.")

fixture("very-small-p",
  input = list(
    x = c(58.47, 11.38, 68.43, 99.25, 53.5, 96.66, 67.14, 29.46, 35.84, 17.53, 54.88, 50.55, 19.38, 63.69, 68.78, 64.02, 35.79, 10.26, 9.78, 18.29, 22.79, 8.05, 82.16, 59.11, 77.34, 35.01, 0.61, 81.45, 0.12, 20.07, 50.01, 32.35, 34.68, 54.55, 4.05, 44.38, 69.1, 82.39, 60.68, 97.74, 86.41, 48.23, 77.41, 93.04, 47.63, 91.69, 36.52, 42.68, 58.81, 11.03, 70.95, 81.92, 75.29, 97.91, 29.26, 85.47, 8.57, 54.93, 91.93, 38.84),
    y = c(53.996, 10.692, 61.441, 89.453, 45.855, 85.627, 60.229, 26.582, 32.347, 16.1, 49.525, 43.816, 17.164, 55.769, 60.522, 56.261, 31.29, 8.367, 10.459, 16.306, 18.934, 7.869, 74.274, 52.801, 68.525, 31.432, 0.023, 73.696, -0.572, 17.314, 44.846, 29.001, 30.767, 49.352, 2.545, 38.605, 62.395, 74.186, 54.173, 88.366, 78.354, 43.889, 68.864, 84.039, 42.041, 82.662, 33.608, 39.797, 52.295, 10.166, 63.892, 74.017, 66.655, 89.011, 27.515, 77.274, 7.776, 50.831, 82.724, 35.634)
  ),
  expr = run_pearson(x, y), setup = reference,
  note = "n = 60, near-perfect linear relationship: P around 1e-88, so its magnitude must survive parsing rather than underflow.")
