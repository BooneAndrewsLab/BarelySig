# Fixtures for the Kruskal-Wallis test and Dunn's comparisons (#26, item
# 06). H and its P are R's own kruskal.test; Dunn's z is the textbook
# formula written out; both are checked against the dunn.test package
# (a reference-only package), whose two-sided P (altp) with Bonferroni's
# adjustment is Prism's "multiply by the number of comparisons".

reference <- quote({
  groups_of <- function(...) lapply(list(...), function(x) x[!is.na(x)])
  kruskal <- function(groups, comps = "all", control = 1, corrected = TRUE) {
    k <- length(groups)
    n <- lengths(groups)
    y <- unlist(groups)
    g <- rep(seq_len(k), n)
    kt <- kruskal.test(groups)
    r <- rank(y)
    rs <- tapply(r, g, sum)
    out <- list(
      k = k, n_total = length(y), h = unname(kt$statistic), df = unname(kt$parameter), p = kt$p.value,
      groups = lapply(seq_len(k), function(i) {
        list(n = n[i], median = median(groups[[i]]), rank_sum = rs[[i]], mean_rank = rs[[i]] / n[i])
      })
    )
    out$comparisons <- if (comps == "none") list() else {
      N <- length(y)
      t <- table(y)
      pairs <- unname(if (comps == "all") {
        do.call(rbind, lapply(seq_len(k - 1), function(i) cbind(i, (i + 1):k)))
      } else {
        cbind(control, seq_len(k)[-control])
      })
      K <- nrow(pairs)
      lapply(seq_len(K), function(x) {
        i <- pairs[x, 1]
        j <- pairs[x, 2]
        d <- rs[[i]] / n[i] - rs[[j]] / n[j]
        se <- sqrt((N * (N + 1) - sum(t^3 - t) / (N - 1)) / 12 * (1 / n[i] + 1 / n[j]))
        z <- abs(d) / se
        p <- 2 * pnorm(z, lower.tail = FALSE)
        list(i = i, j = j, diff = d, z = z, p_unadjusted = p, p = if (corrected) min(1, K * p) else p)
      })
    }
    out
  }
})

close <- function(x, y, tol = 1e-9) isTRUE(all.equal(as.numeric(x), as.numeric(y), tolerance = tol))
dunn_check <- quote({
  cols <- grep("^g[0-9]+$", ls(), value = TRUE)
  gs <- lapply(mget(cols[order(as.integer(sub("g", "", cols)))]), function(x) x[!is.na(x)])
  if (!length(expected$comparisons)) return(TRUE)
  d <- suppressWarnings(capture.output(res <- dunn.test::dunn.test(gs, method = "bonferroni", altp = TRUE, kw = FALSE, table = FALSE, list = FALSE)))
  # dunn.test lists every pair once, as "i - j" with i > j in its own order.
  ok <- TRUE
  for (c in expected$comparisons) {
    lab <- c(paste(c$j, "-", c$i), paste(c$i, "-", c$j))
    at <- match(lab, res$comparisons)
    at <- at[!is.na(at)][1]
    ok <- ok && close(abs(res$Z[at]), c$z) && close(res$altP[at], c$p_unadjusted)
  }
  ok && close(expected$h, suppressWarnings(kruskal.test(gs)$statistic))
})

all_pairs <- list(comparisons = "all", corrected = TRUE)

fixture("basic",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8, 5.0), g2 = c(6.1, 5.8, 6.4, 7.0, 6.2), g3 = c(4.9, 5.5, 5.2, 4.6, 5.9)),
  expr = kruskal(groups_of(g1, g2, g3)), setup = reference, options = all_pairs,
  check = dunn_check, check_packages = "dunn.test")

fixture("ties",
  input = list(g1 = c(1, 2, 2, 3, 3, 3), g2 = c(2, 3, 4, 4, 5), g3 = c(3, 4, 5, 5, 5, 6)),
  expr = kruskal(groups_of(g1, g2, g3)), setup = reference, options = all_pairs,
  check = dunn_check, check_packages = "dunn.test",
  note = "Ties: H and Dunn's SE both corrected for them.")

