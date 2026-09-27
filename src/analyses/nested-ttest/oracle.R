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

# --- matched replicates (note 14, #70) -----------------------------------
# Replicate n is the same experiment in both groups; the app pairs them
# (prepare() lines them up) and runs a paired t test on the replicate
# means, as Lord et al. 2020 compute a SuperPlot's P. The reference is
# the textbook paired t (mean difference over its standard error, n - 1
# df) and the textbook test of a Pearson r, from each replicate's own
# average; `check` holds it to R's t.test(paired = TRUE) and cor.test().

reference_matched <- quote({
  same <- function(x, y, tol = 1e-9) stopifnot(isTRUE(all.equal(unname(x), unname(y), tolerance = tol)))

  replicate_means <- function(value, replicate) {
    sapply(sort(unique(replicate)), function(r) sum(value[replicate == r]) / sum(replicate == r))
  }

  matched <- function(a_value, a_replicate, b_value, b_replicate) {
    ma <- replicate_means(a_value, a_replicate)
    mb <- replicate_means(b_value, b_replicate)
    n <- length(ma)
    d <- mb - ma
    sd_d <- sqrt(sum((d - mean(d))^2) / (n - 1))
    se <- sd_d / sqrt(n)
    t <- mean(d) / se
    half <- qt(0.975, n - 1) * se
    r <- if (n > 2) {
      sum((ma - mean(ma)) * (mb - mean(mb))) / sqrt(sum((ma - mean(ma))^2) * sum((mb - mean(mb))^2))
    } else NA_real_
    list(
      t = t, df = n - 1, p_two = 2 * pt(-abs(t), n - 1),
      difference = mean(d), se_difference = se,
      ci_lower = mean(d) - half, ci_upper = mean(d) + half,
      mean_a = mean(ma), mean_b = mean(mb),
      n_rep_a = n, n_rep_b = n,
      n_values_a = length(a_value), n_values_b = length(b_value),
      sd_difference = sd_d,
      pairing_r = r,
      pairing_p = if (n > 2) pt(r * sqrt((n - 2) / (1 - r^2)), n - 2, lower.tail = FALSE) else NA_real_
    )
  }
})

check_matched <- quote({
  ma <- as.numeric(tapply(a_value, a_replicate, mean))
  mb <- as.numeric(tapply(b_value, b_replicate, mean))
  r <- t.test(mb, ma, paired = TRUE)
  same(expected$t, r$statistic)
  same(expected$df, r$parameter)
  same(expected$p_two, r$p.value)
  same(c(expected$ci_lower, expected$ci_upper), as.numeric(r$conf.int))
  if (length(ma) > 2) {
    ct <- cor.test(ma, mb, alternative = "greater")
    same(expected$pairing_r, as.numeric(ct$estimate))
    same(expected$pairing_p, ct$p.value)
  }
  TRUE
})

matched_options <- list(tails = "two", matched = TRUE)

fixture(
  "matched-consistent-trend",
  input = list(
    a_value = c(41.2, 44.0, 39.5, 42.8, 40.1, 31.5, 33.0, 30.2, 32.6, 20.4, 22.1, 19.8, 21.5, 23.0, 20.9),
    a_replicate = c(1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3),
    b_value = c(30.1, 31.8, 28.9, 29.5, 22.0, 21.4, 23.3, 12.9, 14.1, 13.5, 12.2),
    b_replicate = c(1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3)
  ),
  expr = matched(a_value, a_replicate, b_value, b_replicate),
  setup = reference_matched,
  check = check_matched,
  options = matched_options,
  note = "Lord et al. 2020, Fig. 1C in small: the days differ a lot, but Drug is lower on every day. Matching the days finds it; different numbers of cells per replicate."
)

fixture(
  "matched-random-run",
  input = list(
    a_value = c(41.2, 44.0, 39.5, 31.5, 33.0, 30.2, 20.4, 22.1, 19.8),
    a_replicate = c(1, 1, 1, 2, 2, 2, 3, 3, 3),
    b_value = c(22.3, 20.1, 21.8, 13.1, 12.4, 14.0, 29.2, 30.5, 28.8),
    b_replicate = c(1, 1, 1, 2, 2, 2, 3, 3, 3)
  ),
  expr = matched(a_value, a_replicate, b_value, b_replicate),
  setup = reference_matched,
  check = check_matched,
  options = matched_options,
  note = "Lord et al. 2020, Fig. 1D in small: the difference changes direction from day to day, so matching finds no consistent effect; the pairing correlation is negative."
)

fixture(
  "matched-two-replicates",
  input = list(
    a_value = c(10.2, 11.0, 10.6, 14.1, 13.7),
    a_replicate = c(1, 1, 1, 2, 2),
    b_value = c(12.5, 12.9, 16.8, 17.4, 16.9, 17.0),
    b_replicate = c(1, 1, 2, 2, 2, 2)
  ),
  expr = matched(a_value, a_replicate, b_value, b_replicate),
  setup = reference_matched,
  check = check_matched,
  options = matched_options,
  note = "Two matched replicates, the fewest possible (df = 1); too few to test whether the matching was effective (no r)."
)

fixture(
  "matched-ragged-small-p",
  input = list(
    a_value = c(
      5.01, 5.12, 4.95,
      7.40, 7.52,
      6.10, 6.02, 6.21, 5.98,
      8.30,
      4.44, 4.52, 4.39,
      9.05, 9.11
    ),
    a_replicate = c(1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 5, 5, 5, 6, 6),
    b_value = c(
      15.02, 15.10,
      17.44, 17.37, 17.51, 17.40,
      16.12,
      18.31, 18.25,
      14.47, 14.40, 14.52,
      19.08, 19.02, 19.12
    ),
    b_replicate = c(1, 1, 2, 2, 2, 2, 3, 4, 4, 5, 5, 5, 6, 6, 6)
  ),
  expr = matched(a_value, a_replicate, b_value, b_replicate),
  setup = reference_matched,
  check = check_matched,
  options = matched_options,
  note = "Six matched replicates of 1 to 4 values each, and a very consistent difference of about 10: a very small P that must keep its magnitude."
)
