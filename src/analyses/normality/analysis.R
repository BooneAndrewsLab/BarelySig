# Normality tests of each group (item 06, #28): D'Agostino-Pearson omnibus
# K2 (n >= 8, as Prism) and Shapiro-Wilk (3 <= n <= 5000; R's shapiro.test
# is Royston's AS R94, which Prism uses too). A test that can't run says
# why in `why`, which the app words for the user.

# D'Agostino, Belanger & D'Agostino (1990): skewness and kurtosis each
# turned into a normal deviate, K2 their sum of squares on 2 df.
bs_dagostino <- function(x) {
  n <- length(x)
  d <- x - mean(x)
  m2 <- mean(d^2)
  b1 <- mean(d^3) / m2^1.5
  b2 <- mean(d^4) / m2^2
  y <- b1 * sqrt((n + 1) * (n + 3) / (6 * (n - 2)))
  beta2 <- 3 * (n^2 + 27 * n - 70) * (n + 1) * (n + 3) / ((n - 2) * (n + 5) * (n + 7) * (n + 9))
  w2 <- -1 + sqrt(2 * (beta2 - 1))
  delta <- 1 / sqrt(log(sqrt(w2)))
  a <- sqrt(2 / (w2 - 1))
  z_skew <- delta * log(y / a + sqrt((y / a)^2 + 1))
  e <- 3 * (n - 1) / (n + 1)
  v <- 24 * n * (n - 2) * (n - 3) / ((n + 1)^2 * (n + 3) * (n + 5))
  xk <- (b2 - e) / sqrt(v)
  root_beta1 <- 6 * (n^2 - 5 * n + 2) / ((n + 7) * (n + 9)) * sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)))
  aa <- 6 + 8 / root_beta1 * (2 / root_beta1 + sqrt(1 + 4 / root_beta1^2))
  t <- (1 - 2 / aa) / (1 + xk * sqrt(2 / (aa - 4)))
  z_kurt <- ((1 - 2 / (9 * aa)) - sign(t) * abs(t)^(1 / 3)) / sqrt(2 / (9 * aa))
  k2 <- z_skew^2 + z_kurt^2
  list(k2 = k2, p = pchisq(k2, 2, lower.tail = FALSE), z_skewness = z_skew, z_kurtosis = z_kurt)
}

bs_normality_one <- function(x) {
  n <- length(x)
  same <- n > 0 && max(x) == min(x)
  sw <- if (n < 3) {
    list(why = "few", minimum = 3)
  } else if (n > 5000) {
    list(why = "many", maximum = 5000)
  } else if (same) {
    list(why = "same")
  } else {
    s <- shapiro.test(x)
    list(w = unname(s$statistic), p = s$p.value)
  }
  dp <- if (n < 8) list(why = "few", minimum = 8) else if (same) list(why = "same") else bs_dagostino(x)
  list(n = n, shapiro_wilk = sw, dagostino = dp)
}

# y: the values; g: each value's group (1..k).
bs_normality <- function(y, g, k) {
  list(groups = lapply(seq_len(k), function(i) bs_normality_one(y[g == i])))
}
