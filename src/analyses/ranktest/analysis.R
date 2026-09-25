# Mann-Whitney and Wilcoxon matched-pairs tests (item 06, #24), reported
# as Prism does. Group A is the first data set, B the second; differences
# are B - A. Exact P values, even with ties, are counted over doubled
# midranks (whole numbers), so comparing with the observed value is exact.
# `stop("bs: ...")` messages are shown to the user as written.

# Largest whole number dividing every score.
bs_gcd <- function(x) {
  g <- x[1]
  for (v in x[-1]) {
    while (v) {
      t <- g %% v
      g <- v
      v <- t
    }
  }
  g
}

# How many subsets of `m` of the whole-number `scores` have each sum, as
# counts over the sums 0, g, 2g, ... (g the scores' common divisor, which
# keeps the table short). Column k + 1 holds subsets of size k; adding the
# i-th smallest score updates each size in one vector operation, over the
# sums reachable so far and only for sizes that can still grow to m. With
# `work = TRUE` it returns the number of cells it would update instead.
bs_subset_sums <- function(scores, m, work = FALSE) {
  g <- bs_gcd(scores)
  scores <- sort(scores %/% g)
  n <- length(scores)
  top <- sum(scores[(n - m + 1):n])
  cs <- c(0, cumsum(scores))
  cells <- 0
  if (!work) {
    counts <- matrix(0, top + 1, m + 1)
    counts[1, 1] <- 1
  }
  for (i in seq_len(n)) {
    s <- scores[i]
    for (k in min(i, m):max(1, m - (n - i))) {
      # Sums of k - 1 of the first i - 1 scores lie in [lo, hi].
      lo <- cs[k]
      hi <- min(cs[i] - cs[i - k + 1], top - s)
      if (hi < lo) next
      if (work) {
        cells <- cells + hi - lo + 1
      } else {
        from <- (lo + 1):(hi + 1)
        counts[from + s, k + 1] <- counts[from + s, k + 1] + counts[from, k]
      }
    }
  }
  if (work) cells else list(counts = counts[, m + 1], g = g)
}

# Exact counting of the rank sum with ties is capped at this many cell
# updates; beyond it the normal approximation is
# used and the results say so. 100 against 100 tied values fits (2.5 s in
# WebR under Node).
BS_EXACT_WORK <- 5e7
# Without ties R's dwilcox counts U; capped at m * n (its cost grows with it).
BS_EXACT_MN <- 5e4

# How many sign patterns give each sum of the positive scores.
bs_signed_sums <- function(scores) {
  top <- sum(scores)
  counts <- c(1, numeric(top))
  for (s in scores) {
    to <- (s + 1):(top + 1)
    counts[to] <- counts[to] + counts[seq_len(top + 1 - s)]
  }
  counts
}

# P values from `counts` over the sums 0..top, for the observed sum `obs`,
# when the sum's mean is num / den (whole numbers, so every comparison is
# exact). Two-tailed: at least as far from the mean as observed, either
# way. One-tailed: the tail in the observed direction.
bs_exact_p <- function(counts, obs, num, den) {
  sums <- seq_along(counts) - 1
  total <- sum(counts)
  two <- sum(counts[abs(den * sums - num) >= abs(den * obs - num)]) / total
  one <- sum(counts[if (den * obs >= num) sums >= obs else sums <= obs]) / total
  list(two = min(1, two), one = min(1, one))
}

# Which order statistics bound a confidence interval, from a null
# distribution without ties (`counts` over the statistic 0, 1, ...): the
# k-th from each end, k the smallest value whose lower tail reaches
# alpha / 2 (qwilcox / qsignrank, as R's wilcox.test), at least 1. The
# level achieved is reported, since it is never exactly 95%.
bs_ci_rank <- function(counts, alpha = 0.05) {
  cdf <- cumsum(counts) / sum(counts)
  k <- max(1, which(cdf >= alpha / 2)[1] - 1)
  list(k = k, level = 1 - 2 * cdf[k])
}

