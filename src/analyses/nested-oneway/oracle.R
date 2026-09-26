# Fixtures for the nested one-way ANOVA (item 13, #67). The omnibus
# fixed-effect test is independent of the app's own package: lme4 (not
# nlme) plus a textbook Wald F over the model's own vcov and a
# containment df formula, cross-checked here against nlme's anova().
# Post-hoc comparisons are computed via nlme + emmeans -- the same path
# the app takes -- because emmeans' default denominator-df method
# differs between an lme4 fit (Kenward-Roger) and an nlme fit
# (containment): forcing the two packages to agree there would mean
# comparing genuinely different, both-legitimate df approximations, not
# catching a bug. This is an established, shared layer (CLAUDE.md, "an
# established runtime, not hand-written statistics"), not independently
# re-derived; the omnibus test above is the independent check that
# matters most (whether the groups differ at all).
#
# Differences are i - j (group i minus group j, i < j), or control -
# other, as the ordinary one-way ANOVA's comparisons are reported.

reference <- quote({
  same <- function(x, y, tol = 1e-4) stopifnot(isTRUE(all.equal(unname(x), unname(y), tolerance = tol)))

  frame <- function(value, group_idx, replicate_idx, k) {
    data.frame(
      value = value,
      group = factor(paste0("g", group_idx), levels = paste0("g", seq_len(k))),
      unit = factor(paste0(group_idx, "_", replicate_idx))
    )
  }

  # The pairwise/control comparisons, in the app's i - j (or control -
  # other) convention: shared between the reference and the app (see the
  # file header) -- takes whichever already-fitted model (lme4 or nlme)
  # is passed in, so the two independent checks below can each supply
  # their own.
  pairs_from <- function(fit, comps, control, test) {
    em <- emmeans::emmeans(fit, ~group)
    adjust <- if (test == "dunnett") "mvt" else test
    ct <- if (comps == "control") {
      emmeans::contrast(em, method = "trt.vs.ctrl", ref = control, adjust = adjust)
    } else {
      emmeans::contrast(em, method = "pairwise", adjust = adjust)
    }
    s <- as.data.frame(summary(ct, infer = c(TRUE, TRUE)))
    idxof <- function(label) as.integer(sub("^g", "", label))
    flip <- comps == "control"
    lapply(seq_len(nrow(s)), function(x) {
      parts <- strsplit(as.character(s$contrast[x]), " - ", fixed = TRUE)[[1]]
      a <- idxof(parts[1])
      b2 <- idxof(parts[2])
      sign <- if (flip) -1 else 1
      list(
        i = if (flip) b2 else a, j = if (flip) a else b2,
        diff = sign * s$estimate[x], se = s$SE[x], df = s$df[x],
        statistic = sign * s$t.ratio[x],
        ci_lower = if (flip) -s$upper.CL[x] else s$lower.CL[x],
        ci_upper = if (flip) -s$lower.CL[x] else s$upper.CL[x],
        p = s$p.value[x]
      )
    })
  }

  oneway <- function(value, group_idx, replicate_idx, k, comps, control, test) {
    n_rep <- vapply(seq_len(k), function(i) length(unique(replicate_idx[group_idx == i])), 0)
    d <- frame(value, group_idx, replicate_idx, k)

    # The omnibus test, independent of the app's own package (nlme): a
    # different package (lme4) plus a textbook Wald F test of the k - 1
    # group coefficients jointly over the model's own vcov, and a
    # containment df formula (independent replicate-level units minus
    # fixed-effect parameters -- the same as the nested t test's).
    fit4 <- lme4::lmer(value ~ group + (1 | unit), data = d, REML = TRUE)
    fe <- unname(lme4::fixef(fit4))
    means <- fe[1] + c(0, fe[-1])
    dfd <- sum(n_rep) - k
    idx <- 2:k
    b <- fe[idx]
    Vb <- as.matrix(vcov(fit4))[idx, idx, drop = FALSE]
    f <- as.numeric(t(b) %*% solve(Vb) %*% b) / (k - 1)
    p <- pf(f, k - 1, dfd, lower.tail = FALSE)

    # Post-hoc comparisons: nlme + emmeans, the app's own path (see the
    # file header for why this isn't independently re-derived here).
    fit <- nlme::lme(value ~ group, random = ~1 | unit, data = d, method = "REML")
    vc <- nlme::VarCorr(fit)
    list(
      means = means, n_rep = n_rep,
      n_values = vapply(seq_len(k), function(i) sum(group_idx == i), 0),
      f = f, dfn = k - 1, dfd = dfd, p = p,
      between_replicate_sd = as.numeric(vc["(Intercept)", "StdDev"]),
      within_replicate_sd = as.numeric(vc["Residual", "StdDev"]),
      comparisons = pairs_from(fit, comps, control, test)
    )
  }

  # Cross-checks the omnibus test against nlme's own anova() (the app's
  # package, fit the ordinary way): a second, independent route to the
  # same F test.
  check_nlme <- function(value, group_idx, replicate_idx, k, expected) {
    d <- frame(value, group_idx, replicate_idx, k)
    fit <- nlme::lme(value ~ group, random = ~1 | unit, data = d, method = "REML")
    a <- anova(fit)
    same(expected$f, unname(a["group", "F-value"]))
    same(expected$dfd, unname(a["group", "denDF"]))
    same(expected$p, unname(a["group", "p-value"]))
    TRUE
  }
})

