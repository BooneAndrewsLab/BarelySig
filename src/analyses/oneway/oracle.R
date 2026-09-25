# Fixtures for one-way ANOVA and its multiple comparisons (#25, item 06).
# The reference is R's own: aov for the ANOVA table, bartlett.test,
# oneway.test for Welch, TukeyHSD for Tukey, pairwise.t.test for
# Bonferroni; the rest are textbook formulas (Šidák, Games-Howell,
# Tamhane T2, the Brown-Forsythe ANOVA) and Dunnett's and the studentized
# maximum modulus' probabilities, integrated over the chi-square variable
# with a finer rule than the app's (both were checked against careful
# adaptive quadrature to 1e-9; multcomp and mvtnorm, randomised, agree
# to 1e-4). Checks: multcomp (Dunnett), car
# (Brown-Forsythe test of SDs), onewaytests (Brown-Forsythe ANOVA) and
# mvtnorm. Summary-data cases are checked against raw values with that
# mean, SD and n. Comparisons are "A vs. B", mean diff = A - B (Prism).

reference <- quote({
  alpha <- 0.05
  groups_of <- function(...) lapply(list(...), function(x) x[!is.na(x)])
  # Raw values with exactly this mean, SD and n (summary-data cases).
  raw <- function(m, s, n) if (n == 1) m else as.numeric(scale(seq_len(n))) * s + m

  # Gauss-Legendre rule (Golub-Welsch) with 12 nodes, on pieces.
  gauss <- local({
    i <- 1:11
    b <- i / sqrt(4 * i^2 - 1)
    e <- eigen(diag(0, 12) + `[<-`(matrix(0, 12, 12), cbind(c(i, i + 1), c(i + 1, i)), c(b, b)), symmetric = TRUE)
    list(x = e$values, w = 2 * e$vectors[1, ]^2)
  })
  on_pieces <- function(br) {
    a <- head(br, -1); h <- diff(br) / 2
    list(x = as.vector(outer(gauss$x, h) + rep(a + h, each = 12)), w = as.vector(outer(gauss$w, h)))
  }
  # Nodes over X = df S^2 ~ chi-square(df): its quantiles, and x = df (k / c)^2,
  # where a large statistic's rare exceedances happen (steps of 1 / (2c) in s).
  x_nodes <- function(c, df) {
    top <- qchisq(1e-16, df, lower.tail = FALSE)
    k <- df * (seq(0.5, 3 * sqrt(df) + 10, by = 0.5) / c)^2
    on_pieces(sort(unique(c(0, qchisq(c(1e-13, 1e-10, 1e-7, 1e-4, 0.01, 0.2, 0.5, 0.8, 0.99, 1 - 1e-7), df), k[k < top], top))))
  }
  # Dunnett (1955): P(max_j |T_j| >= c) for comparisons with a shared
  # control, conditioning on X and the control's Z0 (both ways in z,
  # 60 pieces out to where every comparison exceeds c, then the normal tail).
  dunnett <- function(c, lam, df) {
    sig <- sqrt(1 - lam^2)
    xn <- x_nodes(c, df)
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
  smm <- function(c, k, df) {
    xn <- x_nodes(c, df)
    min(1, sum(xn$w * dchisq(xn$x, df) * (1 - exp(k * log1p(-2 * pnorm(c * sqrt(xn$x / df), lower.tail = FALSE))))))
  }
  critical <- function(p) uniroot(function(c) p(c) - alpha, c(0.5, 50), tol = 1e-13)$root

  oneway <- function(groups, welch = FALSE, comps = "all", control = 1, test = "tukey", from = "values") {
    k <- length(groups)
    n <- vapply(groups, length, 0)
    m <- vapply(groups, mean, 0)
    v <- vapply(groups, function(x) if (length(x) > 1) var(x) else 0, 0)
    y <- unlist(groups)
    g <- factor(rep(seq_len(k), n))
    fit <- aov(y ~ g)
    tab <- summary(fit)[[1]]
    out <- list(
      k = k, n_total = sum(n),
      ss_between = tab[1, "Sum Sq"], ss_within = tab[2, "Sum Sq"], ss_total = sum(tab[, "Sum Sq"]),
      df_between = tab[1, "Df"], df_within = tab[2, "Df"], df_total = sum(n) - 1,
      ms_between = tab[1, "Mean Sq"], ms_within = tab[2, "Mean Sq"],
      f = tab[1, "F value"], p = tab[1, "Pr(>F)"],
      r_squared = tab[1, "Sum Sq"] / sum(tab[, "Sum Sq"])
    )
    out$bartlett <- if (all(n >= 5) && all(v > 0)) {
      b <- bartlett.test(groups)
      list(statistic = unname(b$statistic), df = unname(b$parameter), p = b$p.value)
    } else {
      NA
    }
    if (welch) {
      w <- oneway.test(y ~ g, var.equal = FALSE)
      out$welch <- list(statistic = unname(w$statistic), dfn = unname(w$parameter[1]), dfd = unname(w$parameter[2]), p = w$p.value)
      # Brown & Forsythe (1974): F* = SSB / sum((1 - n/N) s^2), Satterthwaite's df.
      N <- sum(n)
      den <- (1 - n / N) * v
      fstar <- tab[1, "Sum Sq"] / sum(den)
      dfd <- sum(den)^2 / sum(den^2 / (n - 1))
      out$brown_forsythe <- list(statistic = fstar, dfn = k - 1, dfd = dfd, p = pf(fstar, k - 1, dfd, lower.tail = FALSE))
    }
    out$groups <- lapply(seq_len(k), function(i) {
      r <- list(n = n[i], mean = m[i], sd = if (n[i] > 1) sd(groups[[i]]) else NA)
      if (from == "values") r$median <- median(groups[[i]])
      r
    })
    out$comparisons <- if (comps == "none") list() else comparisons(groups, fit, welch, comps, control, test)
    out$brown_forsythe_sd <- if (from == "values") {
      dev <- abs(y - ave(y, g, FUN = median))
      if (sum((dev - ave(dev, g))^2) > 0) {
        bt <- summary(aov(dev ~ g))[[1]]
        list(statistic = bt[1, "F value"], dfn = bt[1, "Df"], dfd = bt[2, "Df"], p = bt[1, "Pr(>F)"])
      } else NA
    } else {
      NA
    }
    out
  }

  comparisons <- function(groups, fit, welch, comps, control, test) {
    k <- length(groups)
    n <- vapply(groups, length, 0)
    m <- vapply(groups, mean, 0)
    v <- vapply(groups, function(x) if (length(x) > 1) var(x) else 0, 0)
    mse <- sum(residuals(fit)^2) / fit$df.residual
    df <- fit$df.residual
    # Unnamed: a named number comes back from WebR as an object, not a number.
    pairs <- unname(if (comps == "all") {
      do.call(rbind, lapply(seq_len(k - 1), function(i) cbind(i, (i + 1):k)))
    } else {
      cbind(control, seq_len(k)[-control])
    })
    K <- nrow(pairs)
    hsd <- if (test == "tukey") TukeyHSD(fit, conf.level = 1 - alpha)$g else NULL
    # Dunnett's critical value is the same for every comparison.
    if (test == "dunnett") {
      others <- pairs[, 2]
      lam <- sqrt(n[others] / (n[others] + n[control]))
      dunnett_crit <- critical(function(c) dunnett(c, lam, df))
    }
    lapply(seq_len(K), function(x) {
      i <- pairs[x, 1]
      j <- pairs[x, 2]
      d <- m[i] - m[j]
      if (welch) {
        se <- sqrt(v[i] / n[i] + v[j] / n[j])
        nu <- se^4 / ((v[i] / n[i])^2 / (n[i] - 1) + (v[j] / n[j])^2 / (n[j] - 1))
      } else {
        se <- sqrt(mse * (1 / n[i] + 1 / n[j]))
        nu <- df
      }
      t <- abs(d) / se
      r <- switch(test,
        tukey = {
          # TukeyHSD's row "j-i" is mean j - mean i: turn it round.
          h <- hsd[paste0(j, "-", i), ]
          list(stat = sqrt(2) * t, lower = -h[["upr"]], upper = -h[["lwr"]], p = h[["p adj"]])
        },
        "games-howell" = {
          half <- qtukey(1 - alpha, k, nu) / sqrt(2) * se
          list(stat = sqrt(2) * t, lower = d - half, upper = d + half, p = ptukey(sqrt(2) * t, k, nu, lower.tail = FALSE))
        },
        bonferroni = {
          half <- qt(1 - alpha / (2 * K), nu) * se
          list(stat = t, lower = d - half, upper = d + half, p = min(1, K * 2 * pt(t, nu, lower.tail = FALSE)))
        },
        sidak = ,
        "tamhane-t2" = {
          a1 <- 1 - (1 - alpha)^(1 / K)
          half <- qt(1 - a1 / 2, nu) * se
          p1 <- 2 * pt(t, nu, lower.tail = FALSE)
          list(stat = t, lower = d - half, upper = d + half, p = 1 - exp(K * log1p(-p1)))
        },
        dunnett = {
          half <- dunnett_crit * se
          list(stat = t, lower = d - half, upper = d + half, p = dunnett(t, lam, df))
        },
        "dunnett-t3" = {
          half <- critical(function(c) smm(c, K, nu)) * se
          list(stat = t, lower = d - half, upper = d + half, p = smm(t, K, nu))
        }
      )
      list(i = i, j = j, diff = d, se = se, df = nu, statistic = r$stat, ci_lower = r$lower, ci_upper = r$upper, p = r$p)
    })
  }
  summary_case <- function(means, sds, ns, ...) {
    groups <- lapply(seq_along(means), function(i) raw(means[i], sds[i], ns[i]))
    oneway(groups, ..., from = "summary")
  }
})

close <- function(x, y, tol = 1e-9) isTRUE(all.equal(as.numeric(x), as.numeric(y), tolerance = tol))
p_of <- function(e) vapply(e$comparisons, function(c) c$p, 0)

# Confirmations (desktop R only).
dunnett_check <- quote({
  gs <- groups_of(g1, g2, g3, g4)
  d <- data.frame(y = unlist(gs), g = factor(rep(seq_along(gs), lengths(gs))))
  set.seed(1)
  s <- summary(multcomp::glht(aov(y ~ g, d), linfct = multcomp::mcp(g = "Dunnett")),
    test = multcomp::adjusted("single-step", maxpts = 1e6, abseps = 1e-9))
  close(p_of(expected), s$test$pvalues, 1e-4)
})
bf_sd_check <- quote({
  gs <- groups_of(g1, g2, g3)
  d <- data.frame(y = unlist(gs), g = factor(rep(seq_along(gs), lengths(gs))))
  close(expected$brown_forsythe_sd$p, car::leveneTest(y ~ g, d, center = median)[1, "Pr(>F)"])
})
bf_anova_check <- quote({
  gs <- groups_of(g1, g2, g3)
  d <- data.frame(y = unlist(gs), g = factor(rep(seq_along(gs), lengths(gs))))
  b <- onewaytests::bf.test(y ~ g, d, verbose = FALSE)
  close(expected$brown_forsythe$statistic, b$statistic) && close(expected$brown_forsythe$p, b$p.value)
})
bonferroni_check <- quote({
  gs <- groups_of(g1, g2, g3, g4)
  d <- data.frame(y = unlist(gs), g = factor(rep(seq_along(gs), lengths(gs))))
  pw <- pairwise.t.test(d$y, d$g, p.adjust.method = "bonferroni", pool.sd = TRUE)$p.value
  ref <- vapply(expected$comparisons, function(c) pw[as.character(c$j), as.character(c$i)], 0)
  close(p_of(expected), ref)
})
t3_check <- quote({
  # mvtnorm needs a whole df: the P for Welch's df lies between those for
  # the whole numbers either side (P is monotone in df, either way).
  K <- length(expected$comparisons)
  smm_mvt <- function(c, df) {
    set.seed(1)
    1 - mvtnorm::pmvt(lower = rep(-c, K), upper = rep(c, K), df = df, corr = diag(K),
      algorithm = mvtnorm::GenzBretz(maxpts = 1e6, abseps = 1e-10))[1]
  }
  all(vapply(expected$comparisons, function(c) {
    ends <- c(smm_mvt(c$statistic, floor(c$df)), smm_mvt(c$statistic, ceiling(c$df)))
    c$p <= max(ends) * (1 + 1e-4) && c$p >= min(ends) * (1 - 1e-4)
  }, TRUE))
})
summary_check <- quote({
  # The summaries' raw stand-ins give the same ANOVA as the summaries.
  n <- ns
  close(expected$ss_within, sum((n - 1) * sds^2)) &&
    close(expected$ss_between, sum(n * (means - sum(n * means) / sum(n))^2))
})

tukey <- list(welch = FALSE, comparisons = "all", test = "tukey")

# --- Ordinary ANOVA, Tukey -----------------------------------------------------------
fixture("tukey-basic",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8, 5.0), g2 = c(6.1, 5.8, 6.4, 7.0, 6.2), g3 = c(4.9, 5.5, 5.2, 4.6, 5.9)),
  expr = oneway(groups_of(g1, g2, g3)), setup = reference, options = tukey,
  check = bf_sd_check, check_packages = "car",
  note = "Three groups of five: Bartlett's test runs (every n >= 5).")

