# Fisher's exact test on a Contingency table (item 28, #39). `fisher.test`
# is base R and already generalizes to r x c via a network algorithm; for
# a 2x2 table it also gives an odds ratio and its confidence interval,
# which R has none of for a larger table (t$estimate/t$conf.int are NULL).
bs_contingency_fisher <- function(counts, nrow, ncol) {
  m <- matrix(counts, nrow = nrow, ncol = ncol, byrow = TRUE)
  t <- fisher.test(m)
  list(
    p = t$p.value,
    n = sum(m),
    odds_ratio = if (is.null(t$estimate)) NA_real_ else unname(t$estimate),
    or_lower = if (is.null(t$conf.int)) NA_real_ else t$conf.int[1],
    or_upper = if (is.null(t$conf.int)) NA_real_ else t$conf.int[2]
  )
}
