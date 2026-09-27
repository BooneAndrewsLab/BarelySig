# Fixtures for repeated-measures one-way ANOVA (item 17, #50). The ANOVA
# table is R's own: for a design with one value per subject x treatment
# cell and no interaction term to test against, `aov(value ~ subject +
# treatment)` gives exactly the repeated-measures decomposition (its
# residual is the subject x treatment interaction that stands in for
# error) -- checked here against `aov(value ~ treatment + Error(subject /
# treatment))`'s own stratified table. Geisser-Greenhouse and
# Huynh-Feldt epsilon have one correct implementation in base R,
# `stats:::sphericity()` (the same helper `anova.mlm` calls internally),
# used directly (as the app's `analysis.R` says, matching how it already
# leans on `ptukey`/`qtukey` rather than re-deriving those). Comparisons
# are the textbook formulas (Šidák, Bonferroni, Dunnett's exact
# probability), written out independently of the app's own copy in
# `oneway/analysis.R`; checked against `TukeyHSD` and multcomp's Dunnett.
#
# #83's sphericity-free method (`sphericity = FALSE`) computes each
# pair's diff/se/df with base R's `t.test(..., paired = TRUE)` -- a
# different R function than either the app's or this file's own
# `sd(d) / sqrt(n)` -- then the same textbook Tukey/Šidák/Bonferroni/
# Dunnett formulas the pooled path already uses, independent of the
# app's shared `bs_apply_correction`.

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

  repeated <- function(m, comps = "all", control = 1, test = "tukey", sphericity = TRUE) {
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
      if (sphericity) {
        hsd <- if (test == "tukey") TukeyHSD(fit, "treat", conf.level = 1 - alpha)$treat else NULL
        if (test == "dunnett") {
          others <- pairs[, 2]
          # One lambda per comparison sharing the control (equal n: all 1/sqrt(2)),
          # not a scalar -- dunnett() needs the whole joint family to get
          # P(max over the family >= c), not a single comparison's own tail.
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
              # -expm1(), not 1 - exp(): the naive form cancels digits when
              # K * log1p(-p1) is small (a tiny p1), as CLAUDE.md's mvtnorm
              # lesson warns of for a different formula with the same shape.
              list(stat = t, lower = dd - half, upper = dd + half, p = -expm1(K * log1p(-p1)))
            },
            dunnett = {
              half <- dunnett_crit * se
              list(stat = t, lower = dd - half, upper = dd + half, p = dunnett(t, lam, df_res))
            }
          )
          list(i = i, j = j, diff = dd, se = se, df = df_res, statistic = r$stat, ci_lower = r$lower, ci_upper = r$upper, p = r$p)
        })
      } else {
        # #83's "new method" (FAQ 1609): each pair's own diff/se/df, from
        # base R's `t.test(..., paired = TRUE)` -- a different R function
        # than the app's (or this file's pooled path's) hand computation --
        # then the same textbook corrections above, per-pair df in place of
        # the pooled df_res. Every row is complete (m has none dropped), so
        # n -- and therefore "dunnett"'s lam, which depends only on n -- is
        # the same for every pair, exactly as the pooled path's.
        if (test == "dunnett") {
          others <- pairs[, 2]
          lam <- rep(sqrt(n / (n + n)), length(others))
          dunnett_crit <- critical(function(c) dunnett(c, lam, n - 1))
        }
        lapply(seq_len(K), function(x) {
          i <- pairs[x, 1]
          j <- pairs[x, 2]
          tt <- t.test(m[, i], m[, j], paired = TRUE)
          dd <- unname(tt$estimate)
          nu <- unname(tt$parameter)
          t <- abs(unname(tt$statistic))
          se <- abs(dd) / t
          r <- switch(test,
            tukey = {
              half <- qtukey(1 - alpha, k, nu) / sqrt(2) * se
              list(stat = sqrt(2) * t, lower = dd - half, upper = dd + half, p = ptukey(sqrt(2) * t, k, nu, lower.tail = FALSE))
            },
            bonferroni = {
              half <- qt(1 - alpha / (2 * K), nu) * se
              list(stat = t, lower = dd - half, upper = dd + half, p = min(1, K * 2 * pt(t, nu, lower.tail = FALSE)))
            },
            sidak = {
              half <- qt(1 - (1 - (1 - alpha)^(1 / K)) / 2, nu) * se
              p1 <- 2 * pt(t, nu, lower.tail = FALSE)
              list(stat = t, lower = dd - half, upper = dd + half, p = -expm1(K * log1p(-p1)))
            },
            dunnett = {
              half <- dunnett_crit * se
              list(stat = t, lower = dd - half, upper = dd + half, p = dunnett(t, lam, nu))
            }
          )
          list(i = i, j = j, diff = dd, se = se, df = nu, statistic = r$stat, ci_lower = r$lower, ci_upper = r$upper, p = r$p)
        })
      }
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

