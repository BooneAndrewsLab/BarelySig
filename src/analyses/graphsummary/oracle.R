# Fixtures for a graph's box and violin statistics (#31, note 07). The
# reference is independent of the app's analysis.R: percentiles by
# Prism's rule written out (GraphPad FAQ 501, Hyndman & Fan definition 6),
# Tukey's whiskers by walking the sorted values, Silverman's bandwidth
# from its formula, and the KDE as an explicit sum of normal densities.
# Each case is checked against R's own quantile(type = 6), bw.nrd0 and a
# density() evaluated at the same points.

reference <- quote({
  prism_percentile <- function(x, p) {
    x <- sort(x)
    n <- length(x)
    h <- (n + 1) * p
    if (h <= 1) return(x[1])
    if (h >= n) return(x[n])
    lo <- floor(h)
    x[lo] + (h - lo) * (x[lo + 1] - x[lo])
  }
  whisker_ref <- function(x, whiskers) {
    s <- sort(x)
    q1 <- prism_percentile(s, 0.25)
    q3 <- prism_percentile(s, 0.75)
    if (whiskers == "tukey") {
      lo_fence <- q1 - 1.5 * (q3 - q1)
      hi_fence <- q3 + 1.5 * (q3 - q1)
      low <- NA
      for (v in s) if (v >= lo_fence) { low <- v; break }
      high <- NA
      for (v in rev(s)) if (v <= hi_fence) { high <- v; break }
    } else if (whiskers == "min-max") {
      low <- s[1]
      high <- s[length(s)]
    } else {
      p <- switch(whiskers, "p10-90" = 0.1, "p5-95" = 0.05, "p2.5-97.5" = 0.025, "p1-99" = 0.01)
      low <- prism_percentile(s, p)
      high <- prism_percentile(s, 1 - p)
    }
    beyond <- c()
    for (v in s) if (v < low || v > high) beyond <- c(beyond, v)
    list(low = low, high = high, beyond = I(if (is.null(beyond)) numeric(0) else beyond))
  }
  # Silverman (1986), eq. 3.31, as R documents bw.nrd0: 0.9 min(SD, IQR / 1.34) n^(-1/5),
  # falling back to the SD, then |x1|, then 1 when the spread is zero.
  silverman <- function(x) {
    n <- length(x)
    iqr <- diff(quantile(x, c(0.25, 0.75), names = FALSE, type = 7))
    lo <- min(sd(x), iqr / 1.34)
    if (!(lo > 0)) lo <- sd(x)
    if (!(lo > 0)) lo <- abs(x[1])
    if (!(lo > 0)) lo <- 1
    0.9 * lo * n^(-0.2)
  }
  kde_ref <- function(x, adjust = 1, log = FALSE) {
    if (log) x <- log10(x[x > 0])
    n <- length(x)
    h <- silverman(x) * adjust
    y <- min(x) + (max(x) - min(x)) * (0:63) / 63
    d <- numeric(64)
    for (i in 1:64) {
      s <- 0
      for (xi in x) s <- s + exp(-((y[i] - xi) / h)^2 / 2) / sqrt(2 * pi)
      d[i] <- s / (n * h)
    }
    list(bw = h, y = I(if (log) 10^y else y), density = I(d))
  }
  cell <- function(x, whiskers = NA, adjust = NA, log = FALSE) {
    out <- list(q1 = prism_percentile(x, 0.25), median = prism_percentile(x, 0.5),
                q3 = prism_percentile(x, 0.75))
    if (!is.na(whiskers)) out$whiskers <- whisker_ref(x, whiskers)
    if (!is.na(adjust)) out$kde <- kde_ref(x, adjust, log)
    out
  }
})

# R's own functions agree with the written-out reference.
agrees <- function(x, expected, adjust = 1, log = FALSE) {
  ok <- all.equal(unname(quantile(x, c(0.25, 0.5, 0.75), type = 6)),
                  c(expected$q1, expected$median, expected$q3), tolerance = 1e-12)
  if (!is.null(expected$kde)) {
    xs <- if (log) log10(x[x > 0]) else x
    h <- bw.nrd0(xs) * adjust
    ok <- isTRUE(ok) && isTRUE(all.equal(h, expected$kde$bw, tolerance = 1e-12))
    # density() bins onto an FFT grid, so it agrees only roughly; exactness is the loop's.
    ys <- if (log) log10(expected$kde$y) else expected$kde$y
    approx_d <- approx(density(xs, bw = h, n = 2^16, from = min(ys) - 3 * h, to = max(ys) + 3 * h), xout = ys)$y
    ok <- ok && max(abs(approx_d - expected$kde$density)) < 1e-3 * max(expected$kde$density)
  }
  isTRUE(ok)
}