fixture("missing-unequal-n",
  input = list(g1 = c(12.1, 13.4, NA, 11.8), g2 = c(14.2, 15.1, 13.9, 16.0, 14.8, NA, 15.5), g3 = c(12.9, NA, 13.8, 14.4, 13.1, 12.7), g4 = c(11.2, 12.0)),
  expr = kruskal(groups_of(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  check = dunn_check, check_packages = "dunn.test")

fixture("n-2",
  input = list(g1 = c(4, 6), g2 = c(9, 12), g3 = c(5, 8)),
  expr = kruskal(groups_of(g1, g2, g3)), setup = reference, options = all_pairs,
  check = dunn_check, check_packages = "dunn.test",
  note = "Six values in all: no result can be significant (Prism: seven or fewer never give P < 0.05).")

fixture("control",
  input = list(g1 = c(10.2, 11.1, 9.8, 10.5, 10.9, 10.1), g2 = c(11.8, 12.4, 11.1, 12.9), g3 = c(10.8, 11.5, 10.3, 11.9, 10.6), g4 = c(13.1, 12.2, 13.8, 12.9, 13.5, 12.7, 13.0)),
  expr = kruskal(groups_of(g1, g2, g3, g4), comps = "control", control = 1), setup = reference,
  options = list(comparisons = "control", control = 1, corrected = TRUE),
  check = dunn_check, check_packages = "dunn.test",
  note = "Against a control: three comparisons, so each P is multiplied by 3.")

fixture("uncorrected",
  input = list(g1 = c(4.2, 5.1, 3.9, 4.8, 5.0), g2 = c(6.1, 5.8, 6.4, 7.0, 6.2), g3 = c(4.9, 5.5, 5.2, 4.6, 5.9)),
  expr = kruskal(groups_of(g1, g2, g3), corrected = FALSE), setup = reference,
  options = list(comparisons = "all", corrected = FALSE),
  note = "Uncorrected Dunn's test: each P on its own.")

fixture("capped",
  input = list(g1 = c(1, 2, 3, 4), g2 = c(1.5, 2.5, 3.5, 4.5), g3 = c(1.2, 2.2, 3.2, 4.2), g4 = c(10, 11, 12, 13)),
  expr = kruskal(groups_of(g1, g2, g3, g4)), setup = reference, options = all_pairs,
  check = dunn_check, check_packages = "dunn.test",
  note = "Six comparisons: a P above 1/6 is capped at 1 (Prism shows > 0.9999).")

fixture("outlier",
  input = list(g1 = c(10.1, 9.8, 10.3, 9.9, 10.0), g2 = c(10.4, 10.2, 10.6, 10.5, 60), g3 = c(10.9, 11.2, 10.8, 11.0, 11.1)),
  expr = kruskal(groups_of(g1, g2, g3)), setup = reference, options = all_pairs,
  check = dunn_check, check_packages = "dunn.test",
  note = "An outlier is just the highest rank.")

fixture("tiny-p",
  input = list(g1 = 1:30, g2 = 101:130, g3 = 201:230),
  expr = kruskal(groups_of(g1, g2, g3)), setup = reference, options = all_pairs,
  check = dunn_check, check_packages = "dunn.test",
  note = "Complete separation of 3 x 30: P near 1e-18 keeps its magnitude.")

fixture("two-groups",
  input = list(g1 = c(1.1, 2.3, 1.9, 2.8), g2 = c(2.8, 3.5, 2.2, 4.1, 3.3)),
  expr = kruskal(groups_of(g1, g2), comps = "none"), setup = reference,
  options = list(comparisons = "none", corrected = TRUE),
  note = "Two groups: the approximate P of a Mann-Whitney test (without continuity correction).")
