# Repeated-measures two-way ANOVA, both factors repeated (item 23, #84):
# a Grouped table, subcolumn position is the subject, every subject
# measured at every row x column cell -- no between-subjects factor at
# all (unlike repeatedTwoway/analysis.R's split-plot case, #81). Three
# within-subject terms (row, column, interaction), each tested against
# its own error stratum and given its own Greenhouse-Geisser/Huynh-Feldt
# correction from base R's `stats:::sphericity()` -- called once per
# term with that term's own contrast (`M`/`X` formulas over `idata`,
# the same mechanism `anova.mlm`'s `idesign` support uses internally),
# confirmed distinct per term against `car::Anova(idata=, idesign=~r*c)`
# in throwaway R (design note 23) -- unlike the split-plot case, which
# shares one epsilon between its two within-subject terms. `stop("bs:
# ...")` messages are shown to the user as written.

# y: subject-major, length n*p*q. Within one subject's block of p*q
# values, row-major (row i's q values before row i+1's) -- matches
# `idata`'s column order below.
bs_repeated_twoway_both <- function(y, n, p, q) {
  if (p < 2 || q < 2) {
    stop("bs: Repeated-measures two-way ANOVA needs at least two levels of each factor.")
  }
  if (n < 2) {
    stop("bs: Repeated-measures two-way ANOVA needs at least two subjects.")
  }
  Ywide <- matrix(y, nrow = n, ncol = p * q, byrow = TRUE)
  Y <- array(0, dim = c(n, p, q))
  for (i in seq_len(p)) for (j in seq_len(q)) Y[, i, j] <- Ywide[, (i - 1) * q + j]

  grand <- mean(Y)
  Mk <- apply(Y, 1, mean) # subject means, length n
  Ri <- apply(Y, 2, mean) # row means, length p
  Cj <- apply(Y, 3, mean) # column means, length q
  Xij <- apply(Y, c(2, 3), mean) # cell means, p x q
  Yik <- apply(Y, c(1, 2), mean) # subject x row (mean over columns), n x p
  Yjk <- apply(Y, c(1, 3), mean) # subject x column (mean over rows), n x q

  ss_total <- sum((Y - grand)^2)
  ss_subjects <- p * q * sum((Mk - grand)^2)
  df_subjects <- n - 1

  ss_row <- q * n * sum((Ri - grand)^2)
  df_row <- p - 1
  row_dev <- sweep(sweep(Yik, 2, Ri, "-"), 1, Mk, "-") + grand
  ss_row_err <- q * sum(row_dev^2)
  df_row_err <- df_row * df_subjects
  if (ss_row_err <= 0) {
    stop("bs: Every subject's row means move together perfectly, so there is no residual scatter left to compare the row factor with; ANOVA can't be computed.")
  }

  ss_col <- p * n * sum((Cj - grand)^2)
  df_col <- q - 1
  col_dev <- sweep(sweep(Yjk, 2, Cj, "-"), 1, Mk, "-") + grand
  ss_col_err <- p * sum(col_dev^2)
  df_col_err <- df_col * df_subjects
  if (ss_col_err <= 0) {
    stop("bs: Every subject's column means move together perfectly, so there is no residual scatter left to compare the column factor with; ANOVA can't be computed.")
  }

  ss_inter <- n * sum((sweep(sweep(Xij, 1, Ri, "-"), 2, Cj, "-") + grand)^2)
  df_inter <- df_row * df_col
  inter_dev <- array(0, dim = c(n, p, q))
  for (i in seq_len(p)) {
    for (j in seq_len(q)) {
      inter_dev[, i, j] <- Y[, i, j] - Xij[i, j] - Yik[, i] - Yjk[, j] + Mk + Ri[i] + Cj[j] - grand
    }
  }
  ss_inter_err <- sum(inter_dev^2)
  df_inter_err <- df_inter * df_subjects
  if (ss_inter_err <= 0) {
    stop("bs: Every subject's cell values move together perfectly, so there is no residual scatter left to compare the interaction with; ANOVA can't be computed.")
  }

  ms_row <- ss_row / df_row
  ms_row_err <- ss_row_err / df_row_err
  f_row <- ms_row / ms_row_err
  p_row <- pf(f_row, df_row, df_row_err, lower.tail = FALSE)

  ms_col <- ss_col / df_col
  ms_col_err <- ss_col_err / df_col_err
  f_col <- ms_col / ms_col_err
  p_col <- pf(f_col, df_col, df_col_err, lower.tail = FALSE)

  ms_inter <- ss_inter / df_inter
  ms_inter_err <- ss_inter_err / df_inter_err
  f_inter <- ms_inter / ms_inter_err
  p_inter <- pf(f_inter, df_inter, df_inter_err, lower.tail = FALSE)

  # Per-term epsilon: `idata` mirrors Ywide's column order (row varies
  # slower, column faster within a row's block); `sphericity()`'s
  # `M`/`X` formulas over it isolate one term's own contrast, the same
  # mechanism `anova.mlm`'s `idesign` support uses per term internally
  # (design note 23). NaN (0/0, when a term's own contrast dimension
  # equals the residual df) falls back to 1, same reasoning as the
  # q = 2 fallback in repeatedTwoway/analysis.R.
  idata <- data.frame(row = factor(rep(seq_len(p), each = q)), col = factor(rep(seq_len(q), p)))
  ssd <- stats::SSD(lm(Ywide ~ 1))
  clamp <- function(e, pp) if (is.nan(e)) 1 else max(1 / pp, min(1, e))
  # `pp`, each term's own contrast dimension, is exactly its own df
  # (df_row/df_col/df_inter above): no need to recompute it from the
  # contrast matrix `sphericity()` builds internally.
  eps <- function(M, X, pp) {
    sph <- stats:::sphericity(ssd, M = M, X = X, idata = idata)
    list(gg = clamp(sph$GG.eps, pp), hf = clamp(sph$HF.eps, pp))
  }
  row_eps <- eps(~row, ~1, df_row)
  col_eps <- eps(~col, ~1, df_col)
  inter_eps <- eps(~ row * col, ~ row + col, df_inter)

  list(
    p = p, q = q, n = n,
    subjects = list(ss = ss_subjects, df = df_subjects, ms = ss_subjects / df_subjects),
    row = list(ss = ss_row, df = df_row, ms = ms_row, f = f_row, p = p_row),
    row_error = list(
      ss = ss_row_err, df = df_row_err, ms = ms_row_err,
      gg_epsilon = row_eps$gg, hf_epsilon = row_eps$hf,
      gg_p = pf(f_row, df_row * row_eps$gg, df_row_err * row_eps$gg, lower.tail = FALSE),
      hf_p = pf(f_row, df_row * row_eps$hf, df_row_err * row_eps$hf, lower.tail = FALSE)
    ),
    column = list(ss = ss_col, df = df_col, ms = ms_col, f = f_col, p = p_col),
    column_error = list(
      ss = ss_col_err, df = df_col_err, ms = ms_col_err,
      gg_epsilon = col_eps$gg, hf_epsilon = col_eps$hf,
      gg_p = pf(f_col, df_col * col_eps$gg, df_col_err * col_eps$gg, lower.tail = FALSE),
      hf_p = pf(f_col, df_col * col_eps$hf, df_col_err * col_eps$hf, lower.tail = FALSE)
    ),
    interaction = list(ss = ss_inter, df = df_inter, ms = ms_inter, f = f_inter, p = p_inter),
    interaction_error = list(
      ss = ss_inter_err, df = df_inter_err, ms = ms_inter_err,
      gg_epsilon = inter_eps$gg, hf_epsilon = inter_eps$hf,
      gg_p = pf(f_inter, df_inter * inter_eps$gg, df_inter_err * inter_eps$gg, lower.tail = FALSE),
      hf_p = pf(f_inter, df_inter * inter_eps$hf, df_inter_err * inter_eps$hf, lower.tail = FALSE)
    ),
    total = list(ss = ss_total, df = p * q * n - 1)
  )
}
