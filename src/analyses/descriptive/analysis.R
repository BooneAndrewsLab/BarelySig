# Descriptive statistics of one group (item 04, #16), as Prism's column
# statistics. `x` holds the values left after empty and excluded cells
# were dropped. Undefined values (SD of one value, CV of a zero mean,
# geometric mean with values <= 0) are NA; the app shows why.
bs_describe <- function(x) {
  n <- length(x)
  if (n == 0) return(list(n = 0L))
  m <- mean(x)
  s <- if (n > 1) sd(x) else NA_real_
  sem <- s / sqrt(n)
  half <- if (n > 1) qt(0.975, n - 1) * sem else NA_real_
  # Prism's percentiles: (n + 1) p with linear interpolation, R's type 6.
  q <- quantile(x, c(0.25, 0.5, 0.75), type = 6, names = FALSE)
  list(
    n = n,
    min = min(x), q1 = q[1], median = q[2], q3 = q[3], max = max(x),
    range = max(x) - min(x),
    mean = m, sd = s, sem = sem,
    ci_lower = m - half, ci_upper = m + half,
    cv = if (m != 0) 100 * s / m else NA_real_,
    geomean = if (all(x > 0)) exp(mean(log(x))) else NA_real_,
    sum = sum(x)
  )
}

# The same from summary data: what mean, SD and n allow, nothing guessed.
bs_describe_summary <- function(mean, sd, n) {
  sem <- if (!is.na(sd) && !is.na(n)) sd / sqrt(n) else NA_real_
  half <- if (!is.na(sem) && n > 1) qt(0.975, n - 1) * sem else NA_real_
  list(
    n = n, mean = mean, sd = sd, sem = sem,
    ci_lower = mean - half, ci_upper = mean + half,
    cv = if (!is.na(mean) && mean != 0) 100 * sd / mean else NA_real_
  )
}
