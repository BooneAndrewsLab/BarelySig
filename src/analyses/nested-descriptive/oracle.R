# Fixtures for descriptive statistics of a Nested table (item 25, #75):
# per replicate (n, mean, SD, SEM), per group from the replicate means
# (the primary summary), and pooled over every individual value (for
# reference only). The reference computes every level directly with
# base R (mean, sd, qt), independent of the app's own analysis.R, which
# reuses `bs_describe` for all three -- what actually needs checking here
# is the *assembly*: that the group-level number comes from the replicate
# means, not from the pooled individual values. Several fixtures use
# unequal replicate sizes so the two provably differ; a bug that pools
# individual values into the group-level summary (the exact
# pseudoreplication this analysis exists to avoid) would fail them.

reference <- quote({
  one <- function(x) {
    n <- length(x)
    m <- if (n > 0) mean(x) else NA_real_
    s <- if (n > 1) sd(x) else NA_real_
    sem <- if (n > 1) s / sqrt(n) else NA_real_
    list(n = n, mean = m, sd = s, sem = sem)
  }

  group_level <- function(means) {
    n <- length(means)
    m <- if (n > 0) mean(means) else NA_real_
    s <- if (n > 1) sd(means) else NA_real_
    sem <- if (n > 1) s / sqrt(n) else NA_real_
    half <- if (n > 1) qt(0.975, n - 1) * sem else NA_real_
    list(n = n, mean = m, sd = s, sem = sem, ci_lower = m - half, ci_upper = m + half)
  }

  described <- function(value, group_idx, replicate_idx, mean_value, mean_group_idx, k) {
    groups <- lapply(seq_len(k), function(g) {
      sel <- group_idx == g
      v <- value[sel]
      ridx <- replicate_idx[sel]
      reps <- lapply(sort(unique(ridx)), function(r) one(v[ridx == r]))
      means <- mean_value[mean_group_idx == g]
      list(replicates = reps, group = group_level(means), pooled = one(v)[c("n", "mean", "sd")])
    })
    list(groups = groups)
  }
})

# --- one group, several even replicates: the plain case -----------------
fixture(
  "basic",
  input = list(
    value = c(
      10.1, 10.3, 9.9, 10.0,
      11.2, 10.8, 11.5,
      9.4, 9.1, 9.7, 9.6
    ),
    group_idx = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
    replicate_idx = c(1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3),
    mean_value = c(mean(c(10.1, 10.3, 9.9, 10.0)), mean(c(11.2, 10.8, 11.5)), mean(c(9.4, 9.1, 9.7, 9.6))),
    mean_group_idx = c(1, 1, 1),
    k = 1
  ),
  expr = described(value, group_idx, replicate_idx, mean_value, mean_group_idx, k),
  setup = reference,
  note = "One group, three replicates of similar size: the plain case."
)

# --- several groups -------------------------------------------------------
fixture(
  "several-groups",
  input = list(
    value = c(
      # Group 1: 3 replicates
      20.0, 20.4, 19.8,
      22.1, 21.9,
      18.5, 18.9, 19.1, 18.7,
      # Group 2: 2 replicates
      30.2, 30.6, 29.9, 30.1,
      27.4, 27.8
    ),
    group_idx = c(1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2),
    replicate_idx = c(1, 1, 1, 2, 2, 3, 3, 3, 3, 1, 1, 1, 1, 2, 2),
    mean_value = c(
      mean(c(20.0, 20.4, 19.8)), mean(c(22.1, 21.9)), mean(c(18.5, 18.9, 19.1, 18.7)),
      mean(c(30.2, 30.6, 29.9, 30.1)), mean(c(27.4, 27.8))
    ),
    mean_group_idx = c(1, 1, 1, 2, 2),
    k = 2
  ),
  expr = described(value, group_idx, replicate_idx, mean_value, mean_group_idx, k),
  setup = reference,
  note = "Two groups, three and two replicates: each group's own numbers must stay separate."
)

