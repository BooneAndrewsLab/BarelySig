# Fixtures for repeated-measures two-way ANOVA, both factors repeated
# (item 23, #84). Independent of `analysis.R`'s hand SS decomposition:
# `aov()`'s own `Error(subject/(row*col))` stratification for every
# SS/F/P (a different R function than the app's own formulas, the
# classical fully-within-subjects machinery), `stats:::sphericity()`
# for each term's own epsilon (the same helper the app calls -- no
# independent per-term epsilon implementation exists in any installed
# package; see design note 23). Input: `y` (subject-major, each
# subject's `p*q` values row-major -- row *i*'s `q` values before row
# *i*+1's) and `n`, `p`, `q`.

reference <- quote({
  repeated_twoway_both <- function(y, n, p, q) {
    Ywide <- matrix(y, nrow = n, ncol = p * q, byrow = TRUE)
    idata <- expand.grid(col = factor(seq_len(q)), row = factor(seq_len(p)))
    long <- data.frame(
      y = as.vector(t(Ywide)),
      subject = rep(factor(seq_len(n)), each = p * q),
      row = rep(idata$row, n),
      col = rep(idata$col, n)
    )
    m <- aov(y ~ row * col + Error(subject / (row * col)), data = long)
    s <- summary(m)
    subj_tbl <- s[["Error: subject"]][[1]]
    row_tbl <- s[["Error: subject:row"]][[1]]
    col_tbl <- s[["Error: subject:col"]][[1]]
    int_tbl <- s[["Error: subject:row:col"]][[1]]

    ssd <- stats::SSD(lm(Ywide ~ 1))
    clamp <- function(e, pp) if (is.nan(e)) 1 else max(1 / pp, min(1, e))
    eps <- function(M, X, pp) {
      sph <- stats:::sphericity(ssd, M = M, X = X, idata = idata)
      list(gg = clamp(sph$GG.eps, pp), hf = clamp(sph$HF.eps, pp))
    }
    df_row <- row_tbl[["Df"]][1]
    df_col <- col_tbl[["Df"]][1]
    df_inter <- int_tbl[["Df"]][1]
    row_eps <- eps(~row, ~1, df_row)
    col_eps <- eps(~col, ~1, df_col)
    inter_eps <- eps(~ row * col, ~ row + col, df_inter)

    f_row <- row_tbl[["F value"]][1]
    f_col <- col_tbl[["F value"]][1]
    f_inter <- int_tbl[["F value"]][1]
    df_row_err <- row_tbl[["Df"]][2]
    df_col_err <- col_tbl[["Df"]][2]
    df_inter_err <- int_tbl[["Df"]][2]

    list(
      p = p, q = q, n = n,
      subjects = list(
        ss = subj_tbl[["Sum Sq"]][1], df = subj_tbl[["Df"]][1], ms = subj_tbl[["Mean Sq"]][1]
      ),
      row = list(
        ss = row_tbl[["Sum Sq"]][1], df = df_row, ms = row_tbl[["Mean Sq"]][1],
        f = f_row, p = row_tbl[["Pr(>F)"]][1]
      ),
      row_error = list(
        ss = row_tbl[["Sum Sq"]][2], df = df_row_err, ms = row_tbl[["Mean Sq"]][2],
        gg_epsilon = row_eps$gg, hf_epsilon = row_eps$hf,
        gg_p = pf(f_row, df_row * row_eps$gg, df_row_err * row_eps$gg, lower.tail = FALSE),
        hf_p = pf(f_row, df_row * row_eps$hf, df_row_err * row_eps$hf, lower.tail = FALSE)
      ),
      column = list(
        ss = col_tbl[["Sum Sq"]][1], df = df_col, ms = col_tbl[["Mean Sq"]][1],
        f = f_col, p = col_tbl[["Pr(>F)"]][1]
      ),
      column_error = list(
        ss = col_tbl[["Sum Sq"]][2], df = df_col_err, ms = col_tbl[["Mean Sq"]][2],
        gg_epsilon = col_eps$gg, hf_epsilon = col_eps$hf,
        gg_p = pf(f_col, df_col * col_eps$gg, df_col_err * col_eps$gg, lower.tail = FALSE),
        hf_p = pf(f_col, df_col * col_eps$hf, df_col_err * col_eps$hf, lower.tail = FALSE)
      ),
      interaction = list(
        ss = int_tbl[["Sum Sq"]][1], df = df_inter, ms = int_tbl[["Mean Sq"]][1],
        f = f_inter, p = int_tbl[["Pr(>F)"]][1]
      ),
      interaction_error = list(
        ss = int_tbl[["Sum Sq"]][2], df = df_inter_err, ms = int_tbl[["Mean Sq"]][2],
        gg_epsilon = inter_eps$gg, hf_epsilon = inter_eps$hf,
        gg_p = pf(f_inter, df_inter * inter_eps$gg, df_inter_err * inter_eps$gg, lower.tail = FALSE),
        hf_p = pf(f_inter, df_inter * inter_eps$hf, df_inter_err * inter_eps$hf, lower.tail = FALSE)
      ),
      total = list(ss = sum((Ywide - mean(Ywide))^2), df = p * q * n - 1)
    )
  }
})