fixture("basic",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  note = "4 treatments x 8 subjects, moderate sphericity violation.")

fixture("two-treatments-epsilon-one",
  input = list(g1 = c(5.0, 6.1, 4.4, 5.6, 5.2, 4.8), g2 = c(6.2, 7.0, 5.6, 6.8, 6.4, 6.0)),
  expr = repeated(complete_rows(g1, g2), comps = "none"), setup = reference,
  options = list(comparisons = "none"),
  note = "Two treatments: epsilon is always 1 and every P is identical.")

fixture("dropped-row",
  input = list(g1 = c(5.0, 4.2, NA, 3.8, 4.9, 4.4, 4.1, 4.6), g2 = c(6.1, 5.0, 6.8, NA, 5.9, 5.3, 5.5, 5.8), g3 = c(4.8, 4.0, 5.5, 3.2, 4.6, 4.1, 4.3, 4.5)),
  expr = repeated(complete_rows(g1, g2, g3)), setup = reference, options = all_pairs,
  note = "Two rows each missing a different group's value: both drop out entirely, leaving 6.")

fixture("control",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4), comps = "control", control = 1, test = "dunnett"), setup = reference,
  options = list(comparisons = "control", control = 1, test = "dunnett"),
  check = dunnett_check, check_packages = "multcomp",
  note = "Against a control, Dunnett's test: three comparisons with a shared control.")

fixture("bonferroni",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4), test = "bonferroni"), setup = reference,
  options = list(comparisons = "all", test = "bonferroni"),
  note = "Bonferroni instead of Tukey.")

fixture("sidak",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4), test = "sidak"), setup = reference,
  options = list(comparisons = "all", test = "sidak"),
  note = "Šidák instead of Tukey.")

fixture("n-2",
  input = list(g1 = c(2, 9), g2 = c(5, 12), g3 = c(6, 15)),
  expr = repeated(complete_rows(g1, g2, g3), comps = "none"), setup = reference,
  options = list(comparisons = "none"),
  note = "The fewest rows the test can run on: two.")

fixture("five-treatments",
  input = list(g1 = c(2.1, 3.4, 1.9, 2.8, 3.0, 2.5, 3.3, 2.2, 2.7, 3.1), g2 = c(3.0, 4.1, 2.6, 3.5, 3.8, 3.1, 4.0, 2.9, 3.4, 3.9), g3 = c(1.8, 3.0, 1.5, 2.4, 2.6, 2.1, 2.9, 1.9, 2.3, 2.8), g4 = c(4.2, 5.0, 3.8, 4.6, 4.9, 4.3, 5.1, 4.0, 4.5, 5.0), g5 = c(2.5, 3.6, 2.0, 3.0, 3.2, 2.7, 3.5, 2.4, 2.9, 3.4)),
  expr = repeated(complete_rows(g1, g2, g3, g4, g5)), setup = reference, options = all_pairs,
  note = "Five treatments x 10 subjects: ten comparisons.")

fixture("high-sphericity-violation",
  input = list(g1 = c(1, 2, 3, 4, 5, 6, 7, 8), g2 = c(1.1, 2.2, 2.9, 4.2, 4.8, 6.3, 6.9, 8.1), g3 = c(10, 9, 12, 8, 15, 7, 20, 6), g4 = c(1.05, 2.1, 3.05, 3.9, 5.1, 5.9, 7.05, 8.2)),
  expr = repeated(complete_rows(g1, g2, g3, g4), comps = "none"), setup = reference,
  options = list(comparisons = "none"),
  note = "g3 swings independently of the others: a low epsilon, GG and HF P noticeably above the uncorrected one.")

# --- #83: comparisons without assuming sphericity (FAQ 1609's "new method") ---------------

indiv_all <- list(comparisons = "all", test = "tukey", sphericity = FALSE)

fixture("individual-basic",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4), sphericity = FALSE), setup = reference, options = indiv_all,
  note = "Same data as #50's basic fixture, Tukey, but each pair from just its own two columns.")

