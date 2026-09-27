# Fixtures for the normality check of a Nested table's replicate means
# (item 26, #77). Each fixture's input columns are a group's own
# replicate means (one number per biological replicate with a usable
# value), exactly the vector `nestedReplicateMeans` (note 26) hands the
# app's analysis -- the oracle never sees the underlying individual
# values, since it's the means, not the raw data, that this analysis
# tests. Same formulas as `normality/oracle.R` (D'Agostino, Belanger &
# D'Agostino 1990's skewness/kurtosis deviates; R's own `shapiro.test`),
# written out independently of the app's `analysis.R`, and checked
# against fBasics::dagoTest where it has enough points to run (20+).

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
  nested_normality <- function(...) list(groups = lapply(list(...), one))
})

dago_check <- quote({
  ok <- TRUE
  for (i in seq_along(expected$groups)) {
    x <- get(paste0("g", i)); x <- x[!is.na(x)]
    e <- expected$groups[[i]]$dagostino
    # fBasics refuses fewer than 20 values (the kurtosis approximation's
    # usual advice), so this only checks the one fixture with that many
    # replicate means.
    if (!is.null(e$k2) && length(x) >= 20) {
      t <- fBasics::dagoTest(x)@test
      ok <- ok && isTRUE(all.equal(unname(t$statistic[1]), e$k2, tolerance = 1e-9)) &&
        isTRUE(all.equal(unname(t$p.value[1]), e$p, tolerance = 1e-9))
    }
  }
  ok
})

fixture("typical-three",
  input = list(
    g1 = c(10.1, 11.4, 9.8),
    g2 = c(20.6, 19.2, 21.9)
  ),
  expr = nested_normality(g1, g2), setup = reference,
  note = paste(
    "The ordinary bench case: three biological replicates per group.",
    "Shapiro-Wilk can run (its floor is 3) but three points can essentially",
    "never fail it, whatever the true shape -- the case the low-power",
    "caveat exists for."
  ))

fixture("minimum-two",
  input = list(
    g1 = c(8.2, 9.6),
    g2 = c(14.1, 15.8, 13.2, 14.9, 15.3)
  ),
  expr = nested_normality(g1, g2), setup = reference,
  note = "Two replicates in one group, Shapiro-Wilk's minimum n: that group can't be tested at all (why: few); the other, with five, can.")

fixture("unequal-replicate-counts",
  input = list(
    g1 = c(5.1, 5.4, 4.9),
    g2 = c(12.0, 11.4, 12.6, 11.9, 12.2, 11.7)
  ),
  expr = nested_normality(g1, g2), setup = reference,
  note = "Three replicates against six: an unequal-n case, the convention this project's fixtures always include.")

fixture("clearly-non-normal-many-replicates",
  input = list(g1 = round(qexp(ppoints(25)), 3)),
  expr = nested_normality(g1), setup = reference, check = dago_check, check_packages = "fBasics",
  note = paste(
    "Twenty-five replicate means drawn from a clearly skewed (exponential)",
    "distribution: with this many replicates both tests do reject, proof",
    "the feature isn't structurally powerless -- it's specifically the",
    "typical few-replicate case that has no power."
  ))