fixture("tukey-unequal-missing",
  input = list(g1 = c(12.1, 13.4, NA, 11.8), g2 = c(14.2, 15.1, 13.9, 16.0, 14.8, NA, 15.5), g3 = c(12.9, NA, 13.8, 14.4, 13.1, 12.7)),
  expr = oneway(groups_of(g1, g2, g3)), setup = reference, options = tukey,
  check = bf_sd_check, check_packages = "car",
  note = "Unequal n (Tukey-Kramer) and empty cells, which drop out; Bartlett is not run (a group has fewer than 5 values).")

fixture("tukey-n-2",
  input = list(g1 = c(4, 6), g2 = c(9, 12), g3 = c(5, 8)),
  expr = oneway(groups_of(g1, g2, g3)), setup = reference, options = tukey)

fixture("tukey-two-groups",
  input = list(g1 = c(1, 2, 3, 4, 6), g2 = c(3, 4, 5, 7, 9)),
  expr = oneway(groups_of(g1, g2)), setup = reference, options = tukey,
  check = close(expected$p, t.test(g2, g1, var.equal = TRUE)$p.value),
  note = "Two groups: F = t^2 and P equals the unpaired t test's.")

fixture("tukey-zero-variance-one",
  input = list(g1 = c(5, 5, 5, 5, 5), g2 = c(6, 7, 8, 7, 6.5), g3 = c(5.5, 6, 7, 6.5, 6)),
  expr = oneway(groups_of(g1, g2, g3)), setup = reference, options = tukey,
  note = "One group without scatter: ANOVA is defined, Bartlett's test is not.")

