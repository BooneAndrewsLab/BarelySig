# A faster `npm run check`

Issue #121. `npm run check` took about ten minutes, nearly all in
`src/test/parity.test.ts`: every fixture's recorded R code runs in the
app's WebR under Node and is compared with desktop R, one WebR, one case
at a time (the slowest, `nonlinear-regression/global-compare-missing-unequal`,
takes over a minute).

## Parallel

The suite starts a pool of `PARITY_JOBS` WebR instances (default
min(cores - 2, 4), at least 1) and runs its cases with `it.concurrent`.
`maxConcurrency` in `vite.config.ts` equals the pool size, so a case always
finds a free instance and its 180 s timeout only counts its own run. Each
case still runs in its own Shelter on one instance, so the answer does not
depend on the pool size or order. Test names, assertions and tolerances are
unchanged. An instance is a WASM R heap plus a worker (a few hundred MB), so
the default is bounded; raise it on a big machine.

## Selective

The local `check` runs `scripts/test-run.ts`, which decides whether the
parity suite runs. It compares the merge-base with `origin/main`
(branch commits, staged, unstaged) plus untracked files, and runs parity if
any changed file is under `src/analyses/`, `src/engine/`, `scripts/webr/`,
`scripts/oracle/`, `public/webr/`, one of the test harness files
(`src/test/{parity,fixtures,webrNode,globalSetup,setup}.ts`),
`scripts/test-run.ts`, `vite.config.ts`, `package.json`,
`package-lock.json` or `.nvmrc`. The list is `PARITY_PATHS` in the script.
Anything else (UI, model, graphs, docs) skips it. It is conservative: if
git cannot tell (no `origin/main`, not a repository), parity runs. The
script prints one line, `[parity] RUNNING: ...` or `[parity] SKIPPED: ...`;
a skipped suite shows as skipped in vitest's output (`describe.skipIf`),
not absent.

- `PARITY=1` forces it, `PARITY=0` skips it.
- `npm run test:parity` runs only the parity suite, always.
- Plain `npm test` and `npm run test:coverage` never skip anything.
- When `CI` is set (GitHub Actions) parity always runs. `ci.yml` runs
  `test:coverage` and `deploy.yml` runs `npm run check` with `PARITY: 1`,
  so CI and releases test everything.

The trade: a change outside the list that still alters R results is caught
by CI, not locally.
