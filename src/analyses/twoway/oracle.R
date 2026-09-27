# Fixtures for two-way ANOVA and its multiple comparisons (#27, item 06).
# The reference is R's own: `drop1` on a linear model with sum-to-zero
# contrasts for the Type III table, emmeans (which WebR ships) for the
# least-squares means and every comparison but Dunnett's, whose
# probability is integrated as in the one-way oracle. Checks: car's
# Anova(type = 3), and emmeans' Dunnett ("mvt", randomised) to 1e-3.
# Summary-data cases are checked against raw values with that mean, SD
# and n. Input: the values `y` with their row `ri` and column `ci` (1-based).

reference <- quote({
  alpha <- 0.05
  # Dunnett's probability (shared control, correlations lam_i lam_j), over
  # the chi-square variable with a 12-node Gauss-Legendre rule.
  gauss <- local({
    i <- 1:11
    b <- i / sqrt(4 * i^2 - 1)
    e <- eigen(`[<-`(matrix(0, 12, 12), cbind(c(i, i + 1), c(i + 1, i)), c(b, b)), symmetric = TRUE)
    list(x = e$values, w = 2 * e$vectors[1, ]^2)
  })
  on_pieces <- function(br) {
    a <- head(br, -1); h <- diff(br) / 2
    list(x = as.vector(outer(gauss$x, h) + rep(a + h, each = 12)), w = as.vector(outer(gauss$w, h)))
  }
  dunnett <- function(c, lam, df) {
    sig <- sqrt(1 - lam^2)
    top <- qchisq(1e-16, df, lower.tail = FALSE)
    k <- df * (seq(0.5, 3 * sqrt(df) + 10, by = 0.5) / c)^2
    xn <- on_pieces(sort(unique(c(0, qchisq(c(1e-13, 1e-10, 1e-7, 1e-4, 0.01, 0.2, 0.5, 0.8, 0.99, 1 - 1e-7), df), k[k < top], top))))
    zt <- on_pieces(seq(-1, 1, length.out = 61))
    given_x <- vapply(xn$x, function(x) {
      s <- sqrt(x / df)
      reach <- (c * s + 9) / min(lam) + 2
      z <- reach * zt$x
      q <- pmin(pnorm(outer(z, lam, function(z, l) (-c * s - l * z)) / rep(sig, each = length(z))) +
        pnorm(outer(z, lam, function(z, l) (c * s - l * z)) / rep(sig, each = length(z)), lower.tail = FALSE), 1)
      reach * sum(zt$w * dnorm(z) * (1 - exp(rowSums(log1p(-q))))) + 2 * pnorm(-reach)
    }, 0)
    min(1, sum(xn$w * dchisq(xn$x, df) * given_x))
  }

  twoway <- function(y, r, c, family = "none", comps = "none", control = 1, test = "tukey") {
    keep <- !is.na(y)
    y <- y[keep]; r <- r[keep]; c <- c[keep]
    R <- max(r); C <- max(c)
    rf <- factor(r, levels = seq_len(R)); cf <- factor(c, levels = seq_len(C))
    n <- unclass(table(rf, cf))
    full <- all(n > 0) && any(n > 1)
    d <- data.frame(y = y, rf = rf, cf = cf)
    fit <- lm(if (full) y ~ rf * cf else y ~ rf + cf, data = d, contrasts = list(rf = "contr.sum", cf = "contr.sum"))
    tab <- drop1(fit, scope = if (full) ~ rf + cf + rf:cf else ~ rf + cf, test = "F")
    res <- data.frame(df = fit$df.residual, ss = sum(residuals(fit)^2))
    sst <- sum((y - mean(y))^2)
    term <- function(name) {
      ss <- tab[name, "Sum of Sq"]
      list(ss = ss, df = tab[name, "Df"], ms = ss / tab[name, "Df"], f = tab[name, "F value"], p = tab[name, "Pr(>F)"], percent = 100 * ss / sst)
    }
    out <- list(
      model = if (full) "full" else "main-effects",
      why = if (any(n == 0)) "empty-cell" else if (!any(n > 1)) "no-replicates" else NA,
      rows = R, columns = C, n_total = length(y),
      interaction = if (full) term("rf:cf") else NA,
      row = term("rf"), column = term("cf"),
      residual = list(ss = res$ss, df = res$df, ms = res$ss / res$df),
      total = list(ss = sst, df = length(y) - 1),
      cells = lapply(seq_len(R), function(i) lapply(seq_len(C), function(j) {
        v <- y[r == i & c == j]
        list(n = length(v), mean = if (length(v)) mean(v) else NA, sd = if (length(v) > 1) sd(v) else NA)
      })),
      approximate = FALSE
    )
    out$comparisons <- list()
    out$comparisons_note <- NA
    if (comps != "none") {
      if (any(n == 0)) out$comparisons_note <- "empty-cell"
      else if (family %in% c("within-rows", "within-columns", "all-cells") && !full) out$comparisons_note <- "no-replicates"
      else out$comparisons <- comparisons(fit, n, family, comps, control, test)
    }
    out
  }

  comparisons <- function(fit, n, family, comps, control, test) {
    spec <- switch(family, "within-rows" = ~ cf | rf, "within-columns" = ~ rf | cf, "main-columns" = ~ cf, "main-rows" = ~ rf, "all-cells" = ~ rf * cf)
    em <- suppressMessages(emmeans::emmeans(fit, spec))
    grid <- as.data.frame(em)
    by <- if (family == "within-rows") "rf" else if (family == "within-columns") "cf" else NULL
    level <- if (family %in% c("within-rows", "main-columns")) "cf" else if (family == "all-cells") NA else "rf"
    fams <- if (is.null(by)) list(grid) else split(grid, grid[[by]])
    df <- fit$df.residual
    do.call(c, lapply(seq_along(fams), function(fi) {
      g <- fams[[fi]]
      # Cells in reading order: row by row, the columns within each.
      if (family == "all-cells") g <- g[order(as.integer(g$rf), as.integer(g$cf)), ]
      k <- nrow(g)
      pairs <- if (comps == "all") do.call(rbind, lapply(seq_len(k - 1), function(i) cbind(i, (i + 1):k))) else cbind(control, seq_len(k)[-control])
      pairs <- unname(pairs)
      K <- nrow(pairs)
      m <- g$emmean
      se_m <- g$SE
      mse <- sum(residuals(fit)^2) / df
      lapply(seq_len(K), function(x) {
        i <- pairs[x, 1]; j <- pairs[x, 2]
        diff <- m[i] - m[j]
        se <- sqrt(se_m[i]^2 + se_m[j]^2)
        t <- abs(diff) / se
        r <- switch(test,
          tukey = {
            half <- qtukey(1 - alpha, k, df) / sqrt(2) * se
            list(stat = sqrt(2) * t, p = ptukey(sqrt(2) * t, k, df, lower.tail = FALSE), half = half)
          },
          bonferroni = list(stat = t, p = min(1, K * 2 * pt(t, df, lower.tail = FALSE)), half = qt(1 - alpha / (2 * K), df) * se),
          sidak = list(stat = t, p = 1 - exp(K * log1p(-2 * pt(t, df, lower.tail = FALSE))), half = qt(1 - (1 - (1 - alpha)^(1 / K)) / 2, df) * se),
          dunnett = {
            others <- pairs[, 2]
            lam <- sqrt(se_m[control]^2 / (se_m[others]^2 + se_m[control]^2))
            crit <- uniroot(function(cc) dunnett(cc, lam, df) - alpha, c(0.5, 50), tol = 1e-13)$root
            list(stat = t, p = dunnett(t, lam, df), half = crit * se)
          }
        )
        list(family = fi, i = i, j = j, diff = diff, se = se, df = df, statistic = r$stat,
             ci_lower = diff - r$half, ci_upper = diff + r$half, p = r$p)
      })
    }))
  }
  # Balanced summary data: raw values with exactly this mean, SD and n.
  from_summary <- function(means, sds, ns, r, c, ...) {
    raw <- function(m, s, k) if (k == 1) m else as.numeric(scale(seq_len(k))) * s + m
    y <- unlist(Map(raw, means, sds, ns))
    twoway(y, rep(r, ns), rep(c, ns), ...)
  }

  # Unbalanced summary data (#51, item 18): Prism's "analysis of unweighted
  # means" (Fisher and van Belle, 1993), written out directly from the
  # textbook (harmonic-mean-weighted row/column/interaction effects), not
  # from BarelySig's own analysis.R. Only the row, column and interaction
  # terms are this approximation; the residual, cell table and every
  # comparison are computed from the same reconstructed-raw-data + emmeans
  # machinery `from_summary`/`comparisons` already use for the exact case,
  # since those never depended on the design being balanced.
  unweighted_means <- function(means, sds, ns, r, c, family = "none", comps = "none", control = 1, test = "tukey") {
    R <- max(r)
    C <- max(c)
    m <- matrix(NA_real_, R, C)
    s <- matrix(NA_real_, R, C)
    n <- matrix(NA_real_, R, C)
    for (i in seq_along(means)) {
      m[r[i], c[i]] <- means[i]
      s[r[i], c[i]] <- sds[i]
      n[r[i], c[i]] <- ns[i]
    }
    N <- sum(n)
    df_res <- N - R * C
    ss_res <- sum((n - 1) * s^2)
    ms_res <- ss_res / df_res
    nh <- (R * C) / sum(1 / n)
    grand <- mean(m)
    row_mean <- rowMeans(m)
    col_mean <- colMeans(m)
    ss_row <- C * nh * sum((row_mean - grand)^2)
    ss_col <- R * nh * sum((col_mean - grand)^2)
    resid <- m - outer(row_mean, col_mean, "+") + grand
    ss_int <- nh * sum(resid^2)
    sst <- ss_row + ss_col + ss_int + ss_res
    term <- function(ss, df) {
      f <- (ss / df) / ms_res
      list(ss = ss, df = df, ms = ss / df, f = f, p = pf(f, df, df_res, lower.tail = FALSE), percent = 100 * ss / sst)
    }
    out <- list(
      model = "full", why = NA, rows = R, columns = C, n_total = N,
      interaction = term(ss_int, (R - 1) * (C - 1)),
      row = term(ss_row, R - 1), column = term(ss_col, C - 1),
      residual = list(ss = ss_res, df = df_res, ms = ms_res),
      total = list(ss = sst, df = N - 1),
      cells = lapply(seq_len(R), function(i) lapply(seq_len(C), function(j) list(n = n[i, j], mean = m[i, j], sd = s[i, j]))),
      approximate = TRUE
    )
    out$comparisons <- list()
    out$comparisons_note <- NA
    if (comps != "none") {
      raw <- function(mn, sd, k) if (k == 1) mn else as.numeric(scale(seq_len(k))) * sd + mn
      y <- unlist(Map(raw, means, sds, ns))
      d <- data.frame(y = y, rf = factor(rep(r, ns), levels = seq_len(R)), cf = factor(rep(c, ns), levels = seq_len(C)))
      fit <- lm(y ~ rf * cf, data = d, contrasts = list(rf = "contr.sum", cf = "contr.sum"))
      out$comparisons <- comparisons(fit, n, family, comps, control, test)
    }
    out
  }
})

