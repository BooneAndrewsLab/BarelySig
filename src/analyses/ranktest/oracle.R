# Fixtures for the Mann-Whitney and Wilcoxon matched-pairs tests (#24,
# item 06). The reference enumerates every way to shuffle the data (every
# split into two groups, every sign pattern), which is the definition of
# the exact P, so it shares nothing with the app's counting; larger cases
# use R's pwilcox / psignrank (no ties) or the normal approximation.
# Each case is confirmed against R's wilcox.test where R computes the same
# thing, and against coin's exact tests (a reference-only package) with
# ties. Differences are B - A, as Prism reports them.

reference <- quote({
  eps <- 1e-9
  drop_na <- function(x) x[!is.na(x)]
  # Order statistics of a sorted vector for the CI, from the lower tail of a
  # null distribution without ties (`q`: quantile function, `p`: cdf):
  # k = qwilcox(alpha / 2), at least 1; the level achieved is 1 - 2 P(V < k).
  ci <- function(sorted, q, p) {
    k <- max(1, q(0.025))
    list(ci_lower = sorted[k], ci_upper = sorted[length(sorted) + 1 - k], ci_level = 1 - 2 * p(k - 1))
  }
  # P values from every value of the statistic and its probability.
  tails <- function(stat, obs, mu, prob = rep(1 / length(stat), length(stat))) {
    list(
      p_two = min(1, sum(prob[abs(stat - mu) >= abs(obs - mu) - eps])),
      p_one = if (obs >= mu) sum(prob[stat >= obs - eps]) else sum(prob[stat <= obs + eps])
    )
  }
  normal <- function(obs, mu, v) {
    z <- (abs(obs - mu) - 0.5) / sqrt(v)
    list(p_two = min(1, 2 * pnorm(-z)), p_one = pnorm(-z))
  }
  mann_whitney <- function(a, b, how = c("enumerate", "pwilcox", "normal")) {
    how <- match.arg(how)
    a <- drop_na(a); b <- drop_na(b)
    na <- length(a); nb <- length(b); n <- na + nb
    r <- rank(c(a, b))
    rb <- sum(r[na + seq_len(nb)])
    ub <- rb - nb * (nb + 1) / 2
    p <- switch(how,
      # Every split of the n ranks into nb for B and the rest for A.
      enumerate = tails(apply(combn(n, nb), 2, function(i) sum(r[i])), rb, nb * (n + 1) / 2),
      pwilcox = {
        u <- 0:(na * nb)
        tails(u, ub, na * nb / 2, dwilcox(u, nb, na))
      },
      normal = {
        t <- table(r)
        normal(ub, na * nb / 2, na * nb / 12 * ((n + 1) - sum(t^3 - t) / (n * (n - 1))))
      }
    )
    diffs <- sort(outer(b, a, "-"))
    c(list(exact = how != "normal"), p, list(
      u = min(ub, na * nb - ub), n_a = na, n_b = nb,
      rank_sum_a = sum(r) - rb, rank_sum_b = rb, mean_rank_a = (sum(r) - rb) / na, mean_rank_b = rb / nb,
      median_a = median(a), median_b = median(b), difference = median(b) - median(a),
      hodges_lehmann = median(diffs)
    ), ci(diffs, function(x) qwilcox(x, na, nb), function(x) pwilcox(x, na, nb)))
  }
  wilcoxon <- function(a, b, pratt = FALSE, how = c("enumerate", "psignrank", "normal")) {
    how <- match.arg(how)
    keep <- !is.na(a) & !is.na(b)
    a <- a[keep]; b <- b[keep]
    d <- round(b - a, 10)
    n <- length(d)
    r_all <- rank(abs(d))
    nz <- d != 0
    r <- if (pratt) r_all[nz] else rank(abs(d[nz]))
    dd <- d[nz]
    tplus <- sum(r[dd > 0])
    p <- switch(how,
      # Every pattern of signs on the ranks of the nonzero differences.
      enumerate = tails(as.vector(as.matrix(expand.grid(rep(list(0:1), length(r)))) %*% r), tplus, sum(r) / 2),
      psignrank = {
        v <- 0:(n * (n + 1) / 2)
        tails(v, tplus, sum(r) / 2, dsignrank(v, n))
      },
      normal = normal(tplus, sum(r) / 2, sum(r^2) / 4)
    )
    w <- outer(d, d, "+") / 2
    w <- sort(w[upper.tri(w, diag = TRUE)])
    # Spearman's r, one-tailed P: every permutation of B's ranks when small,
    # the t approximation otherwise.
    ra <- rank(a); rb <- rank(b)
    rs <- suppressWarnings(cor(ra, rb))
    pr <- if (n <= 2 || sd(ra) == 0 || sd(rb) == 0) {
      list(pairing_r = NA, pairing_p = NA)
    } else if (n <= 9 && !anyDuplicated(a) && !anyDuplicated(b)) {
      perms <- function(v) if (length(v) == 1) matrix(v) else do.call(rbind, lapply(seq_along(v), function(i) cbind(v[i], perms(v[-i]))))
      all_r <- apply(perms(seq_len(n)), 1, function(p) cor(seq_len(n), p))
      list(pairing_r = rs, pairing_p = mean(all_r >= cor(ra, rb) - eps))
    } else {
      list(pairing_r = rs, pairing_p = pt(rs * sqrt((n - 2) / (1 - rs^2)), n - 2, lower.tail = FALSE))
    }
    c(list(exact = how != "normal"), p, list(
      w = tplus - sum(r[dd < 0]), sum_positive = tplus, sum_negative = -sum(r[dd < 0]),
      n_pairs = n, n_zero = sum(!nz), median_a = median(a), median_b = median(b),
      median_difference = median(d), hodges_lehmann = median(w)
    ), ci(w, function(x) qsignrank(x, n), function(x) psignrank(x, n)), pr)
  }
})