balanced <- list(
  y = c(
    5.1, 6.0, 4.9, 5.8, 8.2, 9.0,
    5.3, 6.2, 4.7, 5.6, 8.5, 9.3,
    6.1, 5.4, 5.9, 6.7, 9.4, 8.6,
    4.8, 5.5, 5.1, 5.9, 8.0, 8.7,
    5.6, 6.4, 5.3, 6.1, 8.8, 9.6,
    6.3, 7.0, 5.8, 6.6, 9.2, 10.0,
    4.5, 5.2, 4.6, 5.4, 7.9, 8.5,
    5.9, 6.7, 5.5, 6.3, 8.9, 9.7
  ),
  n = 8, p = 3, q = 2
)

fixture("balanced",
  input = balanced, expr = repeated_twoway_both(y, n, p, q), setup = reference,
  note = "3 rows x 2 columns, 8 subjects, every subject measured at every cell: the common shape for both factors repeated.")

fixture("dropped-subject",
  input = list(
    y = c(
      5.1, 6.0, 4.9, 5.8, 8.2, 9.0,
      5.3, 6.2, 4.7, 5.6, 8.5, 9.3,
      6.1, 5.4, 5.9, 6.7, 9.4, 8.6,
      4.8, 5.5, 5.1, 5.9, 8.0, 8.7,
      5.6, 6.4, 5.3, 6.1, 8.8, 9.6,
      6.3, 7.0, 5.8, 6.6, 9.2, 10.0
    ),
    n = 6, p = 3, q = 2
  ),
  expr = repeated_twoway_both(y, n, p, q), setup = reference,
  note = "The app's own request already drops a subject missing a value at any cell (groupedFullyMatchedSubjects' rule); this fixture is what remains after that, so it looks the same as a smaller balanced case.")

fixture("fewest-subjects",
  input = list(
    y = c(
      4.0, 5.2, 4.6, 5.9,
      6.9, 5.0, 8.4, 9.1
    ),
    n = 2, p = 2, q = 2
  ),
  expr = repeated_twoway_both(y, n, p, q), setup = reference,
  note = "n = 2, the fewest subjects a fully within-subjects design can run on: every stratum's residual df is 1, so Huynh-Feldt epsilon comes back NaN on every term and falls back to 1 through the clamp.")

fixture("asymmetric-levels",
  input = list(
    y = c(
      4.0, 5.2, 3.9, 6.9, 5.0, 8.4,
      4.6, 5.9, 4.4, 7.3, 5.5, 8.9,
      3.7, 4.9, 3.6, 6.6, 4.7, 8.1,
      4.4, 5.6, 4.1, 7.1, 5.3, 8.7,
      3.9, 5.1, 3.8, 6.8, 4.9, 8.3
    ),
    n = 5, p = 2, q = 3
  ),
  expr = repeated_twoway_both(y, n, p, q), setup = reference,
  note = "p = 2, q = 3 (unequal factor sizes): row's own epsilon (df = 1, forced to 1) is visibly different from column's and the interaction's own (df = 2), catching a bug that shared one epsilon across terms.")

fixture("larger-balanced",
  input = list(
    y = c(
      5.1, 6.0, 6.4, 4.9, 5.8, 6.6,
      5.3, 6.2, 6.1, 4.7, 5.6, 6.0,
      5.0, 5.9, 6.2, 5.1, 5.7, 6.3,
      4.8, 5.7, 6.0, 4.6, 5.4, 5.9,
      5.5, 6.3, 6.7, 5.2, 6.0, 6.8,
      5.2, 6.1, 6.3, 4.8, 5.9, 6.4,
      4.9, 5.8, 6.1, 4.5, 5.5, 6.1,
      5.4, 6.2, 6.6, 5.0, 5.8, 6.5,
      5.0, 5.9, 6.2, 4.6, 5.6, 6.2,
      5.6, 6.4, 6.8, 5.3, 6.1, 6.9
    ),
    n = 10, p = 2, q = 3
  ),
  expr = repeated_twoway_both(y, n, p, q), setup = reference,
  note = "A larger, more realistic sample (n = 10, p = 2, q = 3) where every GG epsilon sits comfortably inside (0, 1) with no clamping in play.")
