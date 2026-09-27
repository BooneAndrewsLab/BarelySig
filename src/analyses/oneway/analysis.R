# One-way ANOVA with multiple comparisons (item 06, #25), reported as
# Prism does. Everything is computed from each group's mean, variance and
# n, so raw values and summary data (mean, SD, n) take the same path; only
# the Brown-Forsythe test of equal SDs needs the values themselves.
# Comparisons are "A vs. B" with mean diff = mean A - mean B (Prism).
# `stop("bs: ...")` messages are shown to the user as written.

BS_ALPHA <- 0.05

# --- Distributions for the multiple comparisons ------------------------------

# Density and quantiles of S = sqrt(X / df), X ~ chi-square(df): the
# pooled SD's scale, which every studentized statistic divides by.
bs_ds <- function(s, df) 2 * df * s * dchisq(df * s^2, df)
bs_qs <- function(p, df) sqrt(qchisq(p, df) / df)

# Gauss-Legendre nodes and weights on [-1, 1] (Golub-Welsch), and on the
# pieces between breakpoints `br`.
bs_gauss <- function(n) {
  i <- seq_len(n - 1)
  b <- i / sqrt(4 * i^2 - 1)
  j <- matrix(0, n, n)
  j[cbind(i, i + 1)] <- b
  j[cbind(i + 1, i)] <- b
  e <- eigen(j, symmetric = TRUE)
  list(x = e$values, w = 2 * e$vectors[1, ]^2)
}
BS_GAUSS <- bs_gauss(8)
bs_nodes <- function(br) {
  a <- br[-length(br)]
  h <- (br[-1] - a) / 2
  list(
    x = as.vector(outer(BS_GAUSS$x, h) + rep(a + h, each = length(BS_GAUSS$x))),
    w = as.vector(outer(BS_GAUSS$w, h))
  )
}

# Nodes for integrating over S, for a statistic's critical value c: pieces
# between S's quantiles (narrow when df is large) and, for a large c, of
# width 1 / c around s ~ sqrt(df) / c, where the rare exceedances happen.
# Each piece is smooth, so a small probability keeps its digits.
bs_s_nodes <- function(c, df) {
  top <- bs_qs(1 - 1e-15, df)
  k <- seq_len(ceiling(2 * sqrt(df)) + 8) / c
  q <- bs_qs(c(1e-12, 1e-9, 1e-6, 1e-3, 0.05, 0.5, 0.95, 1 - 1e-6, 1 - 1e-10), df)
  bs_nodes(sort(unique(c(0, q, k[k < top], top))))
}
# Nodes on [0, 1], scaled to each s's range of Z0.
BS_T <- bs_nodes(seq(0, 1, length.out = 33))

# Dunnett (1955): P(max_j |T_j| >= c) for comparisons with a shared
# control. T_j = (lam_j Z0 + sqrt(1 - lam_j^2) Z_j) / S, so given S = s and
# Z0 = z the comparisons are independent, and the chance that at least one
# exceeds c is 1 - prod(1 - q_j), taken as -expm1(sum(log1p(-q_j))) so that
# a small P is not lost to rounding. Symmetric in z; beyond
# |z| = (c s + 8) / min(lam) + 1 every q_j is 1 to double precision, which
# the normal tail adds exactly.
bs_dunnett_p <- function(c, lam, df) {
  sig <- sqrt(1 - lam^2)
  sn <- bs_s_nodes(c, df)
  s <- sn$x
  zmax <- (c * s + 8) / min(lam) + 1
  z <- outer(zmax, BS_T$x)
  acc <- 0
  for (j in seq_along(lam)) {
    a <- lam[j] * z
    q <- pnorm((-c * s - a) / sig[j]) + pnorm((c * s - a) / sig[j], lower.tail = FALSE)
    acc <- acc + log1p(-pmin(q, 1))
  }
  given_s <- 2 * zmax * as.vector((dnorm(z) * -expm1(acc)) %*% BS_T$w) + 2 * pnorm(-zmax)
  min(1, sum(sn$w * bs_ds(s, df) * given_s))
}

# The studentized maximum modulus (Dunnett's T3): P(max |Z_j| / S >= c)
# for k independent normals over one S with df degrees of freedom.
bs_smm_p <- function(c, k, df) {
  sn <- bs_s_nodes(c, df)
  min(1, sum(sn$w * bs_ds(sn$x, df) * -expm1(k * log1p(-2 * pnorm(-c * sn$x)))))
}

# The critical value c with p(c) = alpha, for a CI.
bs_critical <- function(p, alpha = BS_ALPHA) {
  uniroot(function(c) p(c) - alpha, c(0.5, 50), tol = 1e-12)$root
}

# --- The ANOVA ------------------------------------------------------------------

