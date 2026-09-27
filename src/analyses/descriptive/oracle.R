# Fixtures for descriptive statistics (#16, item 04). The reference is
# independent of the app's analysis.R: percentiles by Prism's documented
# rule written out by hand (not quantile()), the CI of the mean from
# t.test(), the geometric mean as a product of roots (prod(x)^(1/n) would overflow). NA = not defined.

reference <- quote({
  # Prism: the p-th percentile is at rank (n + 1) p, interpolated linearly
  # between neighbours, and the smallest or largest value outside 1..n
  # (GraphPad FAQ 501, "How Prism computes percentiles"; Hyndman & Fan
  # definition 6).
  prism_percentile <- function(x, p) {
    x <- sort(x)
    n <- length(x)
    h <- (n + 1) * p
    if (h <= 1) return(x[1])
    if (h >= n) return(x[n])
    lo <- floor(h)
    x[lo] + (h - lo) * (x[lo + 1] - x[lo])
  }
  describe <- function(x) {
    x <- x[!is.na(x)]
    n <- length(x)
    m <- sum(x) / n
    s <- if (n > 1) sqrt(sum((x - m)^2) / (n - 1)) else NA
    ci <- if (n < 2) c(NA, NA) else if (s == 0) c(m, m) else t.test(x)$conf.int[1:2]
    list(
      n = n, min = min(x), q1 = prism_percentile(x, 0.25), median = prism_percentile(x, 0.5),
      q3 = prism_percentile(x, 0.75), max = max(x), range = max(x) - min(x),
      mean = m, sd = s, sem = s / sqrt(n), ci_lower = ci[1], ci_upper = ci[2],
      cv = if (m != 0) 100 * s / m else NA,
      geomean = if (all(x > 0)) prod(x^(1 / n)) else NA,
      sum = sum(x)
    )
  }
  # Summary data checked against raw values that have exactly that mean,
  # SD and n, so the reference doesn't share the summary formulas.
  from_summary <- function(mean, sd, n) {
    if (is.na(n)) return(list(n = NA, mean = mean, sd = sd, sem = NA, ci_lower = NA, ci_upper = NA,
                              cv = 100 * sd / mean))
    x <- as.numeric(scale(seq_len(n))) * sd + mean
    ci <- t.test(x)$conf.int
    list(n = n, mean = mean, sd = sd, sem = sd(x) / sqrt(n), ci_lower = ci[1], ci_upper = ci[2],
         cv = 100 * sd / mean)
  }
})

fixture("basic", input = list(x = c(34, 43, 81, 106, 106, 115)), expr = describe(x), setup = reference)

fixture("missing", input = list(x = c(3.2, NA, 4.8, 5.1, NA, 6)), expr = describe(x), setup = reference,
  note = "Empty cells are dropped, not read as zero: n is 4.")

fixture("n-2", input = list(x = c(10, 14)), expr = describe(x), setup = reference,
  note = "Percentiles of two values clamp to the smallest and largest.")

fixture("n-1", input = list(x = 7), expr = describe(x), setup = reference,
  note = "One value: SD, SEM, CI and CV are not defined.")

fixture("zero-variance", input = list(x = c(5, 5, 5, 5)), expr = describe(x), setup = reference,
  note = "SD 0, a zero-width CI.")

fixture("ties", input = list(x = c(1, 2, 2, 2, 3, 3, 4)), expr = describe(x), setup = reference)

fixture("outlier", input = list(x = c(10.1, 9.8, 10.3, 9.9, 10.0, 250)), expr = describe(x),
  setup = reference, note = "An extreme value moves the mean, not the median.")

fixture("negative", input = list(x = c(-2, 1, 3, -0.5)), expr = describe(x), setup = reference,
  note = "No geometric mean with values <= 0.")

fixture("zero-mean", input = list(x = c(-1, 1)), expr = describe(x), setup = reference,
  note = "CV is not defined when the mean is 0.")

fixture("n-200", input = list(x = round(sin(1:200) * 10 + 50, 3)), expr = describe(x), setup = reference)

fixture("tiny-values", input = list(x = c(1.2e-12, 3.4e-12, 2.2e-12, 5.1e-12)), expr = describe(x),
  setup = reference, note = "Very small values keep their magnitude.")

fixture("summary-sd-n", input = list(mean = 12.5, sd = 2.1, n = 8), expr = from_summary(mean, sd, n),
  setup = reference, options = list(from = "summary"))

fixture("summary-no-n", input = list(mean = 3, sd = 1, n = NA), expr = from_summary(mean, sd, n),
  setup = reference, options = list(from = "summary"),
  note = "Without n there is no SEM or CI.")

# Grouped-table descriptive statistics (item 18, #54): per-cell statistics
# reuse the same describe()/from_summary() reference above (a cell is just
# a group). This one checks pooling one data set over two rows, as
# poolColumn concatenates the rows' raw values before describing them:
# the "basic" and "missing" cases' values, pooled.
fixture("pooled", input = list(x = c(34, 43, 81, 106, 106, 115, 3.2, NA, 4.8, 5.1, NA, 6)),
  expr = describe(x), setup = reference,
  note = "Grouped-table pooling: two rows' values for one data set, concatenated then described.")