fixture("tukey-ties",
  input = list(g1 = c(2, 2, 2, 3, 3), g2 = c(3, 3, 4, 4, 4, 4), g3 = c(2, 3, 3, 3, 4)),
  expr = oneway(groups_of(g1, g2, g3)), setup = reference, options = tukey,
  check = bf_sd_check, check_packages = "car")

fixture("tukey-outlier",
  input = list(g1 = c(10.1, 9.8, 10.3, 9.9, 10.0), g2 = c(10.4, 10.2, 10.6, 10.5, 60), g3 = c(10.9, 11.2, 10.8, 11.0, 11.1)),
  expr = oneway(groups_of(g1, g2, g3)), setup = reference, options = tukey,
  check = bf_sd_check, check_packages = "car",
  note = "An extreme value inflates the pooled SD and hides the differences.")

fixture("tukey-tiny-p",
  input = list(g1 = c(1.00, 1.01, 0.99, 1.02, 0.98), g2 = c(5.00, 5.01, 4.99, 5.03, 4.98), g3 = c(3.00, 3.015, 2.99, 3.02, 2.97)),
  expr = oneway(groups_of(g1, g2, g3)), setup = reference, options = tukey,
  note = "ANOVA P near 1e-20 keeps its magnitude; Tukey's P is as small as R's ptukey resolves.")

