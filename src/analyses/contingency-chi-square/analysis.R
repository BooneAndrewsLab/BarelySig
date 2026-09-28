# Chi-square test of independence on a Contingency table (item 28, #39).
# `chisq.test` is base R; `correct = TRUE` is Prism's own default (Yates'
# continuity correction, which R applies only to a 2x2 table -- silently
# ignored for a larger one). counts is the row-major flattening of the
# r x c count grid; nrow/ncol rebuild the matrix R needs.
bs_contingency_chi_square <- function(counts, nrow, ncol) {
  m <- matrix(counts, nrow = nrow, ncol = ncol, byrow = TRUE)
  t <- chisq.test(m, correct = TRUE)
  list(
    chi_sq = unname(t$statistic),
    df = unname(t$parameter),
    p = t$p.value,
    corrected = isTRUE(nrow == 2 && ncol == 2),
    low_expected = any(t$expected < 5),
    n = sum(m)
  )
}
