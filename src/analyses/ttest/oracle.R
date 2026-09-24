# Fixtures for the t tests (#17, item 04). The reference computes every
# number from the textbook formula (pooled and Welch SE, Welch-Satterthwaite
# df, paired differences, the F test, Pearson r and its t test), and checks
# itself against R's t.test / var.test / cor.test before a fixture is
# written. Differences are B - A, as Prism reports them.

reference <- quote({
  same <- function(x, y) stopifnot(isTRUE(all.equal(unname(x), unname(y), tolerance = 1e-12)))
  f_test <- function(va, na, vb, nb) {
    if (min(va, vb) == 0) return(list(f = NA, f_dfn = NA, f_dfd = NA, f_p = NA))
    top <- va >= vb
    f <- if (top) va / vb else vb / va
    dfn <- if (top) na - 1 else nb - 1
    dfd <- if (top) nb - 1 else na - 1
    # The upper tail directly: 1 - pf() loses the digits of a small P.
    p <- min(1, 2 * pf(f, dfn, dfd, lower.tail = FALSE))
    list(f = f, f_dfn = dfn, f_dfd = dfd, f_p = p)
  }
  from_summary <- function(ma, sa, na, mb, sb, nb, welch) {
    va <- sa^2; vb <- sb^2
    if (welch) {
      se <- sqrt(va / na + vb / nb)
      df <- (va / na + vb / nb)^2 / ((va / na)^2 / (na - 1) + (vb / nb)^2 / (nb - 1))
    } else {
      se <- sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2) * (1 / na + 1 / nb))
      df <- na + nb - 2
    }
    d <- mb - ma
    t <- d / se
    p <- 2 * pt(abs(t), df, lower.tail = FALSE)
    half <- qt(0.975, df) * se
    c(list(t = t, df = df, p_two = p, n_a = na, n_b = nb, mean_a = ma, mean_b = mb, sd_a = sa, sd_b = sb,
           difference = d, se_difference = se, ci_lower = d - half, ci_upper = d + half,
           r_squared = t^2 / (t^2 + df)), f_test(va, na, vb, nb))
  }
  unpaired <- function(a, b, welch) {
    a <- a[!is.na(a)]; b <- b[!is.na(b)]
    out <- from_summary(mean(a), sd(a), length(a), mean(b), sd(b), length(b), welch)
    r <- t.test(b, a, var.equal = !welch)
    same(out$t, r$statistic); same(out$df, r$parameter); same(out$p_two, r$p.value)
    same(c(out$ci_lower, out$ci_upper), r$conf.int[1:2])
    if (!is.na(out$f)) same(out$f_p, var.test(a, b)$p.value)
    out
  }
  # Summary data: the reference is t.test on raw values that have exactly
  # this mean, SD and n, so it doesn't share the summary formulas.
  summary_case <- function(ma, sa, na, mb, sb, nb, welch) {
    raw <- function(m, s, n) as.numeric(scale(seq_len(n))) * s + m
    a <- raw(ma, sa, na); b <- raw(mb, sb, nb)
    r <- t.test(b, a, var.equal = !welch)
    c(list(t = unname(r$statistic), df = unname(r$parameter), p_two = r$p.value, n_a = na, n_b = nb,
           mean_a = ma, mean_b = mb, sd_a = sa, sd_b = sb, difference = mb - ma, se_difference = r$stderr,
           ci_lower = r$conf.int[1], ci_upper = r$conf.int[2],
           r_squared = unname(r$statistic)^2 / (unname(r$statistic)^2 + unname(r$parameter))),
      f_test(sa^2, na, sb^2, nb))
  }
  paired <- function(a, b) {
    keep <- !is.na(a) & !is.na(b)
    a <- a[keep]; b <- b[keep]
    n <- length(a)
    d <- b - a
    md <- mean(d); sdd <- sd(d); se <- sdd / sqrt(n); df <- n - 1
    t <- md / se
    half <- qt(0.975, df) * se
    rr <- if (n > 2) cor(a, b) else NA
    pr <- if (n > 2) pt(rr * sqrt((n - 2) / (1 - rr^2)), n - 2, lower.tail = FALSE) else NA
    out <- list(t = t, df = df, p_two = 2 * pt(abs(t), df, lower.tail = FALSE), n_pairs = n,
                mean_a = mean(a), mean_b = mean(b), difference = md, sd_difference = sdd, se_difference = se,
                ci_lower = md - half, ci_upper = md + half, r_squared = t^2 / (t^2 + df),
                pairing_r = rr, pairing_p = pr)
    r <- t.test(b, a, paired = TRUE)
    same(out$t, r$statistic); same(out$p_two, r$p.value); same(c(out$ci_lower, out$ci_upper), r$conf.int[1:2])
    if (n > 2) same(out$pairing_p, cor.test(a, b, alternative = "greater")$p.value)
    out
  }
})

student <- list(paired = FALSE, welch = FALSE)
welch <- list(paired = FALSE, welch = TRUE)
pairs <- list(paired = TRUE, welch = FALSE)