fixture("none",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8), g2 = c(6.1, 5.8, 6.4, 7.0), g3 = c(4.9, 5.5, 5.2, 4.6)),
  expr = oneway(groups_of(g1, g2, g3), comps = "none"), setup = reference,
  options = list(welch = FALSE, comparisons = "none"))

# --- Against a control, and Šidák / Bonferroni ----------------------------------------
fixture("dunnett",
  input = list(g1 = c(10.2, 11.1, 9.8, 10.5, 10.9, 10.1), g2 = c(11.8, 12.4, 11.1, 12.9), g3 = c(10.8, 11.5, 10.3, 11.9, 10.6), g4 = c(13.1, 12.2, 13.8, 12.9, 13.5, 12.7, 13.0)),
  expr = oneway(groups_of(g1, g2, g3, g4), comps = "control", control = 1, test = "dunnett"), setup = reference,
  options = list(welch = FALSE, comparisons = "control", control = 1, test = "dunnett"),
  check = dunnett_check, check_packages = "multcomp",
  note = "Unequal n: the comparisons' correlations differ. multcomp agrees to its QMC accuracy (1e-4).")

fixture("dunnett-tiny-p",
  input = list(g1 = c(1.00, 1.01, 0.99, 1.02), g2 = c(1.01, 1.00, 1.03, 0.99), g3 = c(2.00, 2.01, 1.99, 2.02), g4 = c(1.50, 1.52, 1.49, 1.51)),
  expr = oneway(groups_of(g1, g2, g3, g4), comps = "control", control = 1, test = "dunnett"), setup = reference,
  options = list(welch = FALSE, comparisons = "control", control = 1, test = "dunnett"),
  note = "Dunnett P values near 1e-12 keep their digits (the complement is taken inside the integral).")

