# Fixtures for matched nested one-way ANOVA (note 21, #71). The R this
# analysis runs (`bs_repeated`) is exactly repeated-measures ANOVA's
# (item 17, #50): `prepare()` only matches a Nested table's replicates by
# position and averages each one's values first (JS, covered by this
# folder's own prepare() tests, not R). So the reference is repeated's own
# (`repeated/oracle.R`), reused verbatim rather than re-derived: R's own
# `aov(value ~ subj + treat)` decomposition (checked there against the
# stratified `Error(subj / treat)` table), `stats:::sphericity()` for
# Geisser-Greenhouse/Huynh-Feldt, and textbook Sidak/Bonferroni/Dunnett
# formulas checked against TukeyHSD and multcomp's Dunnett. Inputs here are
# named as replicate means (what `prepare()` actually feeds `bs_repeated`),
# smaller and more ragged than repeated's own Column-table fixtures, since
# a Nested table's matched replicates are typically few.

reference <- quote({
  alpha <- 0.05
  complete_rows <- function(...) {
    m <- do.call(cbind, list(...))
    m[stats::complete.cases(m), , drop = FALSE]
  }

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
  x_nodes <- function(c, df) {
    top <- qchisq(1e-16, df, lower.tail = FALSE)
    k <- df * (seq(0.5, 3 * sqrt(df) + 10, by = 0.5) / c)^2
    on_pieces(sort(unique(c(0, qchisq(c(1e-13, 1e-10, 1e-7, 1e-4, 0.01, 0.2, 0.5, 0.8, 0.99, 1 - 1e-7), df), k[k < top], top))))
  }
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
  critical <- function(p) uniroot(function(c) p(c) - alpha, c(0.5, 50), tol = 1e-13)$root

  repeated <- function(m, comps = "all", control = 1, test = "tukey") {
    n <- nrow(m)
    k <- ncol(m)
    d <- data.frame(value = as.vector(t(m)), treat = factor(rep(seq_len(k), n)), subj = factor(rep(seq_len(n), each = k)))
    fit <- aov(value ~ subj + treat, data = d)
    tab <- anova(fit)
    strat <- summary(aov(value ~ treat + Error(subj / treat), data = d))
    f_strat <- strat[["Error: subj:treat"]][[1]][1, "F value"]
    stopifnot(isTRUE(all.equal(unname(tab["treat", "F value"]), unname(f_strat), tolerance = 1e-9)))

    means <- unname(tapply(d$value, d$treat, mean))
    mse <- tab["Residuals", "Mean Sq"]
    df_res <- tab["Residuals", "Df"]

    sph <- stats:::sphericity(stats::SSD(lm(m ~ 1)), X = ~1)
    clamp <- function(e) max(1 / (k - 1), min(1, e))
    gg <- clamp(sph$GG.eps)
    hf <- clamp(sph$HF.eps)
    f <- unname(tab["treat", "F value"])

    out <- list(
      k = k, n = n,
      ss_treatment = unname(tab["treat", "Sum Sq"]), ss_subjects = unname(tab["subj", "Sum Sq"]),
      ss_residual = unname(tab["Residuals", "Sum Sq"]),
      ss_total = sum(tab[, "Sum Sq"]),
      df_treatment = unname(tab["treat", "Df"]), df_subjects = unname(tab["subj", "Df"]),
      df_residual = unname(df_res), df_total = n * k - 1,
      ms_treatment = unname(tab["treat", "Mean Sq"]), ms_subjects = unname(tab["subj", "Mean Sq"]),
      ms_residual = unname(mse),
      f = f, p = unname(tab["treat", "Pr(>F)"]),
      gg_epsilon = gg, hf_epsilon = hf,
      gg_p = pf(f, (k - 1) * gg, df_res * gg, lower.tail = FALSE),
      hf_p = pf(f, (k - 1) * hf, df_res * hf, lower.tail = FALSE),
      r_squared_treatment = unname(tab["treat", "Sum Sq"] / (tab["treat", "Sum Sq"] + tab["Residuals", "Sum Sq"])),
      r_squared_subjects = unname(tab["subj", "Sum Sq"] / sum(tab[, "Sum Sq"])),
      groups = lapply(seq_len(k), function(j) list(mean = means[j]))
    )
    out$comparisons <- if (comps == "none") list() else {
      pairs <- unname(if (comps == "all") {
        do.call(rbind, lapply(seq_len(k - 1), function(i) cbind(i, (i + 1):k)))
      } else {
        cbind(control, seq_len(k)[-control])
      })
      K <- nrow(pairs)
      hsd <- if (test == "tukey") TukeyHSD(fit, "treat", conf.level = 1 - alpha)$treat else NULL
      if (test == "dunnett") {
        others <- pairs[, 2]
        lam <- rep(sqrt(n / (n + n)), length(others))
        dunnett_crit <- critical(function(c) dunnett(c, lam, df_res))
      }
      lapply(seq_len(K), function(x) {
        i <- pairs[x, 1]
        j <- pairs[x, 2]
        dd <- means[i] - means[j]
        se <- sqrt(mse * (2 / n))
        t <- abs(dd) / se
        r <- switch(test,
          tukey = {
            h <- hsd[paste0(j, "-", i), ]
            list(stat = sqrt(2) * t, lower = -h[["upr"]], upper = -h[["lwr"]], p = h[["p adj"]])
          },
          bonferroni = {
            half <- qt(1 - alpha / (2 * K), df_res) * se
            list(stat = t, lower = dd - half, upper = dd + half, p = min(1, K * 2 * pt(t, df_res, lower.tail = FALSE)))
          },
          sidak = {
            half <- qt(1 - (1 - (1 - alpha)^(1 / K)) / 2, df_res) * se
            p1 <- 2 * pt(t, df_res, lower.tail = FALSE)
            list(stat = t, lower = dd - half, upper = dd + half, p = -expm1(K * log1p(-p1)))
          },
          dunnett = {
            half <- dunnett_crit * se
            list(stat = t, lower = dd - half, upper = dd + half, p = dunnett(t, lam, df_res))
          }
        )
        list(i = i, j = j, diff = dd, se = se, df = df_res, statistic = r$stat, ci_lower = r$lower, ci_upper = r$upper, p = r$p)
      })
    }
    out
  }
})

