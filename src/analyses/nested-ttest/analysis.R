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