bs_anova_core <- function(m, v, n, welch, comps, control, test) {
  k <- length(m)
  N <- sum(n)
  if (k < 2) stop("bs: One-way ANOVA compares at least two groups.")
  if (any(n < 1)) stop("bs: Every group needs at least one value.")
  if (N - k < 1) {
    stop("bs: One-way ANOVA needs more values than groups, so the scatter within groups can be estimated.")
  }
  vv <- ifelse(n > 1, v, 0)
  grand <- sum(n * m) / N
  ss_between <- sum(n * (m - grand)^2)
  ss_within <- sum((n - 1) * vv)
  if (ss_within == 0) {
    stop("bs: Every value within each group is the same, so there is no scatter to compare the differences between groups with; ANOVA can't be computed.")
  }
  df_between <- k - 1
  df_within <- N - k
  ms_between <- ss_between / df_between
  ms_within <- ss_within / df_within
  f <- ms_between / ms_within
  out <- list(
    k = k, n_total = N,
    ss_between = ss_between, ss_within = ss_within, ss_total = ss_between + ss_within,
    df_between = df_between, df_within = df_within, df_total = N - 1,
    ms_between = ms_between, ms_within = ms_within,
    f = f, p = pf(f, df_between, df_within, lower.tail = FALSE),
    r_squared = ss_between / (ss_between + ss_within)
  )

  # Bartlett's test (corrected; Zar 10.6), which Prism runs only when every
  # group has at least five values; not defined when a group has no scatter.
  out$bartlett <- if (all(n >= 5) && all(vv > 0)) {
    c_corr <- 1 + (sum(1 / (n - 1)) - 1 / df_within) / (3 * (k - 1))
    stat <- (df_within * log(ms_within) - sum((n - 1) * log(vv))) / c_corr
    list(statistic = stat, df = k - 1, p = pchisq(stat, k - 1, lower.tail = FALSE))
  } else {
    NA
  }

  # Not assuming equal SDs: Welch's and the Brown-Forsythe (1974) ANOVA,
  # both reported, as Prism does. Each needs every group's SD.
  if (welch) {
    if (any(n < 2) || any(vv == 0)) {
      stop("bs: Welch's ANOVA needs at least two values and some scatter in every group.")
    }
    w <- n / vv
    mw <- sum(w * m) / sum(w)
    tmp <- sum((1 - w / sum(w))^2 / (n - 1)) / (k^2 - 1)
    out$welch <- list(
      statistic = sum(w * (m - mw)^2) / (k - 1) / (1 + 2 * (k - 2) * tmp),
      dfn = k - 1, dfd = 1 / (3 * tmp)
    )
    out$welch$p <- pf(out$welch$statistic, out$welch$dfn, out$welch$dfd, lower.tail = FALSE)
    d <- (1 - n / N) * vv
    cc <- d / sum(d)
    out$brown_forsythe <- list(statistic = ss_between / sum(d), dfn = k - 1, dfd = 1 / sum(cc^2 / (n - 1)))
    out$brown_forsythe$p <- pf(out$brown_forsythe$statistic, k - 1, out$brown_forsythe$dfd, lower.tail = FALSE)
  }

  out$groups <- lapply(seq_len(k), function(i) {
    list(n = n[i], mean = m[i], sd = if (n[i] > 1) sqrt(vv[i]) else NA_real_)
  })
  out$comparisons <- bs_comparisons(m, vv, n, ms_within, df_within, welch, comps, control, test)
  out
}

# Pairs in Prism's order: every pair (i < j), or the control against each
# other group ("Control vs. B": control - B).
bs_pairs <- function(k, comps, control) {
  if (comps == "all") {
    p <- which(upper.tri(diag(k)), arr.ind = TRUE)
    p <- p[order(p[, 1], p[, 2]), , drop = FALSE]
    unname(p)
  } else {
    cbind(control, setdiff(seq_len(k), control))
  }
}


