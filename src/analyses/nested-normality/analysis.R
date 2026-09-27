# Normality of a Nested table's replicate means (item 26, #77). No new
# statistics: `bs_normality` (loaded with this file, normality's own
# analysis.R, concatenated by the app exactly as nested-descriptive
# concatenates descriptive's) already groups a vector of numbers by an
# index 1..k and runs D'Agostino-Pearson + Shapiro-Wilk on each group --
# it doesn't know or care whether that vector holds raw values or
# replicate means. `bs_nested_normality` is only a distinct exported name
# for the job's R call, so it says which analysis it is running.
#
# y: the replicate means (one per replicate with a usable value, computed
# by the app's `nestedReplicateMeans`); g: each mean's group (1..k); k:
# the number of groups.
bs_nested_normality <- bs_normality
