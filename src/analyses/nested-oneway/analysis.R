# Nested one-way ANOVA (item 13, #67): the nested t test's REML mixed
# model (docs/design/13), generalised to three or more groups. Omnibus
# F from anova(); post-hoc comparisons via emmeans on the fitted model.
# No Welch/Brown-Forsythe variant: the mixed model already separates
# between- and within-replicate variance. `stop("bs: ...")` messages are
# shown to the user as written.

bs_nested_oneway_fit <- function(value, group_idx, replicate_idx, k) {
  d <- data.frame(
    value = value,
    group = factor(paste0("g", group_idx), levels = paste0("g", seq_len(k))),
    unit = factor(paste0(group_idx, "_", replicate_idx))
  )
  tryCatch(
    nlme::lme(value ~ group, random = ~1 | unit, data = d, method = "REML"),
    error = function(e) stop("bs: ", conditionMessage(e))
  )
}

# Post-hoc pairs, in the app's convention: i - j for every i < j (all
# pairs), or control - other (control case). emmeans labels its
# contrasts "gX - gY"; parsed back into indices rather than trusted by
# position, since adjust methods can reorder rows.
bs_nested_pairs <- function(fit, comps, control, test) {
  if (comps == "none") return(list())
  em <- emmeans::emmeans(fit, ~group)
  adjust <- if (test == "dunnett") "mvt" else test
  ct <- if (comps == "control") {
    emmeans::contrast(em, method = "trt.vs.ctrl", ref = control, adjust = adjust)
  } else {
    emmeans::contrast(em, method = "pairwise", adjust = adjust)
  }
  s <- as.data.frame(summary(ct, infer = c(TRUE, TRUE)))
  idx <- function(label) as.integer(sub("^g", "", label))
  flip <- comps == "control" # emmeans writes control comparisons as "other - control"
  lapply(seq_len(nrow(s)), function(x) {
    parts <- strsplit(as.character(s$contrast[x]), " - ", fixed = TRUE)[[1]]
    a <- idx(parts[1])
    b <- idx(parts[2])
    sign <- if (flip) -1 else 1
    list(
      i = if (flip) b else a, j = if (flip) a else b,
      diff = sign * s$estimate[x], se = s$SE[x], df = s$df[x],
      statistic = sign * s$t.ratio[x],
      ci_lower = if (flip) -s$upper.CL[x] else s$lower.CL[x],
      ci_upper = if (flip) -s$lower.CL[x] else s$upper.CL[x],
      p = s$p.value[x]
    )
  })
}

bs_nested_oneway <- function(value, group_idx, replicate_idx, k, comps, control, test) {
  n_rep <- vapply(seq_len(k), function(i) length(unique(replicate_idx[group_idx == i])), 0)
  if (any(n_rep < 2)) {
    stop("bs: Each group needs at least two replicates for a nested one-way ANOVA.")
  }
  fit <- bs_nested_oneway_fit(value, group_idx, replicate_idx, k)
  a <- anova(fit)
  fe <- unname(nlme::fixef(fit))
  means <- fe[1] + c(0, fe[-1])
  vc <- nlme::VarCorr(fit)
  n_values <- vapply(seq_len(k), function(i) sum(group_idx == i), 0)
  list(
    means = means,
    n_rep = n_rep,
    n_values = n_values,
    f = unname(a["group", "F-value"]),
    dfn = unname(a["group", "numDF"]),
    dfd = unname(a["group", "denDF"]),
    p = unname(a["group", "p-value"]),
    between_replicate_sd = as.numeric(vc["(Intercept)", "StdDev"]),
    within_replicate_sd = as.numeric(vc["Residual", "StdDev"]),
    comparisons = bs_nested_pairs(fit, comps, control, test)
  )
}