# Confirmations against R and coin (checks, desktop R only).
close <- function(x, y, tol = 1e-9) isTRUE(all.equal(as.numeric(x), as.numeric(y), tolerance = tol))
mw_frame <- function(a, b) {
  a <- a[!is.na(a)]; b <- b[!is.na(b)]
  data.frame(v = c(a, b), g = factor(rep(c("A", "B"), c(length(a), length(b))), levels = c("B", "A")))
}
mw_check <- quote({
  w <- wilcox.test(b, a, exact = !anyDuplicated(c(a[!is.na(a)], b[!is.na(b)])), correct = TRUE, conf.int = TRUE)
  ok <- close(expected$p_two, w$p.value) && close(expected$hodges_lehmann, w$estimate, 1e-6)
  # R 4.6 inverts its exact test for the CI when there are ties; ours is the
  # classic interval (Sheskin, Klotz), so the two are compared without ties.
  untied <- !anyDuplicated(c(a[!is.na(a)], b[!is.na(b)]))
  if (untied && all(is.finite(w$conf.int))) ok <- ok && close(c(expected$ci_lower, expected$ci_upper), w$conf.int[1:2])
  ok
})
mw_coin <- quote(close(expected$p_two, pvalue(wilcox_test(v ~ g, data = mw_frame(a, b), distribution = "exact"))))
wx_coin <- function(zero) {
  bquote({
    keep <- !is.na(a) & !is.na(b)
    d <- round(b[keep] - a[keep], 10)
    close(expected$p_two, pvalue(wilcoxsign_test(d ~ numeric(length(d)), distribution = "exact", zero.method = .(zero))))
  })
}
wx_check <- quote({
  keep <- !is.na(a) & !is.na(b)
  w <- wilcox.test(b[keep], a[keep], paired = TRUE, exact = TRUE, conf.int = TRUE)
  d <- round(b[keep] - a[keep], 10)
  untied <- !anyDuplicated(abs(d)) && all(d != 0)
  close(expected$p_two, w$p.value) && close(expected$hodges_lehmann, w$estimate, 1e-6) &&
    (!untied || close(c(expected$ci_lower, expected$ci_upper), w$conf.int[1:2])) &&
    (is.na(expected$pairing_p) || sum(keep) > 9 || close(expected$pairing_p, cor.test(a[keep], b[keep], method = "spearman", alternative = "greater")$p.value, 1e-6))
})

wx_coin_wilcoxon <- wx_coin("Wilcoxon")
wx_coin_pratt <- wx_coin("Pratt")

