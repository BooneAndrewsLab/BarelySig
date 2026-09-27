# Fixtures for repeated-measures two-way ANOVA, one factor repeated
# (item 22, #81). Independent of `analysis.R`'s hand SS decomposition:
# `aov()`'s own `Error(subject/repeated)` stratification for every
# SS/F/P (a different R function, the classical split-plot machinery,
# not the app's own formulas), `stats:::sphericity()` for epsilon (the
# same helper the app calls -- no independent epsilon implementation
# exists in any installed package; see design note 22). Input: `y`
# (subject-major, one subject's `q` values before the next subject's)
# and `level`, each subject's between-level (1..p); `n`, `p` and `q`
# are derived from those.

reference <- quote({
  repeated_twoway <- function(y, level) {
    n <- length(level)
    q <- length(y) / n
    p <- max(level)
    Y <- matrix(y, nrow = n, ncol = q, byrow = TRUE)
    level <- factor(level, levels = seq_len(p))
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
      interaction_hf_p = pf(f_interaction, df_interaction * hf, df_residual * hf, lower.tail = FALSE)
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
