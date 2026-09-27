# Two-way ANOVA with multiple comparisons (item 06, #27), reported as Prism
# does: Type III sums of squares from a regression with sum-to-zero
# contrasts (Glantz and Slinker), each term's columns dropped in turn.
# The full model has the interaction; with one value per cell (no
# replicates) or an empty cell, main effects only, as Prism. Comparisons
# use the fitted model's residual MS and DF, one family per row or column
# (Prism's default), and the one-way code for the tests themselves
# (bs_comparisons, loaded with this file). Mean diff = first - second.
# `stop("bs: ...")` messages are shown to the user as written.

# y: the values; ri, ci: each value's row and column (1..R, 1..C).
bs_twoway <- function(y, ri, ci, R, C, family, comps, control, test) {
  if (R < 2 || C < 2) stop("bs: Two-way ANOVA needs at least two rows and two data sets.")
  N <- length(y)
  rf <- factor(ri, levels = seq_len(R))
  cf <- factor(ci, levels = seq_len(C))
  # Unnamed: a named number would come back from WebR as an object.
  n <- unname(unclass(table(rf, cf)))
  if (any(rowSums(n) == 0) || any(colSums(n) == 0)) stop("bs: Every row and every data set needs at least one value.")
  empty <- any(n == 0)
  replicates <- any(n > 1)
  full <- !empty && replicates
  why <- if (empty) "empty-cell" else if (!replicates) "no-replicates" else NA_character_
  x <- model.matrix(if (full) ~ rf * cf else ~ rf + cf, contrasts.arg = list(rf = "contr.sum", cf = "contr.sum"))
  assign <- attr(x, "assign")
  qx <- qr(x)
  if (qx$rank < ncol(x)) {
    stop("bs: The empty cells leave the row and column effects tangled together, so ANOVA can't tell them apart. Fill in more cells.")
  }
  rss <- function(keep) sum(qr.resid(qr(x[, keep, drop = FALSE]), y)^2)
  rss_full <- rss(rep(TRUE, ncol(x)))
  df_res <- N - qx$rank
  if (df_res < 1) stop("bs: There are no values left over to estimate the scatter, so ANOVA can't be computed.")
  if (rss_full == 0) {
    stop("bs: The model fits every value exactly (no scatter left), so ANOVA can't be computed.")
  }
  ms_res <- rss_full / df_res
  ss_total <- sum((y - mean(y))^2)
  fitted_full <- qr.fitted(qx, y)
  term <- function(t) {
    keep <- assign != t
    # The distance between the two fits: the same as the difference of their
    # residual SS, but never below zero from rounding.
    ss <- sum((fitted_full - qr.fitted(qr(x[, keep, drop = FALSE]), y))^2)
    df <- sum(!keep)
    f <- (ss / df) / ms_res
    list(ss = ss, df = df, ms = ss / df, f = f, p = pf(f, df, df_res, lower.tail = FALSE), percent = 100 * ss / ss_total)
  }
  cell_mean <- matrix(NA_real_, R, C)
  cell_sd <- matrix(NA_real_, R, C)
  for (r in seq_len(R)) {
    for (c in seq_len(C)) {
      v <- y[ri == r & ci == c]
      if (length(v)) cell_mean[r, c] <- mean(v)
      if (length(v) > 1) cell_sd[r, c] <- sd(v)
    }
  }
  out <- list(
    model = if (full) "full" else "main-effects", why = why, rows = R, columns = C, n_total = N,
    interaction = if (full) term(3) else NA,
    row = term(1), column = term(2),
    residual = list(ss = rss_full, df = df_res, ms = ms_res),
    total = list(ss = ss_total, df = N - 1),
    cells = lapply(seq_len(R), function(r) {
      lapply(seq_len(C), function(c) list(n = n[r, c], mean = cell_mean[r, c], sd = cell_sd[r, c]))
    }),
    # Exact: from real (or reconstructed-from-summary) individual values.
    approximate = FALSE
  )
  out$comparisons <- list()
  out$comparisons_note <- NA_character_
  if (comps != "none") {
    simple <- family %in% c("within-rows", "within-columns", "all-cells")
    if (empty) {
      out$comparisons_note <- "empty-cell"
    } else if (simple && !full) {
      out$comparisons_note <- "no-replicates"
    } else {
      out$comparisons <- bs_twoway_comparisons(cell_mean, n, ms_res, df_res, family, comps, control, test)
    }
  }
  out
}

