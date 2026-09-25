# A graph's statistics (note 07, #31): for each plotted cell, the
# descriptive statistics of bs_describe (descriptive's analysis.R, run
# before this), and for box and violin plots the whisker ends, the values
# beyond them and a Gaussian KDE. Quartiles and percentiles are Prism's
# (type 6). The KDE is evaluated exactly at 64 points from the smallest to
# the largest value (the violin is truncated at the data, as Prism draws
# it), with Silverman's rule-of-thumb bandwidth (bw.nrd0) times `adjust`.

bs_whiskers <- function(x, whiskers) {
  q <- quantile(x, c(0.25, 0.75), type = 6, names = FALSE)
  ends <- if (whiskers == "tukey") {
    fence <- 1.5 * (q[2] - q[1])
    c(min(x[x >= q[1] - fence]), max(x[x <= q[2] + fence]))
  } else if (whiskers == "min-max") {
    range(x)
  } else {
    p <- c("p10-90" = 0.1, "p5-95" = 0.05, "p2.5-97.5" = 0.025, "p1-99" = 0.01)[[whiskers]]
    quantile(x, c(p, 1 - p), type = 6, names = FALSE)
  }
  list(low = ends[1], high = ends[2], beyond = sort(x[x < ends[1] | x > ends[2]]))
}

bs_kde <- function(x, adjust, log) {
  if (log) x <- log10(x[x > 0])
  n <- length(x)
  if (n < 3 || max(x) == min(x)) return(NA)
  h <- bw.nrd0(x) * adjust
  y <- seq(min(x), max(x), length.out = 64L)
  d <- rowSums(dnorm(outer(y, x, "-") / h)) / (n * h)
  list(bw = h, y = if (log) 10^y else y, density = d)
}

bs_graph_cell <- function(x, whiskers, adjust, log) {
  out <- bs_describe(x)
  if (length(x) == 0) return(out)
  if (!is.na(whiskers)) out$whiskers <- bs_whiskers(x, whiskers)
  if (!is.na(adjust)) out$kde <- bs_kde(x, adjust, log)
  out
}