close <- function(x, y, tol = 1e-9) isTRUE(all.equal(as.numeric(x), as.numeric(y), tolerance = tol))
car_check <- quote({
  keep <- !is.na(y)
  d <- data.frame(y = y[keep], rf = factor(ri[keep]), cf = factor(ci[keep]))
  full <- expected$model == "full"
  fit <- lm(if (full) y ~ rf * cf else y ~ rf + cf, data = d, contrasts = list(rf = "contr.sum", cf = "contr.sum"))
  a <- car::Anova(fit, type = 3)
  ok <- close(a["rf", "Sum Sq"], expected$row$ss) && close(a["cf", "Sum Sq"], expected$column$ss) &&
    close(a["rf", "Pr(>F)"], expected$row$p) && close(a["Residuals", "Sum Sq"], expected$residual$ss)
  if (full) ok <- ok && close(a["rf:cf", "Sum Sq"], expected$interaction$ss) && close(a["rf:cf", "Pr(>F)"], expected$interaction$p)
  ok
})
emmeans_check <- quote({
  # emmeans' own adjusted P values, where it computes the same test.
  keep <- !is.na(y)
  d <- data.frame(y = y[keep], rf = factor(ri[keep]), cf = factor(ci[keep]))
  fit <- lm(y ~ rf * cf, data = d, contrasts = list(rf = "contr.sum", cf = "contr.sum"))
  spec <- switch(family_, "within-rows" = pairwise ~ cf | rf, "within-columns" = pairwise ~ rf | cf, "main-columns" = pairwise ~ cf, "main-rows" = pairwise ~ rf)
  pc <- as.data.frame(suppressMessages(emmeans::emmeans(fit, spec, adjust = test_))$contrasts)
  close(sort(vapply(expected$comparisons, function(x) x$p, 0)), sort(pc$p.value), 1e-8)
})

