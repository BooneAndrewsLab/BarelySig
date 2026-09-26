# Fixtures for the nested t test (item 13, #66). The reference computes
# the fixed effect via lme4 (a package independent of the app's own
# nlme), and the degrees of freedom from the textbook containment formula
# for a single random effect nested purely inside a fixed factor
# (independent replicate-level units minus fixed-effect parameters) --
# not from either package's internals. `check` cross-references the
# app's own package (nlme) for consistency, and, on a balanced case,
# GraphPad's documented equivalence: with no missing values, the nested
# test agrees exactly with an ordinary t test on each replicate's mean
# (checked here against a plain, independent per-replicate average).
#
# Differences are B - A, as the other t tests report them.

reference <- quote({
  same <- function(x, y, tol = 1e-6) stopifnot(isTRUE(all.equal(unname(x), unname(y), tolerance = tol)))

  frame <- function(a_value, a_replicate, b_value, b_replicate) {
    data.frame(
      value = c(a_value, b_value),
      group = factor(c(rep("a", length(a_value)), rep("b", length(b_value))), levels = c("a", "b")),
      unit = factor(c(paste0("a", a_replicate), paste0("b", b_replicate)))
    )
  }

  nested <- function(a_value, a_replicate, b_value, b_replicate) {
    n_rep_a <- length(unique(a_replicate))
    n_rep_b <- length(unique(b_replicate))
    d <- frame(a_value, a_replicate, b_value, b_replicate)
    fit <- lme4::lmer(value ~ group + (1 | unit), data = d, REML = TRUE)
    fe <- lme4::fixef(fit)
    se <- sqrt(diag(vcov(fit)))
    t <- unname(fe["groupb"] / se["groupb"])
    # Containment df for one random effect nested purely inside one fixed
    # factor, no crossing: independent units (replicates) minus fixed-effect
    # parameters. Reduces to the ordinary two-sample t test's df when every
    # replicate becomes one averaged value (n_rep_a + n_rep_b - 2), which is
    # exactly Prism's documented balanced-case equivalence (checked below).
    df <- (n_rep_a + n_rep_b) - 2
    p_two <- 2 * pt(-abs(t), df)
    half <- qt(0.975, df) * unname(se["groupb"])
    vc <- as.data.frame(lme4::VarCorr(fit))
    list(
      t = t, df = df, p_two = p_two,
      difference = unname(fe["groupb"]), se_difference = unname(se["groupb"]),
      ci_lower = unname(fe["groupb"]) - half, ci_upper = unname(fe["groupb"]) + half,
      mean_a = unname(fe["(Intercept)"]), mean_b = unname(fe["(Intercept)"] + fe["groupb"]),
      n_rep_a = n_rep_a, n_rep_b = n_rep_b,
      n_values_a = length(a_value), n_values_b = length(b_value),
      between_replicate_sd = vc$sdcor[vc$grp == "unit"],
      within_replicate_sd = vc$sdcor[vc$grp == "Residual"]
    )
  }

  # An ordinary Student's t test on each replicate's own mean: Prism's
  # documented shortcut, valid only when every replicate has the same
  # number of values (no missing values, in Prism's terms).
  naive <- function(a_value, a_replicate, b_value, b_replicate) {
    means_a <- tapply(a_value, a_replicate, mean)
    means_b <- tapply(b_value, b_replicate, mean)
    t.test(as.numeric(means_b), as.numeric(means_a), var.equal = TRUE)
  }

  # Cross-checks the oracle's own answer against the app's package
  # (nlme), fit the ordinary way (item 13's design note).
  check_nlme <- function(a_value, a_replicate, b_value, b_replicate, expected) {
    d <- frame(a_value, a_replicate, b_value, b_replicate)
    fit <- nlme::lme(value ~ group, random = ~1 | unit, data = d, method = "REML")
    s <- summary(fit)$tTable
    # lme4 and nlme reach the same REML fit through different optimizers,
    # so they agree to their own numerical precision, not to machine
    # epsilon: a looser tolerance here than the textbook-formula checks
    # elsewhere in this file.
    same(expected$t, s["groupb", "t-value"], tol = 1e-4)
    same(expected$df, s["groupb", "DF"])
    same(expected$p_two, s["groupb", "p-value"], tol = 1e-4)
    same(expected$difference, s["groupb", "Value"], tol = 1e-4)
    TRUE
  }
})