# --- unequal replicate sizes: group mean must differ from the pooled mean ---
fixture(
  "unequal-sizes-diverge-from-pooled",
  input = list(
    value = c(
      # Replicate 1: 1 value, far from the others.
      100,
      # Replicate 2: 9 values, close together, much lower.
      10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.0
    ),
    group_idx = rep(1, 10),
    replicate_idx = c(1, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    mean_value = c(100, mean(c(10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.0))),
    mean_group_idx = c(1, 1),
    k = 1
  ),
  expr = described(value, group_idx, replicate_idx, mean_value, mean_group_idx, k),
  setup = reference,
  note = paste(
    "One replicate of a single outlying value against one of nine ordinary values:",
    "the group-level mean (of the two replicate means, ~55) must be far from the",
    "pooled mean (of all ten raw values, ~19) -- pooling would understate how much",
    "that single replicate actually moved the result."
  )
)

# --- a replicate with a single value: no replicate-level SD/SEM ----------
fixture(
  "single-value-replicate",
  input = list(
    value = c(5.0, 12.0, 12.4, 11.8, 12.2),
    group_idx = c(1, 1, 1, 1, 1),
    replicate_idx = c(1, 2, 2, 2, 2),
    mean_value = c(5.0, mean(c(12.0, 12.4, 11.8, 12.2))),
    mean_group_idx = c(1, 1),
    k = 1
  ),
  expr = described(value, group_idx, replicate_idx, mean_value, mean_group_idx, k),
  setup = reference,
  note = "Replicate 1 has one value: its own SD and SEM aren't defined, but it still has a mean."
)

# --- a single usable replicate: no group-level SD/SEM/CI -----------------
fixture(
  "single-replicate-group",
  input = list(
    value = c(7.1, 7.4, 6.9, 7.2, 7.0),
    group_idx = c(1, 1, 1, 1, 1),
    replicate_idx = c(1, 1, 1, 1, 1),
    mean_value = c(mean(c(7.1, 7.4, 6.9, 7.2, 7.0))),
    mean_group_idx = c(1),
    k = 1
  ),
  expr = described(value, group_idx, replicate_idx, mean_value, mean_group_idx, k),
  setup = reference,
  note = "Only one usable replicate: the group-level SD, SEM and CI aren't defined, only its mean."
)

# --- zero variance: identical values within and across replicates --------
fixture(
  "zero-variance",
  input = list(
    value = c(5, 5, 5, 5, 5, 5),
    group_idx = c(1, 1, 1, 1, 1, 1),
    replicate_idx = c(1, 1, 1, 2, 2, 2),
    mean_value = c(5, 5),
    mean_group_idx = c(1, 1),
    k = 1
  ),
  expr = described(value, group_idx, replicate_idx, mean_value, mean_group_idx, k),
  setup = reference,
  note = "Every value identical: SD 0 at every level, a zero-width CI."
)

# --- many small, ragged replicates, larger n -----------------------------
fixture(
  "ragged-many-replicates",
  input = list(
    value = c(
      40.1, 40.5,
      38.2, 38.6, 38.0, 38.4, 38.8,
      41.9,
      37.0, 37.5, 37.2,
      39.6, 39.4, 39.9, 39.7, 39.5, 39.8
    ),
    group_idx = rep(1, 17),
    replicate_idx = c(1, 1, 2, 2, 2, 2, 2, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5),
    mean_value = c(
      mean(c(40.1, 40.5)),
      mean(c(38.2, 38.6, 38.0, 38.4, 38.8)),
      41.9,
      mean(c(37.0, 37.5, 37.2)),
      mean(c(39.6, 39.4, 39.9, 39.7, 39.5, 39.8))
    ),
    mean_group_idx = c(1, 1, 1, 1, 1),
    k = 1
  ),
  expr = described(value, group_idx, replicate_idx, mean_value, mean_group_idx, k),
  setup = reference,
  note = "Five replicates ranging from 1 to 6 values: the general, realistic case."
)
