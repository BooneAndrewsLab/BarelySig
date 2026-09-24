# Makes the barelysig-r env hold exactly the package versions the app's WebR
# runs (src/engine/lock.json, checked by scripts/webr/fetch.ts), plus
# the reference-only packages used to check our own R (item 01). Installs
# from the CRAN archive when the current CRAN version differs.
#   scripts/oracle/run.sh pin
options(repos = c(CRAN = "https://cloud.r-project.org"), Ncpus = 8L)
lock <- jsonlite::fromJSON("src/engine/lock.json")$packages
reference_only <- c("multcomp", "dunn.test", "fBasics", "car", "drc")

have <- function(p) if (requireNamespace(p, quietly = TRUE)) as.character(packageVersion(p)) else NA
cran <- available.packages()
# "1.2-4" and "1.2.4" are the same version.
same <- function(a, b) !is.na(a) && package_version(a) == package_version(b)

for (p in names(lock)) {
  want <- lock[[p]]
  if (same(have(p), want)) next
  current <- if (p %in% rownames(cran)) cran[p, "Version"] else NA
  url <- if (same(current, want)) {
    sprintf("https://cloud.r-project.org/src/contrib/%s_%s.tar.gz", p, want)
  } else {
    sprintf("https://cloud.r-project.org/src/contrib/Archive/%s/%s_%s.tar.gz", p, p, want)
  }
  message(sprintf("%s: %s -> %s", p, have(p), want))
  install.packages(url, repos = NULL, type = "source")
  if (!same(have(p), want)) stop(sprintf("%s: wanted %s, have %s", p, want, have(p)))
}
missing <- reference_only[is.na(vapply(reference_only, have, ""))]
if (length(missing)) install.packages(missing)

message("pinned: ", paste(sprintf("%s %s", names(lock), unlist(lock)), collapse = ", "))
message("reference: ", paste(sprintf("%s %s", reference_only, vapply(reference_only, have, "")), collapse = ", "))