bs_mann_whitney <- function(a, b) {
  na <- length(a)
  nb <- length(b)
  if (na < 1 || nb < 1) stop("bs: Each group needs at least one value for a Mann-Whitney test.")
  n <- na + nb
  r <- rank(c(a, b))
  ra <- sum(r[seq_len(na)])
  rb <- sum(r[na + seq_len(nb)])
  ub <- rb - nb * (nb + 1) / 2
  ua <- na * nb - ub
  diffs <- sort(as.vector(outer(b, a, "-")))
  m <- min(na, nb)
  r2 <- as.integer(round(2 * r))
  small <- sum(if (nb <= na) r2[na + seq_len(nb)] else r2[seq_len(na)])
  ties <- anyDuplicated(r2) > 0
  # Prism: exact when the smaller group has 100 values or fewer.
  exact <- m <= 100 && if (ties) bs_subset_sums(r2, m, work = TRUE) <= BS_EXACT_WORK else na * nb <= BS_EXACT_MN
  if (exact) {
    if (ties) {
      d <- bs_subset_sums(r2, m)
      p <- bs_exact_p(d$counts, small / d$g, m * sum(r2) / d$g, n)
    } else {
      # U of the smaller group, whose mean is m * (n - m) / 2.
      u_small <- small / 2 - m * (m + 1) / 2
      p <- bs_exact_p(dwilcox(0:(na * nb), m, n - m), u_small, na * nb, 2)
    }
    p_two <- p$two
    p_one <- p$one
  } else {
    p_two <- suppressWarnings(wilcox.test(b, a, exact = FALSE, correct = TRUE))$p.value
    p_one <- suppressWarnings(wilcox.test(b, a,
      exact = FALSE, correct = TRUE,
      alternative = if (ub >= na * nb / 2) "greater" else "less"
    ))$p.value
  }
  # CI of the difference: order statistics of the m * n differences, from
  # U's distribution without ties (Sheskin; Klotz), whenever that can be
  # counted; R's asymptotic interval otherwise.
  if (na * nb <= BS_EXACT_MN) {
    ci <- bs_ci_rank(dwilcox(0:(na * nb), na, nb))
    lower <- diffs[ci$k]
    upper <- diffs[na * nb + 1 - ci$k]
    level <- ci$level
  } else {
    w <- suppressWarnings(wilcox.test(b, a, exact = FALSE, correct = TRUE, conf.int = TRUE))
    lower <- w$conf.int[1]
    upper <- w$conf.int[2]
    level <- 0.95
  }
  list(
    exact = exact, p_two = p_two, p_one = p_one, u = min(ua, ub),
    n_a = na, n_b = nb, rank_sum_a = ra, rank_sum_b = rb, mean_rank_a = ra / na, mean_rank_b = rb / nb,
    median_a = median(a), median_b = median(b), difference = median(b) - median(a),
    hodges_lehmann = median(diffs), ci_lower = lower, ci_upper = upper, ci_level = level
  )
}

bs_wilcoxon <- function(a, b, pratt) {
  # Rounded so that differences equal in decimal are tied (Prism, FAQ 2020):
  # 2.4 - 2.3 and 1.3 - 1.2 differ in their last binary digits.
  d_all <- signif(b - a, 12)
  n <- length(d_all)
  if (n < 1) stop("bs: A Wilcoxon test needs at least one complete pair (a row with a value in both groups).")
  nonzero <- d_all != 0
  zeros <- sum(!nonzero)
  if (zeros == n) {
    stop("bs: Every pair has the same value in both groups, so there is no difference to test.")
  }
  # Wilcoxon's method ranks only the nonzero differences; Pratt's ranks all
  # of them, and the zeros then count for neither side.
  r <- if (pratt) rank(abs(d_all))[nonzero] else rank(abs(d_all[nonzero]))
  d <- d_all[nonzero]
  tplus <- sum(r[d > 0])
  tminus <- sum(r[d < 0])
  exact <- n < 200
  if (exact) {
    r2 <- as.integer(round(2 * r))
    p <- bs_exact_p(bs_signed_sums(r2), as.integer(round(2 * tplus)), sum(r2), 2)
    p_two <- p$two
    p_one <- p$one
  } else {
    # Normal approximation: the variance from the actual ranks, continuity 0.5 (Prism, FAQ 332).
    dev <- tplus - sum(r) / 2
    z <- (abs(dev) - 0.5) / sqrt(sum(r^2) / 4)
    p_two <- min(1, 2 * pnorm(-z))
    p_one <- pnorm(-z)
  }
  # Hodges-Lehmann: the median of the Walsh averages of all differences,
  # with the CI from the signed-rank distribution without ties.
  walsh <- outer(d_all, d_all, "+") / 2
  walsh <- sort(walsh[upper.tri(walsh, diag = TRUE)])
  if (n <= 1000) {
    ci <- bs_ci_rank(dsignrank(0:(n * (n + 1) / 2), n))
    lower <- walsh[ci$k]
    upper <- walsh[length(walsh) + 1 - ci$k]
    level <- ci$level
  } else {
    w <- suppressWarnings(wilcox.test(d_all, exact = FALSE, correct = TRUE, conf.int = TRUE))
    lower <- w$conf.int[1]
    upper <- w$conf.int[2]
    level <- 0.95
  }
  # Prism's "was the pairing effective?": Spearman's r, one-tailed P for
  # r > 0. Exact (R's AS 89) up to 9 pairs without ties, where R counts
  # every permutation; otherwise the t approximation, which Prism uses from
  # 18 pairs (R's Edgeworth series in between matches neither).
  pairing <- if (n > 2 && length(unique(a)) > 1 && length(unique(b)) > 1) {
    rs <- cor(rank(a), rank(b))
    p <- if (n <= 9 && !anyDuplicated(a) && !anyDuplicated(b)) {
      cor.test(a, b, method = "spearman", alternative = "greater", exact = TRUE)$p.value
    } else {
      pt(rs * sqrt((n - 2) / (1 - rs^2)), n - 2, lower.tail = FALSE)
    }
    list(pairing_r = rs, pairing_p = p)
  } else {
    list(pairing_r = NA_real_, pairing_p = NA_real_)
  }
  c(list(
    exact = exact, p_two = p_two, p_one = p_one, w = tplus - tminus,
    sum_positive = tplus, sum_negative = -tminus, n_pairs = n, n_zero = zeros,
    median_a = median(a), median_b = median(b), median_difference = median(d_all),
    hodges_lehmann = median(walsh), ci_lower = lower, ci_upper = upper, ci_level = level
  ), pairing)
}
