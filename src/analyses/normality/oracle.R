# Fixtures for the normality tests (#28, item 06). Shapiro-Wilk is R's own
# shapiro.test; D'Agostino-Pearson K2 is written out from D'Agostino,
# Belanger & D'Agostino (1990) with the kurtosis deviate by Anscombe and
# Glynn (1983), in a different arrangement from the app's, and checked
# against fBasics::dagoTest (a reference-only package) where n >= 20.

reference <- quote({
  moments <- function(x) {
    d <- x - mean(x)
    c(m2 = sum(d^2) / length(x), m3 = sum(d^3) / length(x), m4 = sum(d^4) / length(x))
  }
  skew_z <- function(x) {
    n <- length(x); m <- moments(x)
    sqrt_b1 <- m[["m3"]] / m[["m2"]]^(3 / 2)
    y <- sqrt_b1 * sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)))
    beta2 <- (3 * (n^2 + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9))
    w <- sqrt(-1 + sqrt(2 * (beta2 - 1)))
    delta <- 1 / sqrt(log(w))
    alpha <- sqrt(2 / (w^2 - 1))
    delta * asinh(y / alpha)
  }
  kurt_z <- function(x) {
    n <- length(x); m <- moments(x)
    b2 <- m[["m4"]] / m[["m2"]]^2
    mean_b2 <- 3 * (n - 1) / (n + 1)
    var_b2 <- 24 * n * (n - 2) * (n - 3) / ((n + 1)^2 * (n + 3) * (n + 5))
    std <- (b2 - mean_b2) / sqrt(var_b2)
    sqrt_beta1 <- (6 * (n^2 - 5 * n + 2) / ((n + 7) * (n + 9))) * sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)))
    A <- 6 + (8 / sqrt_beta1) * ((2 / sqrt_beta1) + sqrt(1 + 4 / sqrt_beta1^2))
    inner <- (1 - 2 / A) / (1 + std * sqrt(2 / (A - 4)))
    ((1 - 2 / (9 * A)) - sign(inner) * abs(inner)^(1 / 3)) / sqrt(2 / (9 * A))
  }
  one <- function(x) {
    x <- x[!is.na(x)]
    n <- length(x)
    same <- n > 0 && diff(range(x)) == 0
    sw <- if (n < 3) list(why = "few", minimum = 3) else if (same) list(why = "same") else {
      s <- shapiro.test(x); list(w = unname(s$statistic), p = s$p.value)
    }
    dp <- if (n < 8) list(why = "few", minimum = 8) else if (same) list(why = "same") else {
      z1 <- skew_z(x); z2 <- kurt_z(x)
      list(k2 = z1^2 + z2^2, p = pchisq(z1^2 + z2^2, 2, lower.tail = FALSE), z_skewness = z1, z_kurtosis = z2)
    }
    list(n = n, shapiro_wilk = sw, dagostino = dp)
  }
  normality <- function(...) list(groups = lapply(list(...), one))
})

dago_check <- quote({
  ok <- TRUE
  for (i in seq_along(expected$groups)) {
    x <- get(paste0("g", i)); x <- x[!is.na(x)]
    e <- expected$groups[[i]]$dagostino
    # fBasics refuses fewer than 20 values (the kurtosis approximation's
    # usual advice); Prism runs the test from 8, with the same formulas.
    if (!is.null(e$k2) && length(x) >= 20) {
      t <- fBasics::dagoTest(x)@test
      ok <- ok && isTRUE(all.equal(unname(t$statistic[1]), e$k2, tolerance = 1e-9)) &&
        isTRUE(all.equal(unname(t$p.value[1]), e$p, tolerance = 1e-9))
    }
  }
  ok
})

fixture("gaussian",
  input = list(g1 = round(qnorm(ppoints(12), 10, 2), 3) + c(0.2, rep(0, 11)), g2 = round(qnorm(ppoints(20), 5, 1), 3) + c(rep(0, 19), 0.1)),
  expr = normality(g1, g2), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "Normal quantiles, one nudged (a perfectly symmetric sample has skewness 0, which is only rounding noise): both tests pass.")

fixture("skewed",
  input = list(g1 = round(qexp(ppoints(15)), 3), g2 = round(qlnorm(ppoints(30), 0, 1), 3)),
  expr = normality(g1, g2), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "Exponential and lognormal: clearly not Gaussian.")

fixture("small-n",
  input = list(g1 = c(4.1, 5.3), g2 = c(4.1, 5.3, 4.8), g3 = c(2.2, 3.1, 2.9, 3.5, 2.8, 3.0, 3.3)),
  expr = normality(g1, g2, g3), setup = reference,
  note = "Two values: no test; three to seven: Shapiro-Wilk only (D'Agostino needs 8).")

fixture("n-8",
  input = list(g1 = c(3.1, 2.8, 3.5, 3.0, 3.3, 2.9, 3.6, 3.2)),
  expr = normality(g1), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "Eight values: the smallest n for the D'Agostino-Pearson test.")

fixture("ties-missing",
  input = list(g1 = c(1, 2, 2, 3, 3, 3, 4, 4, NA, 5, 2, 3)),
  expr = normality(g1), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "Ties and an empty cell, which drops out.")

fixture("outlier-tiny-p",
  input = list(g1 = c(round(qnorm(ppoints(40), 10, 0.5), 3), 60)),
  expr = normality(g1), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "One extreme value in 41: both P values are tiny and keep their magnitude.")

fixture("all-same",
  input = list(g1 = c(5, 5, 5, 5, 5, 5, 5, 5, 5)),
  expr = normality(g1), setup = reference,
  note = "Every value the same: neither test is defined.")
