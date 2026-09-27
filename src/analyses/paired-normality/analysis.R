# Normality of a paired t test's differences (item 18, #53): the same
# D'Agostino-Pearson and Shapiro-Wilk tests as `normality`, run once on the
# row-by-row differences (d = b - a) rather than on each group, since a
# paired t test's assumption is about the differences, not the groups on
# their own. `bs_normality_one` is loaded with this file (normality's
# analysis.R, concatenated by the app).

# d: the differences (already b - a; no missing values, no group column).
bs_paired_normality <- function(d) {
  bs_normality_one(d)
}
