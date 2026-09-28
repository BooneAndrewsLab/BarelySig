# Fixtures for Fisher's exact test on a Contingency table (item 28, #39).
# Same input shape as contingency-chi-square's oracle (column-factor
# levels as named vectors of row counts); the reference wraps
# `fisher.test` itself (base R, the trusted implementation), independent
# of the app's own analysis.R only in the sense that both call the same
# base function directly, as this project's other base-R-only analyses do.

reference <- quote({
  run_fisher <- function(m) {
    t <- fisher.test(m)
    list(
      p = t$p.value,
      n = sum(m),
      odds_ratio = if (is.null(t$estimate)) NA_real_ else unname(t$estimate),
      or_lower = if (is.null(t$conf.int)) NA_real_ else t$conf.int[1],
      or_upper = if (is.null(t$conf.int)) NA_real_ else t$conf.int[2]
    )
  }
})

fixture("tea-tasting-classic",
  input = list(milk_first = c(3, 1), tea_first = c(1, 3)),
  expr = run_fisher(cbind(milk_first, tea_first)), setup = reference,
  note = "Fisher's own 2x2 tea-tasting example: tiny counts, the textbook case chi-square can't be trusted on.")

fixture("small-counts-preferred-over-chisq",
  input = list(drug = c(1, 9), placebo = c(6, 4)),
  expr = run_fisher(cbind(drug, placebo)), setup = reference,
  note = "The same small-count table as contingency-chi-square's low-expected-count fixture: the case the issue calls out as where Fisher's exact is the right choice instead.")

fixture("three-by-three-exact",
  input = list(a = c(4, 2, 1), b = c(1, 3, 2), c = c(2, 1, 4)),
  expr = run_fisher(cbind(a, b, c)), setup = reference,
  note = "An r x c table (3 rows, 3 columns) with small counts: R's network algorithm generalizes the exact test past 2x2, and gives no odds ratio here.")

fixture("zero-cell",
  input = list(drug = c(0, 15), placebo = c(6, 9)),
  expr = run_fisher(cbind(drug, placebo)), setup = reference,
  note = "One cell is 0: a legitimate count, and fisher.test must still run and give a real odds ratio.")
