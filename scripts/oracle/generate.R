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

fixture <- function(name, input, expr, setup = NULL, packages = character(),
                    tolerance = 1e-6, note = NULL, options = NULL) {
  expr <- substitute(expr)
  for (p in packages) suppressPackageStartupMessages(library(p, character.only = TRUE))
  env <- list2env(input, parent = globalenv())
  if (!is.null(setup)) eval(setup, envir = env)
  expected <- eval(expr, envir = env)
  if (!is.list(expected) || is.null(names(expected))) stop(name, ": expression must return a named list")
  versions <- vapply(c("stats", packages), function(p) as.character(packageVersion(p)), "")
  out <- list(
    input = as_arrays(input),
    expected = encode(expected),
    reference = list(
      r = R.version.string,
      packages = as.list(versions),
      setup = if (is.null(setup)) NULL else code(setup),
      call = code(expr)
    ),
    tolerance = tolerance
  )
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