# Each family's means are independent (different cells, or averages of
# different cells), with variance MS(residual) * w; the one-way code takes
# them as groups of "size" 1 / w.
bs_twoway_comparisons <- function(m, n, mse, df, family, comps, control, test) {
  R <- nrow(m)
  C <- ncol(m)
  fam <- function(means, sizes, index) {
    lapply(bs_comparisons(means, rep(0, length(means)), sizes, mse, df, FALSE, comps, control, test), function(x) {
      c(list(family = index), x)
    })
  }
  switch(family,
    "within-rows" = do.call(c, lapply(seq_len(R), function(r) fam(m[r, ], n[r, ], r))),
    "within-columns" = do.call(c, lapply(seq_len(C), function(c) fam(m[, c], n[, c], c))),
    # Least-squares means: the unweighted mean of the cell means.
    "main-columns" = fam(colMeans(m), 1 / (colSums(1 / n) / R^2), 1),
    "main-rows" = fam(rowMeans(m), 1 / (rowSums(1 / n) / C^2), 1),
    # Cells in reading order: row by row, the columns within each.
    "all-cells" = fam(as.vector(t(m)), as.vector(t(n)), 1),
    stop("bs: Unknown family of comparisons.")
  )
}

# From summary data (mean, SD and n per cell). Balanced (every n the
# same): reconstruct values with exactly each cell's mean, SD and n and
# run the exact regression above (the ANOVA and every comparison depend on
# nothing else, for any n). Unbalanced: Prism's own summary-data method is
# approximate (Fisher and van Belle, 1993; item 18, #51) instead, below.
bs_twoway_summary <- function(means, sds, ns, ri, ci, R, C, family, comps, control, test) {
  if (any(is.na(c(means, sds, ns)))) stop("bs: Two-way ANOVA from summary data needs the mean, SD and n of every cell.")
  if (any(ns != round(ns)) || any(ns < 1)) stop("bs: n must be a whole number of at least 1.")
  if (any(sds < 0)) stop("bs: An SD can't be negative.")
  if (length(unique(ns)) > 1) {
    return(bs_twoway_unweighted(means, sds, ns, ri, ci, R, C, family, comps, control, test))
  }
  y <- numeric(0)
  rr <- numeric(0)
  cc <- numeric(0)
  for (i in seq_along(means)) {
    v <- if (ns[i] == 1) means[i] else as.numeric(scale(seq_len(ns[i]))) * sds[i] + means[i]
    y <- c(y, v)
    rr <- c(rr, rep(ri[i], ns[i]))
    cc <- c(cc, rep(ci[i], ns[i]))
  }
  bs_twoway(y, rr, cc, R, C, family, comps, control, test)
}

# Prism's "analysis of unweighted means" (Fisher and van Belle, 1993) for
# summary data with unequal n: exact for the residual, cell table and
# comparisons (which never depended on balance), approximate for the row,
# column and interaction terms (design note 18). Reduces to the exact
# balanced formulas when every n is the same.
bs_twoway_unweighted <- function(means, sds, ns, ri, ci, R, C, family, comps, control, test) {
  if (length(means) != R * C) stop("bs: Two-way ANOVA from summary data needs every cell filled in.")
  m <- matrix(NA_real_, R, C)
  s <- matrix(NA_real_, R, C)
  n <- matrix(NA_real_, R, C)
  for (i in seq_along(means)) {
    m[ri[i], ci[i]] <- means[i]
    s[ri[i], ci[i]] <- sds[i]
    n[ri[i], ci[i]] <- ns[i]
  }
  N <- sum(n)
  df_res <- N - R * C
  if (df_res < 1) stop("bs: There are no values left over to estimate the scatter, so ANOVA can't be computed.")
  ss_res <- sum((n - 1) * s^2)
  if (ss_res == 0) stop("bs: The model fits every value exactly (no scatter left), so ANOVA can't be computed.")
  ms_res <- ss_res / df_res
  nh <- (R * C) / sum(1 / n)
  grand <- mean(m)
  row_mean <- rowMeans(m)
  col_mean <- colMeans(m)
  ss_row <- C * nh * sum((row_mean - grand)^2)
  ss_col <- R * nh * sum((col_mean - grand)^2)
  int_resid <- m - outer(row_mean, col_mean, "+") + grand
  ss_int <- nh * sum(int_resid^2)
  ss_total <- ss_row + ss_col + ss_int + ss_res
  term <- function(ss, df) {
    ms <- ss / df
    f <- ms / ms_res
    list(ss = ss, df = df, ms = ms, f = f, p = pf(f, df, df_res, lower.tail = FALSE), percent = 100 * ss / ss_total)
  }
  out <- list(
    model = "full", why = NA_character_, rows = R, columns = C, n_total = N,
    interaction = term(ss_int, (R - 1) * (C - 1)),
    row = term(ss_row, R - 1), column = term(ss_col, C - 1),
    residual = list(ss = ss_res, df = df_res, ms = ms_res),
    total = list(ss = ss_total, df = N - 1),
    cells = lapply(seq_len(R), function(r) {
      lapply(seq_len(C), function(c) list(n = n[r, c], mean = m[r, c], sd = s[r, c]))
    }),
    approximate = TRUE
  )
  out$comparisons <- list()
  out$comparisons_note <- NA_character_
  if (comps != "none") {
    out$comparisons <- bs_twoway_comparisons(m, n, ms_res, df_res, family, comps, control, test)
  }
  out
}