x_basic <- c(12.1, 14.3, 15.0, 15.8, 16.2, 17.9, 18.4, 19.0, 21.7, 24.5)
x_outliers <- c(3.1, 9.6, 10.2, 10.4, 10.9, 11.3, 11.8, 12.0, 12.4, 19.7, 22.5)

fixture("tukey", input = list(x = x_outliers), expr = cell(x, "tukey"), setup = reference,
  check = agrees(x, expected), options = list(whiskers = "tukey"),
  note = "One value below the lower fence and two above the upper: whiskers stop at the last values inside.")

fixture("tukey-none-beyond", input = list(x = x_basic), expr = cell(x, "tukey"), setup = reference,
  check = agrees(x, expected), options = list(whiskers = "tukey"))

fixture("min-max", input = list(x = x_outliers), expr = cell(x, "min-max"), setup = reference,
  check = agrees(x, expected), options = list(whiskers = "min-max"), note = "Nothing lies beyond min and max.")

fixture("p10-90", input = list(x = x_outliers), expr = cell(x, "p10-90"), setup = reference,
  check = agrees(x, expected), options = list(whiskers = "p10-90"))

fixture("p5-95-small", input = list(x = c(4, 7, 9, 13)), expr = cell(x, "p5-95"), setup = reference,
  check = agrees(x, expected), options = list(whiskers = "p5-95"),
  note = "With 4 values the 5th and 95th percentiles clamp to the smallest and largest.")

fixture("p2.5-97.5", input = list(x = round(sin(1:60) * 8 + 40, 2)), expr = cell(x, "p2.5-97.5"),
  setup = reference, check = agrees(x, expected), options = list(whiskers = "p2.5-97.5"))

fixture("p1-99-ties", input = list(x = c(rep(5, 40), rep(6, 30), 2, 11, rep(7, 29))),
  expr = cell(x, "p1-99"), setup = reference, check = agrees(x, expected), options = list(whiskers = "p1-99"),
  note = "Many ties; one value beyond each whisker.")

fixture("tukey-zero-iqr", input = list(x = c(5, 5, 5, 5, 5, 9)), expr = cell(x, "tukey"),
  setup = reference, check = agrees(x, expected), options = list(whiskers = "tukey"),
  note = "The box has no height, so any other value is beyond the whiskers.")

fixture("kde", input = list(x = x_basic), expr = cell(x, adjust = 1), setup = reference,
  check = agrees(x, expected), options = list(adjust = 1))

fixture("kde-smoother", input = list(x = x_outliers), expr = cell(x, adjust = 2), setup = reference,
  check = agrees(x, expected, adjust = 2), options = list(adjust = 2), note = "Twice Silverman's bandwidth.")

fixture("kde-n3", input = list(x = c(1.5, 2.25, 4)), expr = cell(x, adjust = 0.5), setup = reference,
  check = agrees(x, expected, adjust = 0.5), options = list(adjust = 0.5), note = "The fewest values that get a violin.")

fixture("kde-zero-iqr", input = list(x = c(8, 8, 8, 8, 8, 8, 8, 12)), expr = cell(x, adjust = 1),
  setup = reference, check = agrees(x, expected), options = list(adjust = 1),
  note = "IQR 0: Silverman's rule falls back to the SD.")

fixture("kde-log", input = list(x = c(3, 8, 20, 45, 110, 260, 700, 1800)),
  expr = cell(x, adjust = 1, log = TRUE), setup = reference, check = agrees(x, expected, log = TRUE),
  options = list(adjust = 1, log = TRUE), note = "On a log axis the KDE is of log10 of the values.")

fixture("kde-tiny", input = list(x = c(1.2e-12, 3.4e-12, 2.2e-12, 5.1e-12, 2.9e-12)),
  expr = cell(x, adjust = 1), setup = reference, check = agrees(x, expected), options = list(adjust = 1),
  note = "Very small values keep their magnitude.")

fixture("kde-outlier", input = list(x = c(10.1, 9.8, 10.3, 9.9, 10.0, 250)), expr = cell(x, "tukey", 1),
  setup = reference, check = agrees(x, expected), options = list(whiskers = "tukey", adjust = 1),
  note = "An extreme value: a long, thin violin, and the value beyond the whisker.")
