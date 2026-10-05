# Fixtures for Normalize (#118, item 43). A calculated table, not an R
# analysis: the app computes it in TypeScript, and the reference here is
# plain arithmetic written the textbook way (y - zero) / (full - zero) * k,
# with columns as data sets and rows as experiments. NA = an empty cell.
# Options use data set *titles* (the names of the input columns); the app's
# test turns them into ids.

reference <- quote({
  k_of <- function(unit) if (unit == "percent") 100 else 1
  # Row means of replicate columns A_1, A_2, ... (Prism: references come from the mean of replicates).
  row_mean <- function(...) {
    m <- rowMeans(cbind(...), na.rm = TRUE)
    m[is.nan(m)] <- NA
    m
  }
  # Each column against one reference of its own (Prism's way).
  whole <- function(cols, zero, full, unit) {
    lapply(cols, function(y) {
      z <- zero(y); f <- full(y)
      (y - z) / (f - z) * k_of(unit)
    })
  }
  # Each row against the control's value in that row: a missing control
  # leaves that row missing in every column.
  by_row <- function(cols, ctrl, unit) {
    lapply(cols, function(y) y / ctrl * k_of(unit))
  }
  mean_na <- function(x) sum(x, na.rm = TRUE) / sum(!is.na(x))
  # Summary data -> raw values with exactly that mean, SD and n.
  raw_of <- function(mean, sd, n) as.numeric(scale(seq_len(n))) * sd + mean
})

opt <- function(by, zero, full, unit, replicates = 1, summary = NULL) {
  o <- list(by = by, zero = zero, full = full, unit = unit, replicates = replicates)
  if (!is.null(summary)) o$summary <- summary
  o
}
val <- function(v) list(kind = "value", value = v)
ds <- function(name) list(kind = "dataSet", dataSet = name)
kind <- function(k) list(kind = k)

fixture("fold-of-control-by-row",
  input = list(ctrl = c(2, 4, 5, 10), drug = c(1, 6, 2.5, 30), other = c(2, 4, 10, 5)),
  expr = by_row(list(ctrl = ctrl, drug = drug, other = other), ctrl, "fraction"),
  setup = reference,
  options = opt("row", val(0), ds("ctrl"), "fraction"),
  note = "Each experiment against its own control row. The control column becomes 1.")

fixture("percent-of-control-by-row-missing",
  input = list(ctrl = c(2, NA, 5, 10, 8), drug = c(1, 6, NA, 30, 4), other = c(2, 4, 10, NA, 8)),
  expr = by_row(list(ctrl = ctrl, drug = drug, other = other), ctrl, "percent"),
  setup = reference,
  options = opt("row", val(0), ds("ctrl"), "percent"),
  note = "A missing control leaves its row missing everywhere; a missing value stays missing.")

fixture("fold-of-control-mean-unequal-n",
  input = list(ctrl = c(10, 12, NA, 14), a = c(20, 25, 30, 35), b = c(5, NA, NA, 7)),
  expr = whole(list(ctrl = ctrl, a = a, b = b), function(y) 0, function(y) mean_na(ctrl), "fraction"),
  setup = reference,
  options = opt("whole", val(0), ds("ctrl"), "fraction"),
  note = "Unequal n: the control mean uses its three values.")

fixture("percent-of-fixed-value",
  input = list(a = c(25, 50, 75), b = c(10, NA, 40)),
  expr = whole(list(a = a, b = b), function(y) 0, function(y) 50, "percent"),
  setup = reference,
  options = opt("whole", val(0), val(50), "percent"))

fixture("range-smallest-largest",
  input = list(a = c(3, 9, 5, 21, NA), b = c(100, 140, 120, NA, 180)),
  expr = whole(list(a = a, b = b), function(y) min(y, na.rm = TRUE), function(y) max(y, na.rm = TRUE), "percent"),
  setup = reference,
  options = opt("whole", kind("min"), kind("max"), "percent"),
  note = "Prism's 0-100%: the smallest value of each data set is 0%, the largest 100%.")

fixture("range-first-last-row",
  input = list(a = c(4, 8, 6, 12), b = c(NA, 3, 6, 9)[c(2, 1, 3, 4)]),
  expr = whole(list(a = a, b = b), function(y) y[1], function(y) y[length(y)], "fraction"),
  setup = reference,
  options = opt("whole", kind("first"), kind("last"), "fraction"),
  note = "Prism's 'value in the first / last row'.")