check_only <- quote(check_nlme(value, group_idx, replicate_idx, k, expected))

tukey_all <- list(comparisons = "all", test = "tukey")
dunnett_control_1 <- list(comparisons = "control", control = 1, test = "dunnett")
bonferroni_all <- list(comparisons = "all", test = "bonferroni")
sidak_control_3 <- list(comparisons = "control", control = 3, test = "sidak")

# --- three balanced groups, all-pairs Tukey ---
fixture(
  "balanced-three-groups-tukey",
  input = list(
    value = c(
      9.8, 10.3, 9.6, 10.1, 10.8, 11.2, 10.9, 11.5, 8.9, 9.4, 9.1, 9.7,
      12.6, 13.4, 12.9, 13.1, 11.8, 12.2, 11.6, 12.4,
      15.1, 15.6, 14.9, 15.3, 14.2, 14.6, 14.0, 14.4
    ),
    group_idx = c(rep(1, 12), rep(2, 8), rep(3, 8)),
    replicate_idx = c(
      rep(1, 4), rep(2, 4), rep(3, 4),
      rep(1, 4), rep(2, 4),
      rep(1, 4), rep(2, 4)
    ),
    k = 3
  ),
  expr = oneway(value, group_idx, replicate_idx, k, "all", 1, "tukey"),
  setup = reference,
  options = tukey_all,
  check = check_only,
  check_packages = c("nlme"),
  packages = c("lme4", "nlme", "emmeans"),
  tolerance = 1e-4,
  note = "Three balanced groups, four replicates each with four values: all-pairs Tukey comparisons."
)

# --- unbalanced replicate counts, control comparisons (Dunnett) ---
fixture(
  "unbalanced-control-dunnett",
  input = list(
    value = c(
      9.8, 10.3, 9.6, 10.1, 10.0, 11.2, 10.8, 8.9, 9.4, 9.1, 9.7, 9.0, 9.3,
      12.6, 13.4, 12.9, 11.8, 12.2, 11.6, 12.4, 12.0,
      15.1, 15.6, 14.9, 15.3, 14.2
    ),
    group_idx = c(rep(1, 13), rep(2, 8), rep(3, 5)),
    replicate_idx = c(
      rep(1, 5), rep(2, 2), rep(3, 6),
      rep(1, 3), rep(2, 5),
      rep(1, 3), rep(2, 2)
    ),
    k = 3
  ),
  expr = oneway(value, group_idx, replicate_idx, k, "control", 1, "dunnett"),
  setup = reference,
  options = dunnett_control_1,
  check = check_only,
  check_packages = c("nlme"),
  packages = c("lme4", "nlme", "emmeans"),
  tolerance = 1e-4,
  note = "Replicate counts and sizes differ across three groups; control comparisons (Dunnett) against group 1."
)

# --- minimum: three groups, two replicates each, Bonferroni all-pairs ---
fixture(
  "minimum-replicates-bonferroni",
  input = list(
    value = c(
      4.1, 4.3, 6.0, 6.2,
      8.0, 8.4, 10.1, 9.8,
      12.0, 12.4, 14.1, 13.9
    ),
    group_idx = c(1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3),
    replicate_idx = c(1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2),
    k = 3
  ),
  expr = oneway(value, group_idx, replicate_idx, k, "all", 1, "bonferroni"),
  setup = reference,
  options = bonferroni_all,
  check = check_only,
  check_packages = c("nlme"),
  packages = c("lme4", "nlme", "emmeans"),
  tolerance = 1e-4,
  note = "Two replicates per group, the minimum a nested one-way ANOVA can run on."
)

# --- four groups, Sidak control comparisons, ragged replicate sizes ---
fixture(
  "four-groups-sidak-control",
  input = list(
    value = c(
      20.1, 20.4, 19.8, 21.0, 22.5,
      25.0, 25.6, 24.8, 26.9, 27.3, 26.1,
      18.2, 18.6, 17.9,
      30.5, 31.0, 30.2, 29.8, 31.4, 30.9
    ),
    group_idx = c(rep(1, 5), rep(2, 6), rep(3, 3), rep(4, 6)),
    replicate_idx = c(
      1, 1, 1, 2, 3,
      1, 1, 1, 2, 3, 3,
      1, 2, 2,
      1, 1, 2, 2, 3, 3
    ),
    k = 4
  ),
  expr = oneway(value, group_idx, replicate_idx, k, "control", 3, "sidak"),
  setup = reference,
  options = sidak_control_3,
  check = check_only,
  check_packages = c("nlme"),
  packages = c("lme4", "nlme", "emmeans"),
  tolerance = 1e-4,
  note = "Four groups, ragged replicate sizes, control is group 3 (not the first): Sidak-adjusted comparisons."
)
