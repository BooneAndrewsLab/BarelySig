# Fixtures for the paired-differences normality tests (#53, item 18). Same
# reference as `normality`'s oracle (Shapiro-Wilk is R's own shapiro.test;
# D'Agostino-Pearson K2 is written out from D'Agostino, Belanger &
# D'Agostino (1990) with the kurtosis deviate by Anscombe and Glynn (1983),
# in a different arrangement from the app's), run once on b - a rather
# than on each group, and checked against fBasics::dagoTest where n >= 20.

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
  paired_normality <- function(a, b) {
    # A row missing on either side drops out of the pairing (never just
    # one side), as the app's own `pairedGroups` selector does.
    keep <- !is.na(a) & !is.na(b)
    d <- b[keep] - a[keep]
    n <- length(d)
    same <- n > 0 && diff(range(d)) == 0
    sw <- if (n < 3) list(why = "few", minimum = 3) else if (same) list(why = "same") else {
      s <- shapiro.test(d); list(w = unname(s$statistic), p = s$p.value)
    }
    dp <- if (n < 8) list(why = "few", minimum = 8) else if (same) list(why = "same") else {
      z1 <- skew_z(d); z2 <- kurt_z(d)
      list(k2 = z1^2 + z2^2, p = pchisq(z1^2 + z2^2, 2, lower.tail = FALSE), z_skewness = z1, z_kurtosis = z2)
    }
    list(n = n, shapiro_wilk = sw, dagostino = dp)
  }
})

dago_check <- quote({
  keep <- !is.na(a) & !is.na(b)
  d <- b[keep] - a[keep]
  ok <- TRUE
  e <- expected$dagostino
  # fBasics refuses fewer than 20 values; Prism runs the test from 8, with
  # the same formulas.
  if (!is.null(e$k2) && length(d) >= 20) {
    t <- fBasics::dagoTest(d)@test
    ok <- isTRUE(all.equal(unname(t$statistic[1]), e$k2, tolerance = 1e-9)) &&
      isTRUE(all.equal(unname(t$p.value[1]), e$p, tolerance = 1e-9))
  }
  ok
})

fixture("gaussian",
  input = list(a = round(qnorm(ppoints(20), 5, 1), 3), b = round(qnorm(ppoints(20), 5, 1), 3) + c(rep(0.4, 19), 0.6)),
  expr = paired_normality(a, b), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "Twenty pairs whose differences are close to Gaussian (a nudge off perfect symmetry, whose true skewness is 0 and only rounding noise): both tests pass.")

fixture("skewed",
  input = list(a = round(qnorm(ppoints(15), 10, 2), 3), b = round(qnorm(ppoints(15), 10, 2) + qexp(ppoints(15)), 3)),
  expr = paired_normality(a, b), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "Differences drawn from an exponential: clearly not Gaussian.")

fixture("small-n",
  input = list(a = c(4.1, 5.3), b = c(4.6, 5.0)),
  expr = paired_normality(a, b), setup = reference,
  note = "Two pairs: too few for either test (Shapiro-Wilk needs 3).")

fixture("n-8",
  input = list(a = c(3.1, 2.8, 3.5, 3.0, 3.3, 2.9, 3.6, 3.2), b = c(3.4, 2.6, 3.9, 2.7, 3.8, 2.5, 4.0, 2.9)),
  expr = paired_normality(a, b), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "Eight pairs: the smallest n for the D'Agostino-Pearson test.")

fixture("ties-missing",
  input = list(a = c(1, 2, 2, 3, 3, 3, 4, 4, NA, 5, 2, 3), b = c(2, 3, 4, 5, 5, 4, 6, 5, 9, 8, 3, 4)),
  expr = paired_normality(a, b), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "One row missing on the A side drops the pair entirely; the differences left have ties.")

fixture("outlier-tiny-p",
  input = list(a = round(qnorm(ppoints(41), 10, 0.5), 3), b = round(qnorm(ppoints(41), 10, 0.5), 3) + c(rep(0.3, 40), 25)),
  expr = paired_normality(a, b), setup = reference, check = dago_check, check_packages = "fBasics",
  note = "One pair with an extreme difference among 41: both P values are tiny and keep their magnitude.")

fixture("all-same",
  input = list(a = c(5, 5, 5, 5, 5, 5, 5, 5, 5), b = c(6, 6, 6, 6, 6, 6, 6, 6, 6)),
  expr = paired_normality(a, b), setup = reference,
  note = "Every difference exactly 1: neither test is defined.")
