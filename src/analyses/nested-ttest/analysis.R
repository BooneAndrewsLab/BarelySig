# Nested t test (item 13, #66): a REML mixed model, group fixed,
# replicate nested random within group. `stop("bs: ...")` messages are
# shown to the user as written. Differences are B - A, as the other t
# tests report them.
#
# Replicate is nested random *within* group, collapsed into a single
# interaction factor (`unit`): nlme's own nesting operator
# (`random = ~1 | group/replicate`) would add a second, unwanted
# variance component for group itself, which is already a fixed effect
# here, and gives a degenerate df and a NaN P (docs/design/13).

bs_nested_ttest <- function(a_value, a_replicate, b_value, b_replicate) {
  n_rep_a <- length(unique(a_replicate))
  n_rep_b <- length(unique(b_replicate))
  if (n_rep_a < 2 || n_rep_b < 2) {
    stop("bs: Each group needs at least two replicates for a nested t test.")
  }
  df <- data.frame(
    value = c(a_value, b_value),
    group = factor(c(rep("a", length(a_value)), rep("b", length(b_value))), levels = c("a", "b")),
    unit = factor(c(paste0("a", a_replicate), paste0("b", b_replicate)))
  )
  fit <- tryCatch(
    nlme::lme(value ~ group, random = ~1 | unit, data = df, method = "REML"),
    error = function(e) stop("bs: ", conditionMessage(e))
  )
  s <- summary(fit)$tTable
  ci <- nlme::intervals(fit, which = "fixed")$fixed
  fe <- nlme::fixef(fit)
  vc <- nlme::VarCorr(fit)
  list(
    t = unname(s["groupb", "t-value"]),
    df = unname(s["groupb", "DF"]),
    p_two = unname(s["groupb", "p-value"]),
    difference = unname(s["groupb", "Value"]),
    se_difference = unname(s["groupb", "Std.Error"]),
    ci_lower = unname(ci["groupb", "lower"]),
    ci_upper = unname(ci["groupb", "upper"]),
    mean_a = unname(fe["(Intercept)"]),
    mean_b = unname(fe["(Intercept)"] + fe["groupb"]),
    n_rep_a = n_rep_a, n_rep_b = n_rep_b,
    n_values_a = length(a_value), n_values_b = length(b_value),
    between_replicate_sd = as.numeric(vc["(Intercept)", "StdDev"]),
    within_replicate_sd = as.numeric(vc["Residual", "StdDev"])
  )
}

# Matched (note 14, #70): replicate n is the same experiment in both
# groups (prepare() keeps only replicates with values in both, in the
# same order), so the replicate means pair up: a paired t test on them,
# as Lord et al. 2020 compute a SuperPlot's P. Chosen over a REML model
# with a random experiment effect, which was far too conservative in
# simulation (scripts/sim/nested-calibration.R).
bs_nested_ttest_matched <- function(a_value, a_replicate, b_value, b_replicate) {
  ma <- as.numeric(tapply(a_value, a_replicate, mean))
  mb <- as.numeric(tapply(b_value, b_replicate, mean))
  n <- length(ma)
  if (n < 2 || length(mb) != n) {
    stop("bs: A matched nested t test needs at least two replicates with values in both groups.")
  }
  d <- mb - ma
  if (sd(d) == 0) {
    stop("bs: Every replicate's mean differs by exactly the same amount between the groups, so there is no variation to compare it with; a matched t test can't be computed.")
  }
  r <- t.test(mb, ma, paired = TRUE)
  pairing <- if (n > 2 && sd(ma) > 0 && sd(mb) > 0) {
    ct <- cor.test(ma, mb, alternative = "greater")
    list(pairing_r = unname(ct$estimate), pairing_p = ct$p.value)
  } else {
    list(pairing_r = NA_real_, pairing_p = NA_real_)
  }
  c(list(
    t = unname(r$statistic),
    df = unname(r$parameter),
    p_two = r$p.value,
    difference = mean(d),
    se_difference = r$stderr,
    ci_lower = r$conf.int[1],
    ci_upper = r$conf.int[2],
    mean_a = mean(ma),
    mean_b = mean(mb),
    n_rep_a = n, n_rep_b = n,
    n_values_a = length(a_value), n_values_b = length(b_value),
    sd_difference = sd(d)
  ), pairing)
}
