# Friedman test with Dunn's multiple comparisons (item 17, #50), reported
# as Prism does. Ranks are midranks within each row (subject); the
# statistic is the chi-square approximation with the standard tie
# correction (matching R's own stats::friedman.test). Its P is exact
# (note 17's #82 section, as Kruskal-Wallis's was, #49) when the
# permutation distribution can be counted within a fixed budget, even
# with ties, and from the chi-square approximation otherwise.
# Comparisons are "A vs. B" with mean rank diff = mean rank A - mean rank
# B; no tie correction in the SE (Prism's own formula has none, unlike
# Dunn's after Kruskal-Wallis). `stop("bs: ...")` messages are shown to
# the user as written.

# All k! permutations of 1:k, one per row (base R only; no combinatorics
# package is shipped, item 06's package list).
bs_permutations <- function(k) {
  if (k == 1L) return(matrix(1L, 1L, 1L))
  sub <- bs_permutations(k - 1L)
  do.call(rbind, lapply(seq_len(k), function(i) {
    shifted <- sub
    shifted[shifted >= i] <- shifted[shifted >= i] + 1L
    cbind(i, shifted)
  }))
}

# Merge duplicate whole-number keys, summing their counts: a radix sort
# (keys are bounded integers) plus a run-length reduction, faster than a
# hash map at the sizes this DP reaches.
bs_merge_keys <- function(keys, counts) {
  o <- order(keys, method = "radix")
  keys <- keys[o]
  counts <- counts[o]
  first <- c(TRUE, diff(keys) != 0L)
  list(keys = keys[first], counts = as.vector(rowsum(counts, cumsum(first), reorder = FALSE)))
}

# Prism's own threshold, even with ties (note 17's #82 section, the same
# rule note 06 records for Mann-Whitney and Wilcoxon).
bs_friedman_small <- function(k, n) factorial(k)^n <= 1e9

# Exact P of the Friedman test by convolving each row's own permutation
# distribution of column rank sums (note 17): under the null, each row's
# midranks are independently and uniformly reassigned to the k columns.
# Only Σ(rank sum)² decides "at least as large as observed" (the other
# terms of the statistic are invariant under any such reassignment), and
# only needs the sums of columns 1..(k-1) tracked (the k-th is the fixed
# row-total minus the rest), packed into one whole-number key the same
# way `bs_kw_exact` packs its own state. NA (use the approximation) when
# `bs_friedman_small` refuses, or the DP's own state count passes `cap`
# regardless (never expected to, at the sizes the threshold admits;
# note 17 measured the worst corner — few subjects, many treatments — at
# under two seconds).
bs_friedman_exact <- function(r2, k, n, cap = 3e6) {
  if (!bs_friedman_small(k, n)) return(NA_real_)
  perms <- bs_permutations(k)
  radix <- as.integer(sum(apply(r2, 1, max)) + 1)
  place <- as.integer(radix^(seq_len(k - 1) - 1))
  keys <- 0L
  counts <- 1
  for (i in seq_len(n)) {
    row2 <- r2[i, ]
    assigned <- apply(perms, 2, function(idx) row2[idx])
    rkeys <- as.integer(assigned[, seq_len(k - 1), drop = FALSE] %*% place)
    row_merged <- bs_merge_keys(rkeys, rep(1, length(rkeys)))
    all_keys <- as.vector(outer(keys, row_merged$keys, "+"))
    storage.mode(all_keys) <- "integer"
    all_counts <- as.vector(outer(counts, row_merged$counts, "*"))
    merged <- bs_merge_keys(all_keys, all_counts)
    keys <- merged$keys
    counts <- merged$counts
    if (length(keys) > cap) return(NA_real_)
  }
  sums <- vapply(seq_len(k - 1), function(j) (keys %/% place[j]) %% radix, keys)
  sums <- matrix(sums, ncol = k - 1)
  last <- n * k * (k + 1) - rowSums(sums)
  t_all <- rowSums(sums^2) + last^2
  t_obs <- sum(colSums(r2)^2)
  sum(counts[t_all >= t_obs]) / sum(counts)
}

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
  p_exact <- bs_friedman_exact(2 * r, k, n)
  out <- list(
    k = k, n = n, statistic = stat, df = k - 1,
    p = if (is.na(p_exact)) pchisq(stat, k - 1, lower.tail = FALSE) else p_exact,
    exact = !is.na(p_exact),
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