# car always; emmeans too where it computes the same test.
both <- function(fam, test) bquote({
  family_ <- .(fam)
  test_ <- .(test)
  .(car_check) && .(emmeans_check)
})
check_rows_tukey <- both("within-rows", "tukey")
check_columns_tukey <- both("main-columns", "tukey")

cells <- function(...) {
  # Rows of cells, each a vector of replicates: y, r, c for the input.
  rows <- list(...)
  y <- numeric(0); r <- numeric(0); c <- numeric(0)
  for (i in seq_along(rows)) for (j in seq_along(rows[[i]])) {
    v <- rows[[i]][[j]]
    y <- c(y, v); r <- c(r, rep(i, length(v))); c <- c(c, rep(j, length(v)))
  }
  list(y = y, ri = r, ci = c)
}
opts <- function(family = "none", comps = "none", control = NULL, test = "tukey") {
  o <- list(family = family, comparisons = comps, test = test)
  if (!is.null(control)) o$control <- control
  o
}

fixture("balanced-within-rows",
  input = cells(list(c(4.2, 5.1, 3.9), c(6.1, 5.8, 6.4), c(4.9, 5.5, 5.2)), list(c(5.0, 5.6, 4.7), c(8.2, 7.9, 8.8), c(5.1, 4.8, 5.6))),
  expr = twoway(y, ri, ci, "within-rows", "all", test = "tukey"), setup = reference, packages = "emmeans",
  options = opts("within-rows", "all", test = "tukey"),
  check = check_rows_tukey, check_packages = "car",
  note = "2 rows x 3 columns, n = 3: Tukey within each row, one family per row.")