fixture("sidak-all",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8, 5.0), g2 = c(6.1, 5.8, 6.4, 7.0), g3 = c(4.9, 5.5, 5.2, 4.6, 5.9, 5.3), g4 = c(5.6, 6.0, 5.1, 5.8)),
  expr = oneway(groups_of(g1, g2, g3, g4), test = "sidak"), setup = reference,
  options = list(welch = FALSE, comparisons = "all", test = "sidak"))

fixture("bonferroni-all",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8, 5.0), g2 = c(6.1, 5.8, 6.4, 7.0), g3 = c(4.9, 5.5, 5.2, 4.6, 5.9, 5.3), g4 = c(5.6, 6.0, 5.1, 5.8)),
  expr = oneway(groups_of(g1, g2, g3, g4), test = "bonferroni"), setup = reference,
  options = list(welch = FALSE, comparisons = "all", test = "bonferroni"),
  check = bonferroni_check)

fixture("bonferroni-control",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8, 5.0), g2 = c(6.1, 5.8, 6.4, 7.0), g3 = c(4.9, 5.5, 5.2, 4.6, 5.9, 5.3)),
  expr = oneway(groups_of(g1, g2, g3), comps = "control", control = 2, test = "bonferroni"), setup = reference,
  options = list(welch = FALSE, comparisons = "control", control = 2, test = "bonferroni"),
  note = "The control is the second group: rows read \"g2 vs. g1\", \"g2 vs. g3\".")