mw <- list(paired = FALSE)
wx <- list(paired = TRUE, zeros = "wilcoxon")
pratt <- list(paired = TRUE, zeros = "pratt")

# --- Mann-Whitney ----------------------------------------------------------------
fixture("mw-basic", input = list(a = c(12.1, 14.3, 11.8, 13.0, 12.6), b = c(15.2, 13.9, 16.8, 14.7, 17.1, 15.9)),
  expr = mann_whitney(a, b), setup = reference, options = mw, check = mw_check)

fixture("mw-missing", input = list(a = c(3.2, NA, 4.1, 2.9, 3.8, NA), b = c(4.5, 5.1, NA, 4.9, 3.7)),
  expr = mann_whitney(a, b), setup = reference, options = mw, check = mw_check,
  note = "Empty cells drop out of each column; they are not zeros.")

fixture("mw-unequal-n", input = list(a = c(1.1, 2.3, 1.9), b = c(2.8, 3.5, 2.2, 4.1, 3.3, 2.9, 3.9, 4.4)),
  expr = mann_whitney(a, b), setup = reference, options = mw, check = mw_check)

fixture("mw-n-2", input = list(a = c(4, 6), b = c(9, 12)),
  expr = mann_whitney(a, b), setup = reference, options = mw, check = mw_check,
  note = "Two against two: the smallest P possible is 1/3, and the widest CI covers only 67%.")

fixture("mw-n-3", input = list(a = c(1.2, 1.5, 1.1), b = c(2.3, 2.0, 2.6)),
  expr = mann_whitney(a, b), setup = reference, options = mw, check = mw_check,
  note = "Complete separation of 3 and 3: P = 0.1, never below 0.05; the CI covers 90%.")

fixture("mw-ties", input = list(a = c(1, 2, 2, 3, 3, 3, 4), b = c(2, 3, 4, 4, 5, 5)),
  expr = mann_whitney(a, b), setup = reference, options = mw,
  check = mw_coin, check_packages = "coin",
  note = "Exact P with ties, by shuffling the midranks (Prism 6 and later).")

fixture("mw-all-tied", input = list(a = c(5, 5, 5), b = c(5, 5, 5, 5)),
  expr = mann_whitney(a, b), setup = reference, options = mw,
  note = "No difference at all: every shuffle is as extreme, P = 1.")

fixture("mw-outlier", input = list(a = c(10.1, 9.8, 10.3, 9.9, 10.0), b = c(10.4, 10.2, 10.6, 10.5, 60)),
  expr = mann_whitney(a, b), setup = reference, options = mw, check = mw_check,
  note = "The outlier is just the highest rank: unlike the t test, the shift shows.")

fixture("mw-tiny-p", input = list(a = 1:40 / 10, b = 50 + 1:40 / 10),
  expr = mann_whitney(a, b, "pwilcox"), setup = reference, options = mw, check = mw_check,
  note = "Complete separation of 40 and 40: P = 2 / choose(80, 40), about 1e-23, keeps its magnitude.")

fixture("mw-ties-large",
  input = list(a = c(rep(1, 6), rep(2, 9), rep(3, 8), rep(4, 5), rep(5, 2)), b = c(rep(2, 4), rep(3, 7), rep(4, 9), rep(5, 8), rep(6, 4))),
  expr = mann_whitney_coin(a, b),
  setup = bquote({
    .(reference)
    # Too many shuffles to enumerate: the exact P is coin's.
    mann_whitney_coin <- function(a, b) {
      out <- mann_whitney(a, b, "normal")
      d <- data.frame(v = c(a, b), g = factor(rep(c("A", "B"), c(length(a), length(b)))))
      exact <- function(alt) pvalue(coin::wilcox_test(v ~ g, data = d, distribution = "exact", alternative = alt))[1]
      out$exact <- TRUE
      out$p_two <- exact("two.sided")
      out$p_one <- min(exact("less"), exact("greater"))
      out
    }
  }),
  packages = "coin", options = mw,
  note = "30 against 32 with heavy ties: the exact P is coin's (reference-only, so the parity test skips it).")

fixture("mw-approximate", input = list(a = round(qnorm(ppoints(110)), 1), b = round(qnorm(ppoints(120)) + 0.3, 1)),
  expr = mann_whitney(a, b, "normal"), setup = reference, options = mw,
  check = close(expected$p_two, wilcox.test(b, a, exact = FALSE, correct = TRUE)$p.value),
  note = "Smaller group over 100: Prism's normal approximation, tie-corrected, with continuity correction.")

