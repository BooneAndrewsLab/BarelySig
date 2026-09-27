# Fixtures for the Friedman test and Dunn's comparisons (item 17, #50).
# The statistic, df and P are R's own stats::friedman.test (independent
# of the app's rewritten formula, checked against it here); Dunn's z is
# the textbook formula (Daniel, Applied Nonparametric Statistics, 2nd
# ed., pp. 240-241 -- the same source note 06 cites for the
# Kruskal-Wallis version), written out independently rather than shared
# with analysis.R. Exact P for small tables (#82, as Kruskal-Wallis's
# was split off before it was built, #49) is not computed here: every
# fixture is approximate.

reference <- quote({
  # Columns g1..gk, NA for an empty cell; a row with any NA drops out of
  # every group (item 17's pairing rule read across N).
  complete_rows <- function(...) {
    m <- do.call(cbind, list(...))
    m[stats::complete.cases(m), , drop = FALSE]
  }
  friedman <- function(m, comps = "all", control = 1, corrected = TRUE) {
    n <- nrow(m)
    k <- ncol(m)
    ft <- friedman.test(m)
    r <- t(apply(m, 1, rank))
    rank_sum <- colSums(r)
    mean_rank <- rank_sum / n
    out <- list(
      k = k, n = n, statistic = unname(ft$statistic), df = unname(ft$parameter), p = ft$p.value,
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
  input = list(g1 = c(4.2, 3.1, 5.0, 2.8, 4.5, 3.9), g2 = c(5.1, 4.0, 5.8, 3.6, 5.2, 4.7), g3 = c(3.8, 2.9, 4.4, 2.5, 3.9, 3.2), g4 = c(6.0, 5.2, 6.6, 4.8, 6.1, 5.5)),
  expr = friedman(complete_rows(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  note = "4 treatments x 6 subjects, no ties.")

fixture("ties",
  input = list(g1 = c(2, 3, 2, 4, 3), g2 = c(3, 3, 2, 5, 4), g3 = c(2, 4, 3, 4, 3)),
  expr = friedman(complete_rows(g1, g2, g3)), setup = reference, options = all_pairs,
  note = "3 treatments x 5 subjects, ties within several rows.")

fixture("dropped-row",
  input = list(g1 = c(5.0, 4.2, NA, 3.8, 4.9, 4.4), g2 = c(6.1, 5.0, 6.8, NA, 5.9, 5.3), g3 = c(4.8, 4.0, 5.5, 3.2, 4.6, 4.1)),
  expr = friedman(complete_rows(g1, g2, g3)), setup = reference, options = all_pairs,
  note = "Two rows each missing a different group's value: both drop out entirely, leaving 4.")

fixture("control",
  input = list(g1 = c(10.2, 9.8, 10.5, 9.5, 10.0, 10.3, 9.7), g2 = c(11.5, 11.0, 11.8, 10.6, 11.2, 11.6, 10.9), g3 = c(10.4, 9.9, 10.7, 9.6, 10.1, 10.5, 9.8), g4 = c(12.1, 11.6, 12.5, 11.2, 11.9, 12.2, 11.5)),
  expr = friedman(complete_rows(g1, g2, g3, g4), comps = "control", control = 1), setup = reference,
  options = list(comparisons = "control", control = 1, corrected = TRUE),
  note = "Against a control: three comparisons, each P multiplied by 3.")

fixture("uncorrected",
  input = list(g1 = c(4.2, 3.1, 5.0, 2.8, 4.5, 3.9), g2 = c(5.1, 4.0, 5.8, 3.6, 5.2, 4.7), g3 = c(3.8, 2.9, 4.4, 2.5, 3.9, 3.2), g4 = c(6.0, 5.2, 6.6, 4.8, 6.1, 5.5)),
  expr = friedman(complete_rows(g1, g2, g3, g4), corrected = FALSE), setup = reference,
  options = list(comparisons = "all", corrected = FALSE),
  note = "Uncorrected Dunn's test: each P on its own.")

fixture("capped",
  input = list(g1 = c(1, 4, 2, 5, 3, 6), g2 = c(1.1, 4.1, 2.1, 5.1, 3.1, 6.1), g3 = c(1.2, 4.2, 2.2, 5.2, 3.2, 6.2), g4 = c(10, 40, 20, 50, 30, 60)),
  expr = friedman(complete_rows(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  note = "Six comparisons: a P above 1/6 is capped at 1 (Prism shows > 0.9999).")

fixture("n-2",
  input = list(g1 = c(3, 8), g2 = c(5, 6), g3 = c(7, 4)),
  expr = friedman(complete_rows(g1, g2, g3)), setup = reference, options = all_pairs,
  note = "The fewest rows the test can run on: two.")

fixture("tiny-p",
  input = list(g1 = 1:9, g2 = 11:19, g3 = 21:29, g4 = 31:39),
  expr = friedman(complete_rows(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  note = "Complete agreement, every row: P near its smallest possible value.")

fixture("five-groups",
  input = list(g1 = c(2.1, 3.4, 1.9, 2.8, 3.0, 2.5, 3.3, 2.2), g2 = c(3.0, 4.1, 2.6, 3.5, 3.8, 3.1, 4.0, 2.9), g3 = c(1.8, 3.0, 1.5, 2.4, 2.6, 2.1, 2.9, 1.9), g4 = c(4.2, 5.0, 3.8, 4.6, 4.9, 4.3, 5.1, 4.0), g5 = c(2.5, 3.6, 2.0, 3.0, 3.2, 2.7, 3.5, 2.4)),
  expr = friedman(complete_rows(g1, g2, g3, g4, g5)), setup = reference, options = all_pairs,
  note = "Five treatments x 8 subjects: ten comparisons.")
