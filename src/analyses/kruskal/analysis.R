# Kruskal-Wallis test with Dunn's multiple comparisons (item 06, #26),
# reported as Prism does. Ranks are midranks over all groups; H is
# corrected for ties. Its P is exact (note 07, #49) when the permutation
# distribution can be counted within a fixed budget, even with ties, and
# from the chi-square approximation otherwise. Comparisons are "A vs. B"
# with mean rank diff = mean rank A - mean rank B.
# `stop("bs: ...")` messages are shown to the user as written.

# Exact P of Kruskal-Wallis by counting every way to share the ranks out
# into groups of sizes `n` (N! / prod(n!) of them), conditional on the
# ties. `r2` are doubled midranks, whole numbers, so every sum is exact.
# Dynamic programming over the ranks: a state is how many ranks each
# group has so far and the rank sums of all groups but the last (the last
# one's is what remains), packed into one whole-number key; states with
# the same key are merged by adding their counts. H grows with
# T = sum(S_j^2 * L / n_j), L = lcm(n), a whole number, so "at least as
# large as observed" is decided exactly. NA (use the approximation) when
# bs_kw_small() expects too much work, or the count passes `cap` states
# after all, or a key couldn't be held exactly: that choice depends on the
# data alone, never on the computer's speed.
# Whether the exact count is small enough to run: an estimate of the
# states it visits, from the group sizes alone. At step i, a vector of
# counts c (sum i) holds at most i! / prod(c!) states and about
# prod(c_j (i - c_j) + 1) distinct rank sums; the estimate sums the
# smaller of the two, and was within a factor of 3 of the real work over
# 2 to 5 groups. The budget admits three groups of up to 6 and four of 3
# (a few seconds in WebR at most); four of 4 and three of 7 are
# approximate.
bs_kw_small <- function(n, budget = 2.6e5) {
  k <- length(n)
  if (prod(n + 1) > 2e4) return(FALSE)
  grid <- as.matrix(expand.grid(lapply(n, function(m) 0:m)))
  s <- rowSums(grid)
  est <- 0
  for (i in seq_len(sum(n))) {
    cs <- grid[s == i, , drop = FALSE]
    many <- lfactorial(i) - rowSums(lfactorial(cs))
    sums <- rowSums(log(cs[, -k, drop = FALSE] * (i - cs[, -k, drop = FALSE]) + 1))
    est <- est + sum(exp(pmin(many, sums)))
  }
  est <= budget
}

bs_kw_exact <- function(r2, g, n, cap = 1.2e6) {
  if (!bs_kw_small(n)) return(NA_real_)
  k <- length(n)
  N <- length(r2)
  total <- sum(r2)
  top <- vapply(n, function(m) sum(sort(r2, decreasing = TRUE)[seq_len(m)]), 0)
  # Mixed-radix places: counts first, then the sums of groups 1..k-1.
  radix <- c(n + 1, top[-k] + 1)
  place <- cumprod(c(1, radix))[seq_along(radix)]
  if (prod(radix) > 2^52) return(NA_real_)
  keys <- 0
  counts <- 1
  visited <- 0
  for (v in r2) {
    nk <- vector("list", k)
    nc <- vector("list", k)
    for (j in seq_len(k)) {
      cj <- (keys %/% place[j]) %% radix[j]
      ok <- cj < n[j]
      step <- place[j] + if (j < k) v * place[k + j] else 0
      nk[[j]] <- keys[ok] + step
      nc[[j]] <- counts[ok]
    }
    all_keys <- unlist(nk)
    all_counts <- unlist(nc)
    o <- order(all_keys)
    all_keys <- all_keys[o]
    first <- c(TRUE, diff(all_keys) != 0)
    keys <- all_keys[first]
    counts <- as.vector(rowsum(all_counts[o], cumsum(first), reorder = FALSE))
    visited <- visited + length(keys)
    if (visited > cap) return(NA_real_)
  }
  sums <- vapply(seq_len(k - 1), function(j) (keys %/% place[k + j]) %% radix[k + j], keys)
  sums <- matrix(sums, ncol = k - 1)
  last <- total - rowSums(sums)
  gcd <- function(a, b) if (b == 0) a else gcd(b, a %% b)
  L <- Reduce(function(a, b) a * b / gcd(a, b), n)
  w <- L / n
  t_all <- as.vector(sums^2 %*% w[-k]) + last^2 * w[k]
  obs <- vapply(seq_len(k), function(j) sum(r2[g == j]), 0)
  t_obs <- sum(obs^2 * w)
  sum(counts[t_all >= t_obs]) / sum(counts)
}

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
  p_exact <- bs_kw_exact(2 * r, g, n)
  out <- list(
    k = k, n_total = N, h = h, df = k - 1,
    p = if (is.na(p_exact)) pchisq(h, k - 1, lower.tail = FALSE) else p_exact,
    exact = !is.na(p_exact),
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