fixture("unbalanced-main-columns",
  input = cells(list(c(12.1, 13.4, 11.8), c(14.2, 15.1, 13.9, 16.0)), list(c(12.9, 13.8), c(14.4, 13.1, 12.7, 15.0, 14.1)), list(c(11.2, 12.0, 11.7, 12.5), c(13.3, 12.8))),
  expr = twoway(y, ri, ci, "main-columns", "all", test = "tukey"), setup = reference, packages = "emmeans",
  options = opts("main-columns", "all", test = "tukey"),
  check = check_columns_tukey, check_packages = "car",
  note = "Unbalanced: Type III sums of squares, which don't add up to the total; least-squares column means.")

fixture("missing",
  input = list(y = c(4.2, NA, 3.9, 6.1, 5.8, NA, 5.0, 5.6, 4.7, NA, 7.9, 8.8), ri = c(1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2), ci = c(1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 2)),
  expr = twoway(y, ri, ci, "within-columns", "all", test = "sidak"), setup = reference, packages = "emmeans",
  options = opts("within-columns", "all", test = "sidak"),
  check = car_check, check_packages = "car",
  note = "Empty cells within replicates drop out; they are not zeros.")

fixture("no-replicates",
  input = cells(list(10.1, 11.3, 12.0, 10.8), list(12.2, 13.1, 14.3, 12.9), list(9.8, 10.9, 11.7, 10.2)),
  expr = twoway(y, ri, ci, "main-rows", "all", test = "tukey"), setup = reference, packages = "emmeans",
  options = opts("main-rows", "all", test = "tukey"),
  check = car_check, check_packages = "car",
  note = "One value per cell: no interaction can be estimated, so main effects only (Prism).")

fixture("no-replicates-simple",
  input = cells(list(10.1, 11.3, 12.0), list(12.2, 13.1, 14.3)),
  expr = twoway(y, ri, ci, "within-rows", "all", test = "tukey"), setup = reference, packages = "emmeans",
  options = opts("within-rows", "all", test = "tukey"),
  note = "Simple effects need replicates (Prism 9 removed them too): the comparisons say so.")

fixture("empty-cell",
  input = cells(list(c(4.2, 5.1), c(6.1, 5.8), c(4.9, 5.5)), list(c(5.0, 5.6), numeric(0), c(5.1, 4.8))),
  expr = twoway(y, ri, ci, "main-columns", "all", test = "tukey"), setup = reference, packages = "emmeans",
  options = opts("main-columns", "all", test = "tukey"),
  check = car_check, check_packages = "car",
  note = "An empty cell: the full model can't be fitted, so main effects only (Prism); comparisons not available.")