fixture("sidak-control",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8, 5.0), g2 = c(6.1, 5.8, 6.4, 7.0), g3 = c(4.9, 5.5, 5.2, 4.6, 5.9, 5.3)),
  expr = oneway(groups_of(g1, g2, g3), comps = "control", control = 1, test = "sidak"), setup = reference,
  options = list(welch = FALSE, comparisons = "control", control = 1, test = "sidak"))

# --- Not assuming equal SDs ------------------------------------------------------------
fixture("welch-games-howell",
  input = list(g1 = c(20.1, 22.3, 19.8, 21.5, 20.9, 22.0), g2 = c(25.2, 31.8, 19.4, 35.6, 28.1), g3 = c(21.0, 21.4, 20.8, 21.9, 21.2, 21.6, 20.9)),
  expr = oneway(groups_of(g1, g2, g3), welch = TRUE, test = "games-howell"), setup = reference,
  options = list(welch = TRUE, comparisons = "all", test = "games-howell"),
  check = bf_anova_check, check_packages = "onewaytests")

fixture("welch-dunnett-t3",
  input = list(g1 = c(20.1, 22.3, 19.8, 21.5, 20.9, 22.0), g2 = c(25.2, 31.8, 19.4, 35.6, 28.1), g3 = c(21.0, 21.4, 20.8, 21.9, 21.2, 21.6, 20.9)),
  expr = oneway(groups_of(g1, g2, g3), welch = TRUE, test = "dunnett-t3"), setup = reference,
  options = list(welch = TRUE, comparisons = "all", test = "dunnett-t3"),
  check = t3_check,
  note = "Dunnett's T3: the studentized maximum modulus with each pair's Welch df; mvtnorm agrees to 1e-4.")

fixture("welch-t3-control",
  input = list(g1 = c(3.1, 2.8, 3.5, 3.0, 3.3), g2 = c(4.2, 5.9, 3.8, 6.1), g3 = c(3.4, 3.6, 3.3, 3.9, 3.5, 3.7)),
  expr = oneway(groups_of(g1, g2, g3), welch = TRUE, comps = "control", control = 1, test = "dunnett-t3"), setup = reference,
  options = list(welch = TRUE, comparisons = "control", control = 1, test = "dunnett-t3"),
  check = bf_anova_check, check_packages = "onewaytests")

fixture("welch-tamhane-t2",
  input = list(g1 = c(3.1, 2.8, 3.5, 3.0, 3.3), g2 = c(4.2, 5.9, 3.8, 6.1), g3 = c(3.4, 3.6, 3.3, 3.9, 3.5, 3.7)),
  expr = oneway(groups_of(g1, g2, g3), welch = TRUE, test = "tamhane-t2"), setup = reference,
  options = list(welch = TRUE, comparisons = "all", test = "tamhane-t2"))

# --- From summary data -----------------------------------------------------------------
fixture("summary-tukey",
  input = list(means = c(12.3, 15.1, 13.0), sds = c(1.8, 2.2, 1.5), ns = c(6, 6, 5)),
  expr = summary_case(means, sds, ns), setup = reference,
  options = list(welch = FALSE, comparisons = "all", test = "tukey", from = "summary"),
  check = summary_check,
  note = "Summary data: Bartlett's test from the SDs; the Brown-Forsythe test needs the values.")

fixture("summary-welch-dunnett-t3",
  input = list(means = c(50, 58, 52, 61), sds = c(4, 12, 5, 9), ns = c(5, 9, 6, 7)),
  expr = summary_case(means, sds, ns, welch = TRUE, comps = "control", control = 1, test = "dunnett-t3"), setup = reference,
  options = list(welch = TRUE, comparisons = "control", control = 1, test = "dunnett-t3", from = "summary"),
  check = summary_check)