# A check kept in a variable (a quoted expression) is used as such (see
# scripts/oracle/generate.R): `fixture()` is passed the bare symbol.
check_nlme_only <- quote(check_nlme(a_value, a_replicate, b_value, b_replicate, expected))
check_agrees_with_averaging <- quote({
  check_nlme(a_value, a_replicate, b_value, b_replicate, expected)
  r <- naive(a_value, a_replicate, b_value, b_replicate)
  same(expected$t, unname(r$statistic))
  same(expected$df, unname(r$parameter))
  same(expected$p_two, r$p.value)
  TRUE
})
check_diverges_from_averaging <- quote({
  check_nlme(a_value, a_replicate, b_value, b_replicate, expected)
  r <- naive(a_value, a_replicate, b_value, b_replicate)
  stopifnot(abs(unname(r$statistic) - expected$t) > 1e-3)
  TRUE
})

# --- balanced: agrees exactly with averaging each replicate (Prism's documented equivalence) ---
fixture(
  "balanced-agrees-with-averaging",
  input = list(
    a_value = c(9.8, 10.3, 9.6, 10.1, 11.2, 10.8, 11.5, 10.9, 8.9, 9.4, 9.1, 9.7),
    a_replicate = c(1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3),
    b_value = c(12.6, 13.4, 12.9, 13.1, 11.8, 12.2, 11.6, 12.4),
    b_replicate = c(1, 1, 1, 1, 2, 2, 2, 2)
  ),
  expr = nested(a_value, a_replicate, b_value, b_replicate),
  setup = reference,
  check = check_agrees_with_averaging,
  check_packages = c("nlme"),
  packages = c("lme4"),
  tolerance = 1e-4,
  note = "Every replicate has the same number of values, so the nested test agrees exactly with an ordinary t test on the three (and two) replicate means."
)

# --- unbalanced: replicate sizes differ, so it does NOT agree with naive averaging ---
fixture(
  "unbalanced-diverges-from-averaging",
  input = list(
    a_value = c(9.8, 10.3, 9.6, 10.1, 10.0, 11.2, 10.8, 8.9, 9.4, 9.1, 9.7, 9.0, 9.3, 9.5),
    a_replicate = c(1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3),
    b_value = c(12.6, 13.4, 12.9, 11.8, 12.2, 11.6, 12.4, 12.0),
    b_replicate = c(1, 1, 1, 2, 2, 2, 2, 2)
  ),
  expr = nested(a_value, a_replicate, b_value, b_replicate),
  setup = reference,
  check = check_diverges_from_averaging,
  check_packages = c("nlme"),
  packages = c("lme4"),
  tolerance = 1e-4,
  note = "Replicate sizes differ a lot (1 to 7 values), so a naive average-then-t-test disagrees: the nested model weighs each replicate by how many values it has."
)

# --- minimum replicates: exactly two per group ---
fixture(
  "minimum-replicates",
  input = list(
    a_value = c(4.1, 4.3, 6.0, 6.2, 5.9),
    a_replicate = c(1, 1, 2, 2, 2),
    b_value = c(8.0, 8.4, 8.2, 10.1, 9.8, 10.3, 9.9),
    b_replicate = c(1, 1, 1, 2, 2, 2, 2)
  ),
  expr = nested(a_value, a_replicate, b_value, b_replicate),
  setup = reference,
  check = check_nlme_only,
  check_packages = c("nlme"),
  packages = c("lme4"),
  tolerance = 1e-4,
  note = "Two replicates per group: the minimum a nested t test can run on (df = 2)."
)

# --- a replicate with only one usable value ---
fixture(
  "single-value-replicate",
  input = list(
    a_value = c(20.1, 20.4, 19.8, 21.0, 22.5),
    a_replicate = c(1, 1, 1, 2, 3),
    b_value = c(25.0, 25.6, 24.8, 26.9, 27.3, 26.1),
    b_replicate = c(1, 1, 1, 2, 3, 3)
  ),
  expr = nested(a_value, a_replicate, b_value, b_replicate),
  setup = reference,
  check = check_nlme_only,
  check_packages = c("nlme"),
  packages = c("lme4"),
  tolerance = 1e-4,
  note = "Replicates 2 and 3 of A, and 2 of B, have only one value each; they still count, just with less weight than a replicate with many."
)

# --- realistic, more replicates, ragged, larger n ---
fixture(
  "several-replicates-ragged",
  input = list(
    a_value = c(
      30.1, 29.8, 30.4, 30.0,
      28.9, 29.1,
      31.2, 30.8, 31.5, 30.9, 31.1,
      29.5, 29.9, 29.7
    ),
    a_replicate = c(1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4),
    b_value = c(
      34.0, 34.6, 33.8,
      36.1, 35.7, 36.4, 35.9,
      33.2, 33.6
    ),
    b_replicate = c(1, 1, 1, 2, 2, 2, 2, 3, 3)
  ),
  expr = nested(a_value, a_replicate, b_value, b_replicate),
  setup = reference,
  check = check_nlme_only,
  check_packages = c("nlme"),
  packages = c("lme4"),
  tolerance = 1e-4,
  note = "Four replicates in A, three in B, all different sizes: the general, realistic case."
)