# --- unpaired ------------------------------------------------------------------
fixture("unpaired-basic", input = list(a = c(1, 2, 3, 4, 6), b = c(3, 4, 5, 7, 9)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student)

fixture("unpaired-missing", input = list(a = c(1, 2, NA, 4, 6), b = c(3, 4, 5, 7, 9, NA)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student,
  note = "Empty cells drop out of each column; they are not zeros.")

fixture("unpaired-unequal-n", input = list(a = c(12.1, 13.4, 11.8), b = c(14.2, 15.1, 13.9, 16.0, 14.8, 15.5, 14.1)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student)

fixture("unpaired-n-2", input = list(a = c(4, 6), b = c(9, 12)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student)

fixture("unpaired-ties", input = list(a = c(2, 2, 2, 3, 3), b = c(3, 3, 4, 4, 4, 4)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student)

fixture("unpaired-zero-variance-one", input = list(a = c(5, 5, 5, 5), b = c(6, 7, 8, 7)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student,
  note = "One group without variation: t is defined, the F test is not.")

fixture("unpaired-outlier", input = list(a = c(10.1, 9.8, 10.3, 9.9, 10.0), b = c(10.4, 10.2, 10.6, 10.5, 60)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student,
  note = "An extreme value inflates B's SD and hides the shift.")

fixture("unpaired-tiny-p", input = list(a = c(1.00, 1.01, 0.99, 1.02, 0.98), b = c(5.00, 5.01, 4.99, 5.02, 4.98)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student,
  note = "p near 1e-18: compared relatively, so a p rounded to 0 fails.")

fixture("unpaired-p-1e-20",
  input = list(a = c(1.000, 1.002, 0.998, 1.001, 0.999, 1.003), b = c(2.000, 2.002, 1.998, 2.001, 1.999, 2.003)),
  expr = unpaired(a, b, FALSE), setup = reference, options = student,
  note = "A P value far below Prism's display floor keeps its magnitude.")

# --- Welch ---------------------------------------------------------------------
fixture("welch-basic", input = list(a = c(20.1, 22.3, 19.8, 21.5, 20.9, 22.0), b = c(25.2, 31.8, 19.4, 35.6, 28.1)),
  expr = unpaired(a, b, TRUE), setup = reference, options = welch)

fixture("welch-zero-variance-one", input = list(a = c(5, 5, 5), b = c(6, 9, 7, 8)),
  expr = unpaired(a, b, TRUE), setup = reference, options = welch)

fixture("welch-missing", input = list(a = c(3.1, NA, 2.8, 3.5, 3.0), b = c(4.2, 5.9, NA, 3.8)),
  expr = unpaired(a, b, TRUE), setup = reference, options = welch)

# --- paired --------------------------------------------------------------------
fixture("paired-basic", input = list(a = c(24, 27, 31, 22, 29, 26), b = c(28, 30, 33, 27, 30, 31)),
  expr = paired(a, b), setup = reference, options = pairs)

fixture("paired-missing", input = list(a = c(24, 27, NA, 22, 29, 26), b = c(28, 30, 33, 27, NA, 31)),
  expr = paired(a, b), setup = reference, options = pairs,
  note = "A row missing on either side drops out of the pairing (4 pairs, not 5 and 5).")

fixture("paired-n-2", input = list(a = c(10, 12), b = c(13, 16)),
  expr = paired(a, b), setup = reference, options = pairs,
  note = "Two pairs: the pairing correlation is not defined.")

fixture("paired-negative-correlation", input = list(a = c(1, 2, 3, 4, 5), b = c(9, 8.5, 8, 7.2, 6.9)),
  expr = paired(a, b), setup = reference, options = pairs,
  note = "Pairing was not effective: r < 0, one-tailed P near 1.")

fixture("paired-ties", input = list(a = c(3, 3, 4, 4, 5, 5), b = c(4, 4, 4, 5, 6, 7)),
  expr = paired(a, b), setup = reference, options = pairs)

fixture("paired-outlier", input = list(a = c(8.1, 7.9, 8.4, 8.0, 8.2), b = c(8.6, 8.3, 8.9, 8.5, 30.0)),
  expr = paired(a, b), setup = reference, options = pairs)

fixture("paired-tiny-p", input = list(a = c(10, 20, 30, 40, 50, 60), b = c(15.001, 25.000, 34.999, 45.002, 54.998, 65.000)),
  expr = paired(a, b), setup = reference, options = pairs)

# --- from summary data ---------------------------------------------------------
fixture("summary-student", input = list(mean_a = 12.3, sd_a = 1.8, n_a = 6, mean_b = 15.1, sd_b = 2.2, n_b = 6),
  expr = summary_case(mean_a, sd_a, n_a, mean_b, sd_b, n_b, FALSE), setup = reference,
  options = list(paired = FALSE, welch = FALSE, from = "summary"))

fixture("summary-welch-unequal-n", input = list(mean_a = 50, sd_a = 4, n_a = 5, mean_b = 58, sd_b = 12, n_b = 9),
  expr = summary_case(mean_a, sd_a, n_a, mean_b, sd_b, n_b, TRUE), setup = reference,
  options = list(paired = FALSE, welch = TRUE, from = "summary"))
