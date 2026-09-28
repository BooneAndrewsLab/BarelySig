# Pearson or Spearman correlation of an XY table's Y data sets against
# its shared X (item 29, #38). Both are `cor.test()`, base R.
#
# Spearman with ties: R's own `cor.test` can only give an *exact* P when
# there are no ties and n < 1290; otherwise it falls back to an
# asymptotic t approximation (its own warning, "Cannot compute exact
# p-value with ties"). Ties are detected directly here, rather than by
# parsing that warning, so `exact` is always known even when R happens
# not to warn (e.g. large n with no ties).

bs_correlation_one <- function(x, y, method) {
  n <- length(x)
  if (n < 3) return(list(n = n, ran = FALSE, why = "few", minimum = 3))
  if (sd(x) == 0 || sd(y) == 0) return(list(n = n, ran = FALSE, why = "constant"))
  if (method == "pearson") {
    t <- cor.test(x, y, method = "pearson")
    ci <- t$conf.int
    list(
      n = n, ran = TRUE,
      r = unname(t$estimate), lower = unname(ci[1]), upper = unname(ci[2]),
      statistic = unname(t$statistic), df = unname(t$parameter), p = t$p.value
    )
  } else {
    ties <- anyDuplicated(x) > 0 || anyDuplicated(y) > 0
    exact <- !ties && n < 1290
    t <- suppressWarnings(cor.test(x, y, method = "spearman", exact = exact))
    list(
      n = n, ran = TRUE,
      r = unname(t$estimate), lower = NA_real_, upper = NA_real_,
      statistic = unname(t$statistic), df = NA_real_, p = t$p.value,
      exact = exact, ties = ties
    )
  }
}

# x, y: every series' points, concatenated; g: each point's series (1..k).
bs_correlation <- function(x, y, g, k, method) {
  list(series = lapply(seq_len(k), function(i) bs_correlation_one(x[g == i], y[g == i], method)))
}
