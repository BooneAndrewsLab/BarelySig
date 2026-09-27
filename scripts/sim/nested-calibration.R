# How often each candidate test for a Nested table says P < 0.05 when
# there is no difference at all (note 14). Run in the oracle env:
#   mamba run -n barelysig-r Rscript scripts/sim/nested-calibration.R
# A well-calibrated test says so about 5% of the time.
suppressMessages(library(nlme))
set.seed(14)
R <- 1500

# Matched: the same k experiments (replicates) under both conditions.
# sb: experiment-to-experiment SD, su: SD of one condition within one
# experiment, se: cell-to-cell SD; m cells per replicate.
matched <- function(k, m, sb, su, se) {
  res <- replicate(R, {
    rep <- rep(seq_len(k), each = 2 * m)
    grp <- rep(rep(1:2, each = m), k)
    v <- rnorm(k, 0, sb)[rep] + rnorm(2 * k, 0, su)[(rep - 1) * 2 + grp] + rnorm(length(rep), 0, se)
    d <- data.frame(v, group = factor(grp), replicate = factor(rep))
    p_lme <- tryCatch(
      summary(lme(v ~ group, random = ~1 | replicate/group, data = d, method = "REML"))$tTable[2, 5],
      error = function(e) NA
    )
    mm <- tapply(v, list(rep, grp), mean)
    c(p_lme < 0.05, t.test(mm[, 1], mm[, 2], paired = TRUE)$p.value < 0.05)
  })
  r <- rowMeans(res, na.rm = TRUE)
  cat(sprintf("matched   k=%d m=%d sb=%.1f su=%.1f se=%.1f   REML mixed model %.3f   paired t on replicate means %.3f\n", k, m, sb, su, se, r[1], r[2]))
}

# Unmatched: k different replicates per condition (the nested t test).
unmatched <- function(k, m, su, se) {
  res <- replicate(R, {
    grp <- rep(1:2, each = k * m)
    unit <- rep(seq_len(2 * k), each = m)
    v <- rnorm(2 * k, 0, su)[unit] + rnorm(length(unit), 0, se)
    d <- data.frame(v, group = factor(grp), unit = factor(unit))
    p_lme <- summary(lme(v ~ group, random = ~1 | unit, data = d, method = "REML"))$tTable[2, 5]
    mm <- tapply(v, unit, mean)
    g <- tapply(grp, unit, `[`, 1)
    c(p_lme < 0.05, t.test(mm[g == 1], mm[g == 2], var.equal = TRUE)$p.value < 0.05)
  })
  r <- rowMeans(res)
  cat(sprintf("unmatched k=%d m=%d su=%.1f se=%.1f           REML mixed model %.3f   t on replicate means %.3f\n", k, m, su, se, r[1], r[2]))
}

matched(3, 30, 5, 1, 7)
matched(3, 30, 0.5, 1, 7)
matched(3, 30, 5, 3, 7)
matched(3, 30, 0, 0.5, 7)
matched(5, 30, 2, 1, 7)
matched(3, 30, 2, 0, 7)
unmatched(3, 30, 3, 7)
unmatched(3, 30, 0.5, 7)
unmatched(3, 30, 0, 7)
unmatched(5, 10, 1, 7)