fixture("fraction-of-sum",
  input = list(a = c(1, 2, 3, 4), b = c(10, NA, 30, 60)),
  expr = whole(list(a = a, b = b), function(y) 0, function(y) sum(y, na.rm = TRUE), "fraction"),
  setup = reference,
  options = opt("whole", val(0), kind("sum"), "fraction"),
  note = "Prism's 'sum of all values in the column'.")

fixture("range-between-two-controls",
  input = list(blank = c(0.1, 0.12, 0.08), pos = c(2.0, 2.2, 1.8), x = c(1.0, 0.5, NA, 1.9)[1:3]),
  expr = whole(list(blank = blank, pos = pos, x = x), function(y) mean_na(blank), function(y) mean_na(pos), "percent"),
  setup = reference,
  options = opt("whole", ds("blank"), ds("pos"), "percent"),
  note = "0% = the no-drug controls, 100% = the positive controls.")

fixture("n-2",
  input = list(ctrl = c(4, 8), a = c(6, 2)),
  expr = by_row(list(ctrl = ctrl, a = a), ctrl, "percent"),
  setup = reference,
  options = opt("row", val(0), ds("ctrl"), "percent"))

fixture("negative-control",
  input = list(ctrl = c(-2, -4, -5), a = c(1, 2, 3)),
  expr = whole(list(ctrl = ctrl, a = a), function(y) 0, function(y) mean_na(ctrl), "fraction"),
  setup = reference,
  options = opt("whole", val(0), ds("ctrl"), "fraction"),
  note = "A negative control gives a negative fold, as the arithmetic says.")

fixture("tiny-control",
  input = list(ctrl = c(1e-9, 3e-9), a = c(1e-6, 5e-7)),
  expr = by_row(list(ctrl = ctrl, a = a), ctrl, "fraction"),
  setup = reference,
  options = opt("row", val(0), ds("ctrl"), "fraction"))

fixture("replicates-by-row",
  input = list(A_1 = c(10, 20, 30), A_2 = c(12, NA, 34), B_1 = c(5, 30, 15), B_2 = c(7, 20, NA)),
  expr = {
    ctrl <- row_mean(A_1, A_2)
    by_row(list(A_1 = A_1, A_2 = A_2, B_1 = B_1, B_2 = B_2), ctrl, "percent")
  },
  setup = reference,
  options = opt("row", val(0), ds("A"), "percent", replicates = 2),
  note = "Each replicate against the mean of the control's replicates in its row; structure kept.")

fixture("replicates-range-of-means",
  input = list(A_1 = c(1, 5, 9), A_2 = c(3, 7, NA), B_1 = c(20, 22, 26), B_2 = c(24, NA, 30)),
  expr = {
    ma <- row_mean(A_1, A_2); mb <- row_mean(B_1, B_2)
    f <- function(y, m) (y - min(m)) / (max(m) - min(m)) * 100
    list(A_1 = f(A_1, ma), A_2 = f(A_2, ma), B_1 = f(B_1, mb), B_2 = f(B_2, mb))
  },
  setup = reference,
  options = opt("whole", kind("min"), kind("max"), "percent", replicates = 2),
  note = "With replicates, the smallest and largest come from the replicate means (Prism).")

fixture("summary-fold-of-control",
  input = list(a_mean = 12, a_sd = 2, a_n = 5, b_mean = 30, b_sd = 6, b_n = 4),
  expr = {
    xa <- raw_of(a_mean, a_sd, a_n); xb <- raw_of(b_mean, b_sd, b_n)
    ctrl <- mean(xa)
    na <- xa / ctrl; nb <- xb / ctrl
    list(a_mean = mean(na), a_sd = sd(na), b_mean = mean(nb), b_sd = sd(nb))
  },
  setup = reference,
  options = opt("whole", val(0), ds("a"), "fraction", summary = "mean-sd-n"),
  note = "Summary data checked against raw values with that mean, SD and n.")

fixture("summary-range-percent",
  input = list(a_mean = 12, a_sd = 2, a_n = 5, b_mean = 30, b_sd = 6, b_n = 4),
  expr = {
    xa <- raw_of(a_mean, a_sd, a_n); xb <- raw_of(b_mean, b_sd, b_n)
    f <- function(x) (x - 10) / (mean(xa) - 10) * 100
    list(a_mean = mean(f(xa)), a_sd = sd(f(xa)), b_mean = mean(f(xb)), b_sd = sd(f(xb)))
  },
  setup = reference,
  options = opt("whole", val(10), ds("a"), "percent", summary = "mean-sd-n"),
  note = "0% = 10, 100% = the mean of a; the SD scales by 100 / (12 - 10), subtracting 10 leaves it alone.")
