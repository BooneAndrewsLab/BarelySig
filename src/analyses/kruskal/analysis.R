# Kruskal-Wallis test with Dunn's multiple comparisons (item 06, #26),
# reported as Prism does. Ranks are midranks over all groups; H is
# corrected for ties and its P comes from the chi-square approximation
# (Prism's exact P for small samples is a follow-up). Comparisons are
# "A vs. B" with mean rank diff = mean rank A - mean rank B.
# `stop("bs: ...")` messages are shown to the user as written.

# y: the values; g: each value's group (1..k, the table's order).
bs_kruskal <- function(y, g, k, comps, control, corrected) {
  if (k < 2) stop("bs: The Kruskal-Wallis test compares at least two groups.")
  n <- tabulate(g, k)
  if (any(n == 0)) stop("bs: Every group needs at least one value.")
  N <- length(y)
  r <- rank(y)
  ties <- table(r)
  tie_sum <- sum(ties^3 - ties)
  if (tie_sum == N^3 - N) {
    stop("bs: Every value is the same, so there are no ranks to compare; the Kruskal-Wallis test can't be computed.")
  }
  rank_sum <- vapply(seq_len(k), function(i) sum(r[g == i]), 0)
  mean_rank <- rank_sum / n
  h <- (12 / (N * (N + 1)) * sum(rank_sum^2 / n) - 3 * (N + 1)) / (1 - tie_sum / (N^3 - N))
  out <- list(
    k = k, n_total = N, h = h, df = k - 1, p = pchisq(h, k - 1, lower.tail = FALSE),
    groups = lapply(seq_len(k), function(i) {
      list(n = n[i], median = median(y[g == i]), rank_sum = rank_sum[i], mean_rank = mean_rank[i])
    })
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
    # Dunn (1964), as Prism: the ranks' variance corrected for ties.
    v <- N * (N + 1) / 12 - tie_sum / (12 * (N - 1))
    lapply(seq_len(K), function(x) {
      i <- pairs[x, 1]
      j <- pairs[x, 2]
      d <- mean_rank[i] - mean_rank[j]
      z <- abs(d) / sqrt(v * (1 / n[i] + 1 / n[j]))
      p <- 2 * pnorm(-z)
      list(i = i, j = j, diff = d, z = z, p_unadjusted = p, p = if (corrected) min(1, K * p) else p)
    })
  }
  out
}