fixture("all-cells-bonferroni",
  input = cells(list(c(4.2, 5.1, 3.9), c(6.1, 5.8, 6.4)), list(c(5.0, 5.6, 4.7), c(8.2, 7.9, 8.8))),
  expr = twoway(y, ri, ci, "all-cells", "all", test = "bonferroni"), setup = reference, packages = "emmeans",
  options = opts("all-cells", "all", test = "bonferroni"),
  check = car_check, check_packages = "car")

fixture("dunnett-main-columns",
  input = cells(list(c(10.2, 11.1, 9.8), c(11.8, 12.4, 11.1), c(10.8, 11.5, 10.3), c(13.1, 12.2, 13.8)), list(c(10.9, 10.1, 10.6), c(12.9, 12.0, 12.5), c(11.9, 10.6, 11.2), c(13.5, 12.7, 13.0))),
  expr = twoway(y, ri, ci, "main-columns", "control", control = 1, test = "dunnett"), setup = reference, packages = "emmeans",
  options = opts("main-columns", "control", 1, "dunnett"),
  check = car_check, check_packages = "car",
  note = "Each column's least-squares mean against the first column's, by Dunnett.")

fixture("dunnett-within-rows",
  input = cells(list(c(10.2, 11.1, 9.8), c(11.8, 12.4), c(10.8, 11.5, 10.3, 11.0)), list(c(10.9, 10.1, 10.6, 11.2), c(12.9, 12.0, 12.5), c(11.9, 10.6))),
  expr = twoway(y, ri, ci, "within-rows", "control", control = 2, test = "dunnett"), setup = reference, packages = "emmeans",
  options = opts("within-rows", "control", 2, "dunnett"),
  check = car_check, check_packages = "car",
  note = "Unequal n: each row's own Dunnett family, against the second column.")

fixture("interaction-tiny-p",
  input = cells(list(c(1.00, 1.01, 0.99, 1.02), c(5.00, 5.02, 4.99, 5.01)), list(c(5.04, 4.98, 5.00, 5.03), c(1.11, 0.99, 1.02, 1.03))),
  expr = twoway(y, ri, ci, "within-rows", "all", test = "sidak"), setup = reference, packages = "emmeans",
  options = opts("within-rows", "all", test = "sidak"),
  check = car_check, check_packages = "car",
  note = "A crossing interaction with tiny main effects: its P near 1e-20 keeps its magnitude.")

fixture("zero-variance-cell",
  input = cells(list(c(5, 5, 5), c(6, 7, 8)), list(c(5.5, 6, 7), c(6.5, 6, 7.5))),
  expr = twoway(y, ri, ci), setup = reference,
  options = opts(),
  check = car_check, check_packages = "car",
  note = "A cell without scatter is fine: the residual pools every cell.")

fixture("n-2-outlier",
  input = cells(list(c(4, 6), c(9, 12), c(5, 8)), list(c(5, 7), c(10, 60), c(6, 8))),
  expr = twoway(y, ri, ci, "within-columns", "all", test = "tukey"), setup = reference, packages = "emmeans",
  options = opts("within-columns", "all", test = "tukey"),
  check = car_check, check_packages = "car",
  note = "Two values per cell and an extreme one: it inflates the pooled SD for every comparison.")

fixture("summary-balanced",
  input = list(means = c(12.3, 15.1, 13.0, 14.2, 16.8, 13.9), sds = c(1.8, 2.2, 1.5, 2.0, 1.7, 1.9), ns = c(4, 4, 4, 4, 4, 4), ri = c(1, 1, 1, 2, 2, 2), ci = c(1, 2, 3, 1, 2, 3)),
  expr = from_summary(means, sds, ns, ri, ci, "main-columns", "all", test = "tukey"), setup = reference, packages = "emmeans",
  options = c(opts("main-columns", "all", test = "tukey"), list(from = "summary")),
  note = "Balanced summary data (every n the same): exact.")