close <- function(x, y, tol = 1e-6) isTRUE(all.equal(as.numeric(x), as.numeric(y), tolerance = tol))
p_of <- function(e) vapply(e$comparisons, function(c) c$p, 0)

dunnett_check <- quote({
  m <- complete_rows(g1, g2, g3, g4)
  n <- nrow(m); k <- ncol(m)
  d <- data.frame(value = as.vector(t(m)), treat = factor(rep(seq_len(k), n)), subj = factor(rep(seq_len(n), each = k)))
  set.seed(1)
  s <- summary(multcomp::glht(aov(value ~ subj + treat, d), linfct = multcomp::mcp(treat = "Dunnett")),
    test = multcomp::adjusted("single-step", maxpts = 1e6, abseps = 1e-9))
  close(p_of(expected), s$test$pvalues, 1e-4)
})

all_pairs <- list(comparisons = "all", test = "tukey")

fixture("three-groups-few-replicates",
  input = list(
    g1 = c(9.8, 10.4, 11.1, 10.0, 9.6),
    g2 = c(12.1, 12.9, 13.4, 12.4, 11.9),
    g3 = c(15.0, 15.6, 16.2, 15.2, 14.8)
  ),
  expr = repeated(complete_rows(g1, g2, g3)), setup = reference, options = all_pairs,
  note = "3 groups x 5 matched replicates: a realistic Nested-table SuperPlot size.")

fixture("minimum-replicates",
  input = list(g1 = c(4.0, 9.5), g2 = c(5.2, 10.8), g3 = c(4.6, 10.1)),
  expr = repeated(complete_rows(g1, g2, g3), comps = "none"), setup = reference,
  options = list(comparisons = "none"),
  note = "The fewest matched replicates the ANOVA can run on: two (df = 1).")

fixture("four-groups-dunnett",
  input = list(
    g1 = c(20.1, 21.4, 19.8, 20.6),
    g2 = c(24.2, 25.0, 23.6, 24.5),
    g3 = c(20.5, 21.0, 20.2, 20.8),
    g4 = c(28.1, 29.0, 27.6, 28.6)
  ),
  expr = repeated(complete_rows(g1, g2, g3, g4), comps = "control", control = 1, test = "dunnett"),
  setup = reference, options = list(comparisons = "control", control = 1, test = "dunnett"),
  check = dunnett_check, check_packages = "multcomp",
  note = "Four groups against a control (g1), Dunnett's test.")

fixture("tied-replicate-means",
  input = list(g1 = c(5.0, 5.0, 6.0, 5.0, 6.0, 5.2), g2 = c(7.0, 7.0, 8.0, 7.1, 8.0, 6.9), g3 = c(6.0, 6.2, 7.0, 6.0, 6.8, 6.0)),
  expr = repeated(complete_rows(g1, g2, g3)), setup = reference, options = all_pairs,
  note = "Mostly-tied replicate means (only two or three distinct values per group), with enough jitter that the subject x treatment interaction isn't exactly zero.")

fixture("high-sphericity-violation",
  input = list(
    g1 = c(1, 2, 3, 4, 5, 6, 7, 8),
    g2 = c(1.1, 2.2, 2.9, 4.2, 4.8, 6.3, 6.9, 8.1),
    g3 = c(10, 9, 12, 8, 15, 7, 20, 6),
    g4 = c(1.05, 2.1, 3.05, 3.9, 5.1, 5.9, 7.05, 8.2)
  ),
  expr = repeated(complete_rows(g1, g2, g3, g4), comps = "none"), setup = reference,
  options = list(comparisons = "none"),
  note = "g3 swings independently: a low epsilon, GG and HF P noticeably above the uncorrected one.")

fixture("very-consistent-small-p",
  input = list(
    g1 = c(10.01, 10.06, 9.98, 10.03, 9.99, 9.97, 10.04),
    g2 = c(15.02, 15.05, 15.00, 15.04, 14.98, 15.03, 15.01),
    g3 = c(20.00, 20.03, 19.96, 20.05, 19.99, 20.01, 19.98)
  ),
  expr = repeated(complete_rows(g1, g2, g3)), setup = reference, options = all_pairs,
  note = "A very consistent difference across 7 replicates, with independent jitter: a very small P that must keep its magnitude.")

fixture("bonferroni-sidak",
  input = list(
    g1 = c(9.8, 10.4, 11.1, 10.0, 9.6, 10.2),
    g2 = c(12.1, 12.9, 13.4, 12.4, 11.9, 12.6),
    g3 = c(15.0, 15.6, 16.2, 15.2, 14.8, 15.4)
  ),
  expr = repeated(complete_rows(g1, g2, g3), test = "sidak"), setup = reference,
  options = list(comparisons = "all", test = "sidak"),
  note = "Šidák instead of Tukey; Bonferroni is exercised by repeated's own fixtures for the shared code.")