fixture("individual-bonferroni",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4), test = "bonferroni", sphericity = FALSE), setup = reference,
  options = list(comparisons = "all", test = "bonferroni", sphericity = FALSE),
  note = "The sphericity-free method with Bonferroni instead of Tukey.")

fixture("individual-sidak",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4), test = "sidak", sphericity = FALSE), setup = reference,
  options = list(comparisons = "all", test = "sidak", sphericity = FALSE),
  note = "The sphericity-free method with Šidák instead of Tukey.")

fixture("individual-control-dunnett",
  input = list(g1 = c(4.2, 3.6, 5.0, 3.9, 4.6, 4.1, 3.8, 4.4), g2 = c(5.1, 4.4, 5.9, 4.6, 5.4, 5.0, 4.5, 5.2), g3 = c(4.0, 3.4, 4.7, 3.7, 4.3, 3.9, 3.6, 4.2), g4 = c(6.2, 5.5, 7.0, 5.6, 6.5, 6.0, 5.4, 6.3)),
  expr = repeated(complete_rows(g1, g2, g3, g4), comps = "control", control = 1, test = "dunnett", sphericity = FALSE), setup = reference,
  options = list(comparisons = "control", control = 1, test = "dunnett", sphericity = FALSE),
  note = "The sphericity-free method against a control, Dunnett's test.")

fixture("individual-dropped-row",
  input = list(g1 = c(5.0, 4.2, NA, 3.8, 4.9, 4.4, 4.1, 4.6), g2 = c(6.1, 5.0, 6.8, NA, 5.9, 5.3, 5.5, 5.8), g3 = c(4.8, 4.0, 5.5, 3.2, 4.6, 4.1, 4.3, 4.5)),
  expr = repeated(complete_rows(g1, g2, g3), sphericity = FALSE), setup = reference, options = indiv_all,
  note = "Two dropped rows, sphericity-free method: each pair's own df still reflects the 6 complete rows.")

fixture("individual-ties",
  input = list(g1 = c(4.0, 4.0, 5.0, 5.0, 6.0, 6.0), g2 = c(4.5, 4.6, 5.4, 5.5, 6.3, 6.6), g3 = c(4.2, 4.1, 5.3, 5.2, 6.1, 6.0)),
  expr = repeated(complete_rows(g1, g2, g3), test = "sidak", sphericity = FALSE), setup = reference,
  options = list(comparisons = "all", test = "sidak", sphericity = FALSE),
  note = "Repeated values within columns (g1 and g3 each have tied pairs): no pair's own difference is constant, so t.test(paired = TRUE) still runs.")

fixture("individual-n-2",
  input = list(g1 = c(2, 9), g2 = c(5, 13), g3 = c(6, 15)),
  expr = repeated(complete_rows(g1, g2, g3), test = "bonferroni", sphericity = FALSE), setup = reference,
  options = list(comparisons = "all", test = "bonferroni", sphericity = FALSE),
  note = "The fewest rows the test can run on, sphericity-free: each pair's own df is 1.")

fixture("sphericity-divergence-pooled",
  input = list(g1 = c(1, 2, 3, 4, 5, 6, 7, 8), g2 = c(1.1, 2.2, 2.9, 4.2, 4.8, 6.3, 6.9, 8.1), g3 = c(10, 9, 12, 8, 15, 7, 20, 6), g4 = c(1.05, 2.1, 3.05, 3.9, 5.1, 5.9, 7.05, 8.2)),
  expr = repeated(complete_rows(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  note = "Same data as high-sphericity-violation, but with comparisons on: pooled method (paired with individual, below), so g3's wide independent swings inflate every pair's SE, including g1 vs. g4 (near-identical columns).")

fixture("sphericity-divergence-individual",
  input = list(g1 = c(1, 2, 3, 4, 5, 6, 7, 8), g2 = c(1.1, 2.2, 2.9, 4.2, 4.8, 6.3, 6.9, 8.1), g3 = c(10, 9, 12, 8, 15, 7, 20, 6), g4 = c(1.05, 2.1, 3.05, 3.9, 5.1, 5.9, 7.05, 8.2)),
  expr = repeated(complete_rows(g1, g2, g3, g4), sphericity = FALSE), setup = reference, options = indiv_all,
  note = "Same data as sphericity-divergence-pooled: the sphericity-free method gives g1 vs. g4 (near-identical columns) a far smaller SE, since g3's independent swings don't enter that pair's own difference -- the discriminating case FAQ 1609 describes.")
