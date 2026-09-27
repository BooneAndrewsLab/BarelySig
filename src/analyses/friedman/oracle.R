# Fixtures for the Friedman test and Dunn's comparisons (item 17, #50).
# The statistic, df and P are R's own stats::friedman.test (independent
# of the app's rewritten formula, checked against it here); Dunn's z is
# the textbook formula (Daniel, Applied Nonparametric Statistics, 2nd
# ed., pp. 240-241 -- the same source note 06 cites for the
# Kruskal-Wallis version), written out independently rather than shared
# with analysis.R.
#
# Exact P for small tables (#82, note 17): no reference package computes
# it (`coin::friedman_test(..., distribution = "exact")` refuses
# anything but a two-sample problem, checked directly against it below),
# so it is counted by literal brute force -- every row's own k!
# permutations, multiplied out across every row with no shortcut at all
# -- independent of the app's own row-by-row convolution
# (`bs_friedman_exact`, analysis.R). Feasible here because every exact
# fixture keeps (treatments!)^subjects within a few million: fixtures
# whose size was chosen before this rule existed (`basic`, `uncorrected`,
# `capped`) are shrunk from 6 to 4 subjects so brute force stays fast to
# generate; `ties`, `dropped-row` and `n-2` were already small enough.
# `exact-boundary` and `approx-boundary` sit right either side of
# Prism's own (treatments!)^subjects <= 1e9 threshold with the fewest
# subjects the test can run on (two), so brute force there is one
# 25-million-row enumeration (`exact-boundary`, seconds) or, past the
# threshold, none at all (`approx-boundary`, the chi-square path).

reference <- quote({
  # Columns g1..gk, NA for an empty cell; a row with any NA drops out of
  # every group (item 17's pairing rule read across N).
  complete_rows <- function(...) {
    m <- do.call(cbind, list(...))
    m[stats::complete.cases(m), , drop = FALSE]
  }

  # All k! permutations of 1:k, one per row (base R only, matching
  # analysis.R's own generator but written out separately here).
  permutations_of <- function(k) {
    if (k == 1L) return(matrix(1L, 1L, 1L))
    sub <- permutations_of(k - 1L)
    do.call(rbind, lapply(seq_len(k), function(i) {
      shifted <- sub
      shifted[shifted >= i] <- shifted[shifted >= i] + 1L
      cbind(i, shifted)
    }))
  }

  # One row's own ranks, reassigned across the k columns by each of its
  # k! permutations (a matrix, one assignment per row).
  row_assignments <- function(row, perms) t(apply(perms, 1, function(idx) row[idx]))

  # Literal brute force: the full Cartesian product of every row's own
  # permutations (no convolution, no shortcut), the fraction whose sum of
  # squared column rank sums is at least the observed value -- exactly
  # what "exact P" means, counted the most literal way possible.
  friedman_p_brute <- function(m) {
    n <- nrow(m)
    k <- ncol(m)
    ranks <- t(apply(m, 1, rank))
    perms <- permutations_of(k)
    assigned <- lapply(seq_len(n), function(i) row_assignments(ranks[i, ], perms))
    grid <- expand.grid(rep(list(seq_len(nrow(perms))), n))
    total <- matrix(0, nrow(grid), k)
    for (i in seq_len(n)) total <- total + assigned[[i]][grid[[i]], , drop = FALSE]
    stat <- rowSums(total^2)
    stat_obs <- sum(colSums(ranks)^2)
    mean(stat >= stat_obs - 1e-9)
  }

  friedman <- function(m, comps = "all", control = 1, corrected = TRUE, exact = FALSE) {
    n <- nrow(m)
    k <- ncol(m)
    ft <- friedman.test(m)
    r <- t(apply(m, 1, rank))
    rank_sum <- colSums(r)
    mean_rank <- rank_sum / n
    out <- list(
      k = k, n = n, statistic = unname(ft$statistic), df = unname(ft$parameter),
      p = if (exact) friedman_p_brute(m) else ft$p.value, exact = exact,
      groups = lapply(seq_len(k), function(j) list(rank_sum = rank_sum[j], mean_rank = mean_rank[j]))
    )
    out$comparisons <- if (comps == "none") list() else {
      pairs <- unname(if (comps == "all") {
        do.call(rbind, lapply(seq_len(k - 1), function(i) cbind(i, (i + 1):k)))
      } else {
        cbind(control, seq_len(k)[-control])
      })
      K <- nrow(pairs)
      se <- sqrt(k * (k + 1) / (6 * n))
      lapply(seq_len(K), function(x) {
        i <- pairs[x, 1]
        j <- pairs[x, 2]
        d <- mean_rank[i] - mean_rank[j]
        z <- abs(d) / se
        p <- 2 * pnorm(z, lower.tail = FALSE)
        list(i = i, j = j, diff = d, z = z, p_unadjusted = p, p = if (corrected) min(1, K * p) else p)
      })
    }
    out
  }
})

all_pairs <- list(comparisons = "all", corrected = TRUE)

fixture("basic",
  input = list(g1 = c(4.2, 3.1, 5.0, 2.8), g2 = c(5.1, 4.0, 5.8, 3.6), g3 = c(3.8, 2.9, 4.4, 2.5), g4 = c(6.0, 5.2, 6.6, 4.8)),
  expr = friedman(complete_rows(g1, g2, g3, g4), exact = TRUE), setup = reference, options = all_pairs,
  note = "4 treatments x 4 subjects, no ties: 24^4 = 331,776 reassignments, exact.")

fixture("ties",
  input = list(g1 = c(2, 3, 2, 4, 3), g2 = c(3, 3, 2, 5, 4), g3 = c(2, 4, 3, 4, 3)),
  expr = friedman(complete_rows(g1, g2, g3), exact = TRUE), setup = reference, options = all_pairs,
  note = "3 treatments x 5 subjects, ties within several rows: exact, conditional on the ties.")

