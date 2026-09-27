# Friedman test with Dunn's multiple comparisons (item 17, #50), reported
# as Prism does. Ranks are midranks within each row (subject); the
# statistic is the chi-square approximation with the standard tie
# correction (matching R's own stats::friedman.test), always labelled
# approximate (#82 is the exact permutation P, as Kruskal-Wallis's was
# split off before it was built, #49). Comparisons are "A vs. B" with
# mean rank diff = mean rank A - mean rank B; no tie correction in the
# SE (Prism's own formula has none, unlike Dunn's after Kruskal-Wallis).
# `stop("bs: ...")` messages are shown to the user as written.

# y: subject-major, length n*k (row i's k values before row i+1's).
bs_friedman <- function(y, n, k, comps, control, corrected) {
  if (k < 3) stop("bs: The Friedman test compares three or more matched groups.")
  if (n < 2) stop("bs: The Friedman test needs at least two complete rows.")
  Y <- matrix(y, nrow = n, ncol = k, byrow = TRUE)
  r <- t(apply(Y, 1, rank))
  rank_sum <- colSums(r)
  mean_rank <- rank_sum / n
  ties <- apply(r, 1, table)
  tie_sum <- sum(unlist(lapply(ties, function(t) t^3 - t)))
  stat <- 12 * sum((rank_sum - n * (k + 1) / 2)^2) / (n * k * (k + 1) - tie_sum / (k - 1))
  out <- list(
    k = k, n = n, statistic = stat, df = k - 1,
    p = pchisq(stat, k - 1, lower.tail = FALSE),
    groups = lapply(seq_len(k), function(j) list(rank_sum = rank_sum[j], mean_rank = mean_rank[j]))
  )
  out$comparisons <- if (comps == "none") {
    list()
  } else {
    pairs <- if (comps == "all") {
      p <- which(upper.tri(diag(k)), arr.ind = TRUE)
      unname(p[order(p[, 1], p[, 2]), , drop = FALSE])
    } else {
      unname(cbind(control, setdiff(seq_len(k), control)))
    }
    K <- nrow(pairs)
    # Dunn, after Friedman (Daniel, Applied Nonparametric Statistics, 2nd
    # ed., pp. 240-241): no tie correction, unlike the Kruskal-Wallis version.
    se <- sqrt(k * (k + 1) / (6 * n))
    lapply(seq_len(K), function(x) {
      i <- pairs[x, 1]
      j <- pairs[x, 2]
      d <- mean_rank[i] - mean_rank[j]
      z <- abs(d) / se
      pu <- 2 * pnorm(-z)
      list(i = i, j = j, diff = d, z = z, p_unadjusted = pu, p = if (corrected) min(1, K * pu) else pu)
    })
  }
  out
}