# Unbalanced summary data (#51, item 18): Prism's approximate "analysis of
# unweighted means". `unweighted_check` is a second, independent route to
# the same row/column/interaction SS: a balanced regression of the cell
# means themselves (one row per cell, so it's exactly balanced, Type I
# sum-to-zero SS = Type III there), scaled by the harmonic mean nh —
# a different computation (lm + anova on the means) from `unweighted_means`'s
# direct sum-of-squares formulas, so it can catch a mistake in either.
unweighted_check <- quote({
  R <- max(ri)
  C <- max(ci)
  m <- matrix(NA_real_, R, C)
  n_ <- matrix(NA_real_, R, C)
  for (i in seq_along(means)) {
    m[ri[i], ci[i]] <- means[i]
    n_[ri[i], ci[i]] <- ns[i]
  }
  nh <- (R * C) / sum(1 / n_)
  d <- data.frame(mn = as.vector(t(m)), rf = factor(rep(seq_len(R), each = C)), cf = factor(rep(seq_len(C), R)))
  fit <- lm(mn ~ rf * cf, data = d, contrasts = list(rf = "contr.sum", cf = "contr.sum"))
  tab <- anova(fit)
  close(tab["rf", "Sum Sq"] * nh, expected$row$ss) &&
    close(tab["cf", "Sum Sq"] * nh, expected$column$ss) &&
    close(tab["rf:cf", "Sum Sq"] * nh, expected$interaction$ss, tol = 1e-6)
})

fixture("summary-unbalanced-almost-balanced",
  input = list(
    means = c(12.3, 15.1, 13.0, 14.2, 16.8, 13.9), sds = c(1.8, 2.2, 1.5, 2.0, 1.7, 1.6),
    ns = c(4, 4, 4, 4, 4, 5), ri = c(1, 1, 1, 2, 2, 2), ci = c(1, 2, 3, 1, 2, 3)
  ),
  expr = unweighted_means(means, sds, ns, ri, ci, "main-columns", "all", test = "tukey"),
  setup = reference, packages = "emmeans",
  options = c(opts("main-columns", "all", test = "tukey"), list(from = "summary")),
  check = unweighted_check,
  note = "Almost balanced (one cell with an extra replicate): Prism says the approximation is a good one here.")

fixture("summary-unbalanced-every-cell-different",
  input = list(
    means = c(10.2, 12.9, 9.8, 14.1), sds = c(1.2, 1.6, 1.0, 1.8),
    ns = c(3, 5, 4, 7), ri = c(1, 1, 2, 2), ci = c(1, 2, 1, 2)
  ),
  expr = unweighted_means(means, sds, ns, ri, ci),
  setup = reference,
  options = list(from = "summary"),
  check = unweighted_check,
  note = "Every cell a different n: the harmonic mean weights every term.")

fixture("summary-unbalanced-with-singleton",
  input = list(
    means = c(20.1, 24.3, 19.5, 26.0, 21.2, 23.8), sds = c(2.1, 0, 1.8, 2.4, 1.9, 2.0),
    ns = c(3, 1, 4, 3, 5, 2), ri = c(1, 1, 2, 2, 3, 3), ci = c(1, 2, 1, 2, 1, 2)
  ),
  expr = unweighted_means(means, sds, ns, ri, ci, "within-rows", "all", test = "sidak"),
  setup = reference, packages = "emmeans",
  options = c(opts("within-rows", "all", test = "sidak"), list(from = "summary")),
  check = unweighted_check,
  note = "A cell with n = 1 (SD 0, no scatter of its own) mixed with replicated cells: it contributes 0 to the pooled residual.")

# Consistency, not a fixture: on balanced data the unbalanced-summary
# formula must reduce to exactly what the exact balanced path computes
# (design note 18) — the harmonic mean equals the common n and the
# unweighted means equal the weighted ones, so both paths see the same
# grand/row/column means.
local({
  means <- c(12.3, 15.1, 13.0, 14.2, 16.8, 13.9)
  sds <- c(1.8, 2.2, 1.5, 2.0, 1.7, 1.9)
  ns <- c(4, 4, 4, 4, 4, 4)
  ri <- c(1, 1, 1, 2, 2, 2)
  ci <- c(1, 2, 3, 1, 2, 3)
  eval(reference)
  exact <- from_summary(means, sds, ns, ri, ci, "none", "none")
  approx <- unweighted_means(means, sds, ns, ri, ci, "none", "none")
  stopifnot(
    isTRUE(all.equal(exact$row$ss, approx$row$ss, tolerance = 1e-9)),
    isTRUE(all.equal(exact$column$ss, approx$column$ss, tolerance = 1e-9)),
    isTRUE(all.equal(exact$interaction$ss, approx$interaction$ss, tolerance = 1e-9)),
    isTRUE(all.equal(exact$residual$ss, approx$residual$ss, tolerance = 1e-9))
  )
})
