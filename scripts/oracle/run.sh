#!/usr/bin/env bash
# Runs the R oracle in the barelysig-r conda env (R pinned to the version
# WebR ships; see CLAUDE.md, Tooling).
#   scripts/oracle/run.sh pin        match package versions to src/engine/lock.json
#   scripts/oracle/run.sh generate   rewrite src/analyses/*/fixtures/*.json from src/analyses/*/oracle.R
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
rscript() { mamba run -n barelysig-r Rscript "$@"; }
case "${1:-}" in
  pin) rscript scripts/oracle/pin.R ;;
  generate) rscript scripts/oracle/generate.R "${@:2}" ;;
  *) echo "usage: $0 pin|generate [analysis-id...]" >&2; exit 2 ;;
esac
