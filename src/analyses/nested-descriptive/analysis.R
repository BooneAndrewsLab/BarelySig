# Descriptive statistics of a Nested table (item 25, #75): per replicate
# (n, mean, SD, SEM), per group from the replicate means -- the primary,
# SuperPlot-correct summary (Lord et al. 2020) -- and, for reference only,
# pooled over every individual value, ignoring the replicate structure
# (shown in the app with a pseudoreplication caution, never used for
# inference). No new statistics: `bs_describe` (loaded with this file,
# descriptive's analysis.R, concatenated by the app) does every level's
# arithmetic; this is just orchestration.
#
# `value`, `group_idx` (1..k) and `replicate_idx` (1-based within its own
# group) describe every usable replicate's values -- a replicate with no
# usable value at all is already dropped and counted by the app, not sent
# here. `mean_value`/`mean_group_idx` are each group's replicate means,
# computed once in the app (`nestedReplicateMeans`, shared with the
# SuperPlot graph's own statistic) rather than re-derived here, so the
# group-level summary below can never drift from what the graph plots.
# `k` is the number of groups.
bs_nested_descriptive <- function(value, group_idx, replicate_idx, mean_value, mean_group_idx, k) {
  groups <- lapply(seq_len(k), function(g) {
    sel <- group_idx == g
    v <- value[sel]
    ridx <- replicate_idx[sel]
    reps <- lapply(sort(unique(ridx)), function(r) {
      bs_describe(v[ridx == r])[c("n", "mean", "sd", "sem")]
    })
    means <- mean_value[mean_group_idx == g]
    list(
      replicates = reps,
      group = bs_describe(means)[c("n", "mean", "sd", "sem", "ci_lower", "ci_upper")],
      pooled = bs_describe(v)[c("n", "mean", "sd")]
    )
  })
  list(groups = groups)
}
