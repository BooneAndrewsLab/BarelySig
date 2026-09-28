# Fixtures for the chi-square test of independence on a Contingency table
# (item 28, #39). Each fixture's input columns are the column-factor
# levels (e.g. "drug", "placebo"), each a vector of row counts -- exactly
# what `cbind()` turns into the r x c matrix `chisq.test` takes. The
# reference wraps `chisq.test` itself (base R, the trusted implementation
# this project also ships, the same relationship `normality`'s oracle has
# with `shapiro.test`) rather than reimplementing it, since the point of
# the parity test is to check WebR's build reproduces desktop R's answer
# for this base function, not to check a hand-rolled formula.

reference <- quote({
  run_chisq <- function(m) {
    t <- chisq.test(m, correct = TRUE)
    list(
      chi_sq = unname(t$statistic),
      df = unname(t$parameter),
      p = t$p.value,
      corrected = isTRUE(nrow(m) == 2 && ncol(m) == 2),
      low_expected = any(t$expected < 5),
      n = sum(m)
    )
  }
})

fixture("two-by-two-association",
  input = list(drug = c(30, 10), placebo = c(15, 25)),
  expr = run_chisq(cbind(drug, placebo)), setup = reference,
  note = "A classic 2x2 table with a clear association: Yates' correction applies (Prism's default).")

fixture("two-by-two-no-association",
  input = list(drug = c(20, 20), placebo = c(20, 20)),
  expr = run_chisq(cbind(drug, placebo)), setup = reference,
  note = "No association at all (P near 1): catches a sign or direction bug that a significant-only fixture set would miss.")

fixture("three-by-four",
  input = list(
    a = c(12, 5, 8, 3),
    b = c(7, 14, 4, 9),
    c = c(3, 6, 11, 5)
  ),
  expr = run_chisq(cbind(a, b, c)), setup = reference,
  note = "An r x c table (4 rows, 3 columns): chi-square's df and Yates' correction (ignored above 2x2) both depend on getting the shape right.")

fixture("zero-cell",
  input = list(drug = c(0, 15), placebo = c(6, 9)),
  expr = run_chisq(cbind(drug, placebo)), setup = reference,
  note = "One cell is 0: a legitimate count, not a missing value, and chisq.test must still run.")

fixture("small-counts-low-expected",
  input = list(drug = c(1, 9), placebo = c(6, 4)),
  expr = run_chisq(cbind(drug, placebo)), setup = reference,
  note = paste(
    "Small counts with an expected count under 5: chi-square's own",
    "low_expected flag (and R's approximation warning) should surface here",
    "-- the case the issue calls out as where Fisher's exact is preferable."
  ))
