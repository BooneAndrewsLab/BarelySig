# Fixtures for the t-tests (#17). The first case proves the harness (#3);
# #17 adds the full set: Welch, paired, one-tailed, summary data, and the
# edge cases in CLAUDE.md (missing values, unequal n, ties, n = 2, zero
# variance, outliers, very small p).

# As Prism reports it: difference and CI are mean(B) - mean(A).
setup <- quote(unpaired <- function(a, b) {
  r <- t.test(a, b, var.equal = TRUE)
  list(t = unname(r$statistic), df = unname(r$parameter), p = r$p.value,
       difference = unname(r$estimate[2] - r$estimate[1]),
       ci = rev(-r$conf.int[1:2]))
})

fixture("unpaired-basic",
  input = list(a = c(1, 2, 3, 4, 6), b = c(3, 4, 5, 7, 9)),
  expr = unpaired(a, b), setup = setup)

fixture("unpaired-missing",
  input = list(a = c(1, 2, NA, 4, 6), b = c(3, 4, 5, 7, 9, NA)),
  expr = unpaired(a[!is.na(a)], b[!is.na(b)]), setup = setup,
  note = "Empty cells drop out of each column; they are not zeros.")

fixture("unpaired-tiny-p",
  input = list(a = c(1.00, 1.01, 0.99, 1.02, 0.98), b = c(5.00, 5.01, 4.99, 5.02, 4.98)),
  expr = unpaired(a, b), setup = setup,
  note = "p near 1e-18: compared relatively, so a p rounded to 0 fails.")
