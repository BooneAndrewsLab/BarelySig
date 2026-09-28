# Writes validation fixtures from desktop R (CLAUDE.md, Correctness).
#
# Each src/analyses/<id>/oracle.R calls `fixture()` once per case. A case is
# an input (named list of vectors; NA for an empty cell), an optional setup
# expression (helper definitions), the analysis options the case uses (for
# the app's test, item 04) and an R expression evaluated with the
# input's names bound after the setup; its value — a named list — is the
# expected result. Setup and expression are recorded verbatim, so the parity
# test (src/test/parity.test.ts) can run the same code in WebR and compare.
#
#   scripts/oracle/run.sh generate [analysis-id...]
suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
oracles <- Sys.glob("src/analyses/*/oracle.R")
if (length(args)) oracles <- oracles[basename(dirname(oracles)) %in% args]
if (!length(oracles)) stop("no oracle.R found")

# JSON has no NA, NaN or Inf: NA -> null (an empty cell), the others -> strings.
encode <- function(x) {
  if (is.list(x)) return(lapply(x, encode))
  if (is.numeric(x) && any(!is.finite(x) & !is.na(x) | is.nan(x))) {
    x <- as.list(x)
    x[] <- lapply(x, function(v) {
      if (is.nan(v)) "NaN" else if (is.infinite(v)) if (v > 0) "Inf" else "-Inf" else v
    })
  }
  x
}

# Keeps length-1 vectors in `input` as arrays: a column with one value is
# still a column. Results keep scalars as scalars.
as_arrays <- function(input) lapply(input, function(v) if (length(v) == 1) I(v) else v)

code <- function(e) paste(deparse(e, width.cutoff = 80L), collapse = "\n")

# `check` (optional) is a second, independent reference run only here, in
# desktop R, after the expected values are computed: an expression that
# sees the input, the setup and `expected`, and stops if they disagree. It
# may use reference packages WebR doesn't ship (`check_packages`); it is
# recorded as `reference.checked` for provenance, and the parity test
# doesn't run it (item 06).
#
# `parity = FALSE` marks a reference too slow to rerun in WebR (a brute-
# force count, note 07); the parity test skips it, and the analysis's own
# test still checks the app's code against it in WebR.
versions_of <- function(packages) {
  as.list(vapply(packages, function(p) as.character(packageVersion(p)), ""))
}

fixture <- function(name, input, expr, setup = NULL, packages = character(),
                    tolerance = 1e-6, note = NULL, options = NULL,
                    check = NULL, check_packages = character(), parity = TRUE) {
  expr <- substitute(expr)
  check <- substitute(check)
  # A check kept in a variable of the oracle (a quoted expression) is used as such.
  if (is.symbol(check)) check <- eval(check, parent.frame())
  for (p in c(packages, check_packages)) suppressPackageStartupMessages(library(p, character.only = TRUE))
  env <- list2env(input, parent = globalenv())
  if (!is.null(setup)) eval(setup, envir = env)
  expected <- eval(expr, envir = env)
  if (!is.list(expected) || is.null(names(expected))) stop(name, ": expression must return a named list")
  if (!is.null(check)) {
    # The check sees the input, the setup's definitions, `expected` and the
    # oracle's own helpers.
    cenv <- list2env(c(as.list(env), list(expected = expected)), parent = parent.frame())
    ok <- tryCatch(eval(check, envir = cenv), error = function(e) stop(name, ": check failed: ", conditionMessage(e)))
    if (!isTRUE(ok)) stop(name, ": check did not return TRUE")
  }
  # A NULL kept as a list element (rather than left out of it) writes as `{}`
  # in JSON (jsonlite's default for a NULL value, not the "missing key" the
  # parity test's `!== undefined` check assumes) -- so a fixture with no
  # `setup` builds the reference without that key at all, not with a NULL one.
  reference <- list(r = R.version.string, packages = versions_of(c("stats", packages)))
  if (!is.null(setup)) reference$setup <- code(setup)
  reference$call <- code(expr)
  out <- list(
    input = as_arrays(input),
    expected = encode(expected),
    reference = reference,
    tolerance = tolerance
  )
  if (!is.null(check)) {
    out$reference$checked <- list(packages = versions_of(c("stats", check_packages)), code = code(check))
  }
  if (!parity) out$reference$parity <- FALSE
  if (!is.null(note)) out$note <- note
  # The analysis options this case uses, for the app's own test (item 04).
  if (!is.null(options)) out$options <- options
  dir <- file.path(.fixture_dir, "fixtures")
  dir.create(dir, showWarnings = FALSE)
  path <- file.path(dir, paste0(name, ".json"))
  write_json(out, path, auto_unbox = TRUE, digits = I(17), na = "null", pretty = TRUE)
  cat(path, "\n")
}

for (oracle in oracles) {
  .fixture_dir <- dirname(oracle)
  unlink(file.path(.fixture_dir, "fixtures", "*.json"))
  sys.source(oracle, envir = new.env(parent = globalenv()), keep.source = FALSE)
}
