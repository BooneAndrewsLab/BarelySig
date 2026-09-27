# Fixtures for repeated-measures two-way ANOVA, one factor repeated
# (item 22, #81), and its comparisons (item 24, #85). Independent of
# `analysis.R`'s hand SS decomposition: `aov()`'s own
# `Error(subject/repeated)` stratification for every SS/F/P (a different
# R function, the classical split-plot machinery, not the app's own
# formulas), `stats:::sphericity()` for epsilon (the same helper the
# app calls -- no independent epsilon implementation exists in any
# installed package; see design note 22). Comparisons are the textbook
# Tukey/Šidák/Bonferroni/Dunnett formulas, written out independently of
# the app's own copy in `oneway/analysis.R` (the same shape
# `repeated/oracle.R` already uses for the one-way case's comparisons,
# including its own `dunnett()`/`critical()` helpers, copied here), fed
# `ms_subjects`/`df_subjects`/`ms_residual`/`df_residual` straight from
# `aov()`'s own stratified table above -- never the app's
# `bs_comparisons`/`bs_apply_correction`. Input: `y` (subject-major, one
# subject's `q` values before the next subject's) and `level`, each
# subject's between-level (1..p); `n`, `p` and `q` are derived from
# those.

reference <- quote({
  alpha <- 0.05
  gauss <- local({
    i <- 1:11
    b <- i / sqrt(4 * i^2 - 1)
    e <- eigen(diag(0, 12) + `[<-`(matrix(0, 12, 12), cbind(c(i, i + 1), c(i + 1, i)), c(b, b)), symmetric = TRUE)
    list(x = e$values, w = 2 * e$vectors[1, ]^2)
  })
  on_pieces <- function(br) {
    a <- head(br, -1)
    h <- diff(br) / 2
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

  # Textbook Tukey/Bonferroni/Šidák/Dunnett over one family's own
  # means/sizes/error term (`mse`, `df`): the same four tests
  # `bs_apply_correction` computes, written out independently. `control`
  # is the control's 1-based position within `means`/`sizes` (unused
  # unless `test = "dunnett"`, `comps = "control"`).
  compare_family <- function(means, sizes, mse, df, comps, control, test) {
    k <- length(means)
    pairs <- unname(if (comps == "all") {
      do.call(rbind, lapply(seq_len(k - 1), function(i) cbind(i, (i + 1):k)))
    } else {
      cbind(control, seq_len(k)[-control])
    })
    K <- nrow(pairs)
    if (test == "dunnett") {
      others <- pairs[, 2]
      lam <- sqrt((1 / sizes[control]) / (1 / sizes[others] + 1 / sizes[control]))
      dunnett_crit <- critical(function(c) dunnett(c, lam, df))
    }
    lapply(seq_len(K), function(x) {
      i <- pairs[x, 1]
      j <- pairs[x, 2]
      dd <- means[i] - means[j]
      se <- sqrt(mse * (1 / sizes[i] + 1 / sizes[j]))
      t <- abs(dd) / se
      r <- switch(test,
        tukey = list(
          stat = sqrt(2) * t, p = ptukey(sqrt(2) * t, k, df, lower.tail = FALSE),
          half = qtukey(1 - alpha, k, df) / sqrt(2) * se
        ),
        bonferroni = list(
          stat = t, p = min(1, K * 2 * pt(t, df, lower.tail = FALSE)),
          half = qt(1 - alpha / (2 * K), df) * se
        ),
        sidak = {
          p1 <- 2 * pt(t, df, lower.tail = FALSE)
          list(stat = t, p = -expm1(K * log1p(-p1)), half = qt(1 - (1 - (1 - alpha)^(1 / K)) / 2, df) * se)
        },
        dunnett = list(stat = t, p = dunnett(t, lam, df), half = dunnett_crit * se)
      )
      list(
        i = i, j = j, diff = dd, se = se, df = df, statistic = r$stat,
        ci_lower = dd - r$half, ci_upper = dd + r$half, p = r$p
      )
    })
  }

  repeated_twoway <- function(y, level, family = "main-between", comps = "none", control = 1, test = "tukey") {
    n <- length(level)
    q <- length(y) / n
    p <- max(level)
    Y <- matrix(y, nrow = n, ncol = q, byrow = TRUE)
    level <- factor(level, levels = seq_len(p))
    n_a <- as.integer(table(level))
    subject <- factor(seq_len(n))
    long <- data.frame(
      y = as.vector(t(Y)),
      subject = rep(subject, each = q),
      between = rep(level, each = q),
      repeated = factor(rep(seq_len(q), n))
    )
    m <- aov(y ~ between * repeated + Error(subject / repeated), data = long)
    s <- summary(m)
    between_tbl <- s[["Error: subject"]][[1]]
    within_tbl <- s[["Error: subject:repeated"]][[1]]

    sph <- stats:::sphericity(stats::SSD(lm(Y ~ level)), X = ~1)
    # HF.eps is 0/0 (NaN) when q = 2 and the residual stratum's df is 1
  # (pp = q - 1 = 1 makes both the numerator and denominator vanish);
  # epsilon is analytically exactly 1 whenever q = 2 regardless (Prism's
  # own guide says so), so that is the fallback rather than propagating NaN.
  clamp <- function(e) if (is.nan(e)) 1 else max(1 / (q - 1), min(1, e))
    gg <- clamp(sph$GG.eps)
    hf <- clamp(sph$HF.eps)

    f_repeated <- within_tbl[["F value"]][1]
    f_interaction <- within_tbl[["F value"]][2]
    df_repeated <- within_tbl[["Df"]][1]
    df_interaction <- within_tbl[["Df"]][2]
    df_residual <- within_tbl[["Df"]][3]

    ms_subjects <- between_tbl[["Mean Sq"]][2]
    df_subjects <- between_tbl[["Df"]][2]
    ms_residual <- within_tbl[["Mean Sq"]][3]

    # Comparisons (item 24, #85): see the file header for why each
    # family's error term is derived straight from the stratified table
    # above, never the app's own `bs_comparisons`.
    families <- if (comps == "none") list() else {
      m_i <- rowMeans(Y)
      switch(family,
        "main-between" = list(list(
          level = NA_integer_,
          pairs = compare_family(unname(tapply(m_i, level, mean)), n_a, ms_subjects / q, df_subjects, comps, control, test)
        )),
        "main-repeated" = list(list(
          level = NA_integer_,
          pairs = compare_family(unname(colMeans(Y)), rep(n, q), ms_residual, df_residual, comps, control, test)
        )),
        "simple" = {
          mse <- (ms_subjects + (q - 1) * ms_residual) / q
          dfp <- mse^2 / ((ms_subjects / q)^2 / df_subjects + ((q - 1) * ms_residual / q)^2 / df_residual)
          lapply(seq_len(q), function(b) list(
            level = b,
            pairs = compare_family(unname(tapply(Y[, b], level, mean)), n_a, mse, dfp, comps, control, test)
          ))
        }
      )
    }

    list(
      p = p, q = q, n = n,
      between = list(
        ss = between_tbl[["Sum Sq"]][1], df = between_tbl[["Df"]][1],
        ms = between_tbl[["Mean Sq"]][1], f = between_tbl[["F value"]][1], p = between_tbl[["Pr(>F)"]][1]
      ),
      subjects = list(ss = between_tbl[["Sum Sq"]][2], df = between_tbl[["Df"]][2], ms = between_tbl[["Mean Sq"]][2]),
      repeated = list(ss = within_tbl[["Sum Sq"]][1], df = df_repeated, ms = within_tbl[["Mean Sq"]][1], f = f_repeated, p = within_tbl[["Pr(>F)"]][1]),
      interaction = list(ss = within_tbl[["Sum Sq"]][2], df = df_interaction, ms = within_tbl[["Mean Sq"]][2], f = f_interaction, p = within_tbl[["Pr(>F)"]][2]),
      residual = list(ss = within_tbl[["Sum Sq"]][3], df = df_residual, ms = within_tbl[["Mean Sq"]][3]),
      total = list(ss = sum((Y - mean(Y))^2), df = n * q - 1),
      gg_epsilon = gg, hf_epsilon = hf,
      repeated_gg_p = pf(f_repeated, df_repeated * gg, df_residual * gg, lower.tail = FALSE),
      repeated_hf_p = pf(f_repeated, df_repeated * hf, df_residual * hf, lower.tail = FALSE),
      interaction_gg_p = pf(f_interaction, df_interaction * gg, df_residual * gg, lower.tail = FALSE),
      interaction_hf_p = pf(f_interaction, df_interaction * hf, df_residual * hf, lower.tail = FALSE),
      families = families
    )
  }
})

balanced <- list(
  y = c(
    5.1, 6.0, 6.4, 4.9, 5.8, 6.6, 5.3, 6.2, 6.1, 4.7, 5.6, 6.0,
    8.2, 9.0, 8.6, 7.9, 8.7, 8.4, 8.5, 9.3, 8.8, 8.0, 8.6, 8.3
  ),
  level = c(1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2)
)

fixture("balanced",
  input = balanced, expr = repeated_twoway(y, level), setup = reference,
  options = list(repeatedFactor = "column"),
  note = "Two between-levels of 6 subjects each, 2 repeated levels: the common split-plot shape (row = between-subjects group, column = repeated measurement).")

unbalanced <- list(
  y = c(
    5.1, 6.0, 6.4, 4.9, 5.8, 6.6,
    8.2, 9.0, 8.6, 7.9, 8.7, 8.4, 8.5, 9.3,
    3.1, 3.6, 3.4, 2.9, 3.3, 3.5
  ),
  level = c(1, 1, 1, 2, 2, 2, 2, 3, 3, 3)
)

fixture("unbalanced",
  input = unbalanced, expr = repeated_twoway(y, level), setup = reference,
  options = list(repeatedFactor = "column"),
  note = "Three between-levels with unequal subject counts (3, 4, 3): the between-subjects and within-subjects formulas both handle unequal n_a.")

fixture("dropped-subject",
  input = list(
    y = c(
      5.1, 6.0, 6.4, 4.9, 5.8, 6.6, 5.3, 6.2,
      8.2, 9.0, 8.6, 7.9, 8.7, 8.4, 8.5, 9.3
    ),
    level = c(1, 1, 1, 1, 2, 2, 2, 2)
  ),
  expr = repeated_twoway(y, level), setup = reference,
  options = list(repeatedFactor = "column"),
  note = "The app's own request already drops an incomplete subject (matchedGroups' rule); this fixture is what remains after that, so it looks the same as a smaller balanced case.")

fixture("fewest-subjects",
  input = list(
    y = c(4.0, 5.2, 4.6, 5.9, 6.9, 5.0, 8.4, 9.1),
    level = c(1, 1, 2, 3)
  ),
  expr = repeated_twoway(y, level), setup = reference,
  options = list(repeatedFactor = "column"),
  note = "n = p + 1 (3 between-levels, 4 subjects total, one level with two subjects): the fewest subjects the between-subjects stratum can run on, df(subjects) = 1.")

fixture("two-repeated-levels",
  input = list(
    y = c(4.1, 5.0, 4.4, 5.3, 4.8, 5.6, 3.9, 4.7, 5.2, 6.0, 5.6, 6.3),
    level = c(1, 1, 1, 2, 2, 2)
  ),
  expr = repeated_twoway(y, level), setup = reference,
  options = list(repeatedFactor = "column"),
  note = "q = 2 repeated levels: epsilon is forced to 1 by the clamp, so every P is identical (as the one-way module's own q = 2 case, note 17).")

fixture("row-repeated",
  input = list(
    y = c(
      5.1, 6.0, 6.4, 4.9, 5.8, 6.6, 5.3, 6.2, 6.1, 4.7, 5.6, 6.0,
      8.2, 9.0, 8.6, 7.9, 8.7, 8.4, 8.5, 9.3, 8.8, 8.0, 8.6, 8.3
    ),
    level = c(1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2)
  ),
  expr = repeated_twoway(y, level), setup = reference,
  options = list(repeatedFactor = "row"),
  note = "Same shape as 'balanced' but the app builds `y`/`level` from the row-repeated path (subject = subcolumn of a data set, matched across rows): catches a transposition bug rather than trusting the two paths are symmetric by inspection.")

# --- #85: comparisons ---------------------------------------------------

# Three between-levels (n_a = 3, 4, 3, unequal), q = 3 repeated levels:
# exercises every family's own n_a- or q-aware error term on the same
# unbalanced shape note 22's own ANOVA fixture uses.
three_repeated <- list(
  y = c(
    5.1, 6.0, 6.9, 4.9, 5.8, 6.6, 5.3, 6.2, 7.0,
    8.2, 9.0, 9.7, 7.9, 8.7, 9.4, 8.5, 9.3, 10.1, 8.0, 8.8, 9.5,
    3.1, 3.6, 4.0, 2.9, 3.3, 3.7, 3.4, 3.9, 4.3
  ),
  level = c(1, 1, 1, 2, 2, 2, 2, 3, 3, 3)
)

fixture("comparisons-main-between-tukey",
  input = unbalanced,
  expr = repeated_twoway(y, level, family = "main-between", comps = "all", test = "tukey"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "main-between", comparisons = "all", test = "tukey"),
  note = "Between-subjects factor's marginal means, all-pairs Tukey, on the unequal-n_a dataset (note 22's own unbalanced fixture): exercises MS(subjects) / q with unequal group sizes.")

fixture("comparisons-main-repeated-tukey",
  input = three_repeated,
  expr = repeated_twoway(y, level, family = "main-repeated", comps = "all", test = "tukey"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "main-repeated", comparisons = "all", test = "tukey"),
  note = "Repeated factor's marginal means (q = 3, three pairs), pooled within-subject error (MS(residual)).")

fixture("comparisons-simple-tukey",
  input = three_repeated,
  expr = repeated_twoway(y, level, family = "simple", comps = "all", test = "tukey"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "simple", comparisons = "all", test = "tukey"),
  note = "Between-subjects factor's levels within each of the 3 repeated levels (simple effects), unequal n_a: the split-plot combined error term and its Satterthwaite df, one family per repeated level.")

fixture("comparisons-control-dunnett",
  input = unbalanced,
  expr = repeated_twoway(y, level, family = "main-between", comps = "control", control = 1, test = "dunnett"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "main-between", comparisons = "control", control = 1, test = "dunnett"),
  note = "Against a control between-subjects level, Dunnett's test: two comparisons with a shared control, unequal n_a.")

fixture("comparisons-simple-bonferroni",
  input = unbalanced,
  expr = repeated_twoway(y, level, family = "simple", comps = "all", test = "bonferroni"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "simple", comparisons = "all", test = "bonferroni"),
  note = "Simple effects (3 between-subjects levels within each of 2 repeated levels), Bonferroni instead of Tukey.")

fixture("comparisons-main-repeated-sidak",
  input = three_repeated,
  expr = repeated_twoway(y, level, family = "main-repeated", comps = "all", test = "sidak"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "main-repeated", comparisons = "all", test = "sidak"),
  note = "Repeated factor's marginal means, Šidák instead of Tukey.")

fixture("comparisons-dropped-subject",
  input = list(
    y = c(
      5.1, 6.0, 6.4, 4.9, 5.8, 6.6, 5.3, 6.2,
      8.2, 9.0, 8.6, 7.9, 8.7, 8.4, 8.5, 9.3
    ),
    level = c(1, 1, 1, 1, 2, 2, 2, 2)
  ),
  expr = repeated_twoway(y, level, family = "simple", comps = "all", test = "tukey"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "simple", comparisons = "all", test = "tukey"),
  note = "The app's own request already drops an incomplete subject before this runs (matchedGroups' rule); this fixture is what remains, with comparisons on.")

fixture("comparisons-two-repeated-levels",
  input = list(
    y = c(4.1, 5.0, 4.4, 5.3, 4.8, 5.6, 3.9, 4.7, 5.2, 6.0, 5.6, 6.3),
    level = c(1, 1, 1, 2, 2, 2)
  ),
  expr = repeated_twoway(y, level, family = "main-repeated", comps = "all", test = "tukey"),
  setup = reference,
  options = list(repeatedFactor = "column", family = "main-repeated", comparisons = "all", test = "tukey"),
  note = "q = 2: epsilon is forced to 1 (note 22), but comparisons don't depend on epsilon at all -- the single pair's P is identical with or without the correction.")