# --- Wilcoxon matched pairs --------------------------------------------------------
fixture("wx-basic", input = list(a = c(24.1, 27.3, 31.2, 22.8, 29.5, 26.0, 25.4), b = c(28.3, 30.1, 33.7, 27.4, 30.0, 31.8, 24.9)),
  expr = wilcoxon(a, b), setup = reference, options = wx, check = wx_check)

fixture("wx-missing", input = list(a = c(24, 27, NA, 22, 29, 26, 30), b = c(28, 30, 33, 27, NA, 31, 35.5)),
  expr = wilcoxon(a, b), setup = reference, options = wx, check = wx_check,
  note = "A row missing on either side drops out of the pairing.")

fixture("wx-n-2", input = list(a = c(10, 12), b = c(13, 16)),
  expr = wilcoxon(a, b), setup = reference, options = wx,
  note = "Two pairs: the smallest P possible is 0.5.")

fixture("wx-ties", input = list(a = c(3, 3, 4, 4, 5, 5, 6, 2), b = c(4, 5, 4.5, 6, 6, 7, 7, 3)),
  expr = wilcoxon(a, b), setup = reference, options = wx,
  check = wx_coin_wilcoxon, check_packages = "coin",
  note = "Tied differences: exact P with midranks.")

fixture("wx-zeros", input = list(a = c(5, 6, 7, 8, 9, 10, 11), b = c(5, 7, 9, 8, 12, 13, 10)),
  expr = wilcoxon(a, b), setup = reference, options = wx,
  check = wx_coin_wilcoxon, check_packages = "coin",
  note = "Two pairs with no difference: dropped (Wilcoxon's method, Prism's default).")

fixture("wx-zeros-pratt", input = list(a = c(5, 6, 7, 8, 9, 10, 11), b = c(5, 7, 9, 8, 12, 13, 10)),
  expr = wilcoxon(a, b, pratt = TRUE), setup = reference, options = pratt,
  check = wx_coin_pratt, check_packages = "coin",
  note = "The same data by Pratt's method: zeros are ranked, then count for neither side.")

fixture("wx-near-ties", input = list(a = c(1.2, 2.3, 3.4, 0.5, 5.1, 4.4), b = c(1.3, 2.4, 3.5, 0.9, 5.9, 4.1)),
  expr = wilcoxon(a, b), setup = reference, options = wx,
  check = wx_coin_wilcoxon, check_packages = "coin",
  note = "B - A is 0.1 in three rows, but not in binary (0.10000000000000009, 0.09999999999999964): they must tie, as in Prism (FAQ 2020).")

fixture("wx-outlier", input = list(a = c(8.1, 7.9, 8.4, 8.0, 8.2, 7.7), b = c(8.6, 8.3, 8.9, 8.5, 30.0, 7.6)),
  expr = wilcoxon(a, b), setup = reference, options = wx, check = wx_check)

fixture("wx-negative-pairing", input = list(a = c(1, 2, 3, 4, 5, 6), b = c(9.1, 8.5, 8.0, 7.2, 6.9, 6.1)),
  expr = wilcoxon(a, b), setup = reference, options = wx, check = wx_check,
  note = "Pairing not effective: Spearman r = -1, one-tailed P = 1.")

fixture("wx-tiny-p", input = list(a = 1:40, b = 100 + (1:40 * 17) %% 41 + (1:40) / 1000),
  expr = wilcoxon(a, b, how = "psignrank"), setup = reference, options = wx, check = wx_check,
  note = "Every one of 40 differences positive and distinct: P = 2 / 2^40, about 1.8e-12.")

fixture("wx-approximate", input = list(a = rep(0, 220), b = round(qnorm(ppoints(220), 0.15), 1)),
  expr = wilcoxon(a, b, how = "normal"), setup = reference, options = wx,
  check = close(expected$p_two, wilcox.test(round(qnorm(ppoints(220), 0.15), 1), exact = FALSE, correct = TRUE)$p.value),
  note = "200 pairs or more: normal approximation, continuity correction 0.5 (Prism, FAQ 332).")