# The multiple-comparisons correction, shared by every path that has
# already reduced a family of comparisons to one diff/se/df triple per
# pair (item 17's #83: repeated-measures ANOVA's pairwise method feeds
# this the same way its pooled method does, only the per-pair inputs
# differ). `n` is each *group's* sample size (used only by "dunnett"'s
# shared-control correlation, which depends on sizes, not variances);
# `dfs[1]` stands in for a single family-wide df in that same branch,
# valid because every path that reaches "dunnett" here has one df shared
# by the whole family (the pooled residual df, or -- repeated-measures'
# individual method -- the same n every pair shares, complete rows only).
bs_apply_correction <- function(diff, se, dfs, k, pairs, n, control, test) {
  K <- nrow(pairs)
  i <- pairs[, 1]
  j <- pairs[, 2]
  t <- abs(diff) / se
  one <- function(x) {
    tt <- t[x]
    nu <- dfs[x]
    switch(test,
      tukey = ,
      "games-howell" = {
        q <- sqrt(2) * tt
        list(stat = q, p = ptukey(q, k, nu, lower.tail = FALSE), crit = qtukey(1 - BS_ALPHA, k, nu) / sqrt(2))
      },
      bonferroni = list(
        stat = tt, p = min(1, K * 2 * pt(-tt, nu)),
        crit = qt(1 - BS_ALPHA / (2 * K), nu)
      ),
      sidak = ,
      "tamhane-t2" = list(
        stat = tt, p = -expm1(K * log1p(-2 * pt(-tt, nu))),
        crit = qt(1 + expm1(log1p(-BS_ALPHA) / K) / 2, nu)
      ),
      dunnett = {
        # Correlation of two comparisons with the shared control: lam_i * lam_j.
        others <- pairs[, 2]
        lam <- sqrt((1 / n[control]) / (1 / n[others] + 1 / n[control]))
        list(stat = tt, p = bs_dunnett_p(tt, lam, nu), crit = NA_real_)
      },
      "dunnett-t3" = list(stat = tt, p = bs_smm_p(tt, K, nu), crit = bs_critical(function(c) bs_smm_p(c, K, nu))),
      stop("bs: Unknown multiple comparison test.")
    )
  }
  res <- lapply(seq_len(K), one)
  if (test == "dunnett") {
    others <- pairs[, 2]
    lam <- sqrt((1 / n[control]) / (1 / n[others] + 1 / n[control]))
    crit <- bs_critical(function(c) bs_dunnett_p(c, lam, dfs[1]))
    for (x in seq_len(K)) res[[x]]$crit <- crit
  }
  lapply(seq_len(K), function(x) {
    r <- res[[x]]
    list(
      i = i[x], j = j[x], diff = diff[x], se = se[x], df = dfs[x], statistic = r$stat,
      ci_lower = diff[x] - r$crit * se[x], ci_upper = diff[x] + r$crit * se[x], p = r$p
    )
  })
}

bs_comparisons <- function(m, v, n, mse, df, welch, comps, control, test) {
  if (comps == "none") return(list())
  # Unnamed: a named number would come back from WebR as an object.
  m <- unname(m)
  v <- unname(v)
  n <- unname(n)
  k <- length(m)
  pairs <- bs_pairs(k, comps, control)
  K <- nrow(pairs)
  i <- pairs[, 1]
  j <- pairs[, 2]
  diff <- m[i] - m[j]
  if (welch) {
    # Each comparison uses only its two groups: unpooled SE, Welch's df.
    a <- v[i] / n[i]
    b <- v[j] / n[j]
    se <- sqrt(a + b)
    dfs <- (a + b)^2 / (a^2 / (n[i] - 1) + b^2 / (n[j] - 1))
  } else {
    se <- sqrt(mse * (1 / n[i] + 1 / n[j]))
    dfs <- rep(df, K)
  }
  bs_apply_correction(diff, se, dfs, k, pairs, n, control, test)
}

# From the values: y with group index g (1..k, the table's order).
bs_oneway <- function(y, g, k, welch, comps, control, test) {
  groups <- split(y, factor(g, levels = seq_len(k)))
  n <- vapply(groups, length, 0)
  if (any(n == 0)) stop("bs: Every group needs at least one value.")
  m <- vapply(groups, mean, 0)
  v <- vapply(groups, function(x) if (length(x) > 1) var(x) else 0, 0)
  out <- bs_anova_core(unname(m), unname(v), unname(n), welch, comps, control, test)
  # Brown-Forsythe test of equal SDs: ordinary ANOVA of |value - group median|.
  dev <- abs(y - vapply(groups, median, 0)[g])
  dg <- split(dev, factor(g, levels = seq_len(k)))
  dm <- vapply(dg, mean, 0)
  dss_b <- sum(n * (dm - mean(dev))^2)
  dss_w <- sum(vapply(dg, function(x) sum((x - mean(x))^2), 0))
  out$brown_forsythe_sd <- if (dss_w > 0) {
    fb <- (dss_b / (k - 1)) / (dss_w / (sum(n) - k))
    list(statistic = fb, dfn = k - 1, dfd = sum(n) - k, p = pf(fb, k - 1, sum(n) - k, lower.tail = FALSE))
  } else {
    NA
  }
  for (x in seq_len(k)) out$groups[[x]]$median <- median(groups[[x]])
  out
}

# From summary data: each group's mean, SD and n.
bs_oneway_summary <- function(means, sds, ns, welch, comps, control, test) {
  if (any(is.na(c(means, sds, ns)))) stop("bs: ANOVA from summary data needs the mean, SD and n of every group.")
  if (any(ns != round(ns))) stop("bs: n must be a whole number.")
  if (any(sds < 0)) stop("bs: An SD can't be negative.")
  out <- bs_anova_core(means, sds^2, ns, welch, comps, control, test)
  out$brown_forsythe_sd <- NA
  out
}