fixture("dropped-row",
  input = list(g1 = c(5.0, 4.2, NA, 3.8, 4.9, 4.4), g2 = c(6.1, 5.0, 6.8, NA, 5.9, 5.3), g3 = c(4.8, 4.0, 5.5, 3.2, 4.6, 4.1)),
  expr = friedman(complete_rows(g1, g2, g3), exact = TRUE), setup = reference, options = all_pairs,
  note = "Two rows each missing a different group's value: both drop out entirely, leaving 4 (3^4 = 1,296, exact).")

fixture("control",
  input = list(g1 = c(10.2, 9.8, 10.5, 9.5, 10.0, 10.3, 9.7), g2 = c(11.5, 11.0, 11.8, 10.6, 11.2, 11.6, 10.9), g3 = c(10.4, 9.9, 10.7, 9.6, 10.1, 10.5, 9.8), g4 = c(12.1, 11.6, 12.5, 11.2, 11.9, 12.2, 11.5)),
  expr = friedman(complete_rows(g1, g2, g3, g4), comps = "control", control = 1), setup = reference,
  options = list(comparisons = "control", control = 1, corrected = TRUE),
  note = "4 treatments x 7 subjects: 24^7 > 1e9, past the threshold, so still approximate. Against a control: three comparisons, each P multiplied by 3.")

fixture("uncorrected",
  input = list(g1 = c(4.2, 3.1, 5.0, 2.8), g2 = c(5.1, 4.0, 5.8, 3.6), g3 = c(3.8, 2.9, 4.4, 2.5), g4 = c(6.0, 5.2, 6.6, 4.8)),
  expr = friedman(complete_rows(g1, g2, g3, g4), corrected = FALSE, exact = TRUE), setup = reference,
  options = list(comparisons = "all", corrected = FALSE),
  note = "Uncorrected Dunn's test: each P on its own. Same size as `basic`, exact.")

fixture("capped",
  input = list(g1 = c(1, 4, 2, 5), g2 = c(1.1, 4.1, 2.1, 5.1), g3 = c(1.2, 4.2, 2.2, 5.2), g4 = c(10, 40, 20, 50)),
  expr = friedman(complete_rows(g1, g2, g3, g4), exact = TRUE), setup = reference, options = all_pairs,
  note = "Six comparisons: a P above 1/6 is capped at 1 (Prism shows > 0.9999). Exact (24^4).")

fixture("n-2",
  input = list(g1 = c(3, 8), g2 = c(5, 6), g3 = c(7, 4)),
  expr = friedman(complete_rows(g1, g2, g3), exact = TRUE), setup = reference, options = all_pairs,
  note = "The fewest rows the test can run on: two. Exact (3^2 = 36).")

fixture("tiny-p",
  input = list(g1 = 1:9, g2 = 11:19, g3 = 21:29, g4 = 31:39),
  expr = friedman(complete_rows(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  note = "Complete agreement, every row: 24^9 is far past the threshold, so still approximate; P near its smallest possible value.")

fixture("five-groups",
  input = list(g1 = c(2.1, 3.4, 1.9, 2.8, 3.0, 2.5, 3.3, 2.2), g2 = c(3.0, 4.1, 2.6, 3.5, 3.8, 3.1, 4.0, 2.9), g3 = c(1.8, 3.0, 1.5, 2.4, 2.6, 2.1, 2.9, 1.9), g4 = c(4.2, 5.0, 3.8, 4.6, 4.9, 4.3, 5.1, 4.0), g5 = c(2.5, 3.6, 2.0, 3.0, 3.2, 2.7, 3.5, 2.4)),
  expr = friedman(complete_rows(g1, g2, g3, g4, g5)), setup = reference, options = all_pairs,
  note = "Five treatments x 8 subjects: ten comparisons, far past the threshold, approximate.")

fixture("exact-tiny-p",
  input = list(g1 = 1:4, g2 = 11:14, g3 = 21:24, g4 = 31:34),
  expr = friedman(complete_rows(g1, g2, g3, g4), exact = TRUE), setup = reference, options = all_pairs,
  note = "Complete agreement, every row, at a size small enough to stay exact (24^4): the smallest possible P at this size, not chi-square's asymptotic tail.")

fixture("exact-boundary",
  input = list(g1 = c(3, 2), g2 = c(1, 5), g3 = c(5, 1), g4 = c(2, 6), g5 = c(7, 3), g6 = c(4, 7), g7 = c(6, 4)),
  expr = friedman(complete_rows(g1, g2, g3, g4, g5, g6, g7), exact = TRUE), setup = reference, options = all_pairs,
  parity = FALSE,
  note = "7 treatments x 2 subjects (the fewest rows the test runs on): 5040^2 ~ 2.5e7, comfortably at or below Prism's 1e9 threshold, so exact -- the worst corner for the app's own convolution (few subjects, many treatments), timed at a few seconds in note 17. Brute force here is a 25-million-row enumeration, slow to rerun in WebR (note 07), so the app's own test still runs it there; the parity test does not.")

fixture("approx-boundary",
  input = list(g1 = c(3, 2), g2 = c(1, 5), g3 = c(5, 1), g4 = c(2, 6), g5 = c(7, 3), g6 = c(4, 7), g7 = c(6, 4), g8 = c(8, 8)),
  expr = friedman(complete_rows(g1, g2, g3, g4, g5, g6, g7, g8)), setup = reference,
  options = all_pairs,
  note = "8 treatments x 2 subjects: 40320^2 ~ 1.6e9, just past the threshold, so the fallback triggers and it stays approximate.")
