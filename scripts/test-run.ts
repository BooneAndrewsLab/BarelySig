/**
 * `npm run test:check` (the test step of `npm run check`): runs vitest, with
 * the engine parity suite (src/test/parity.test.ts, the slow part) only when
 * the change touches something it depends on (item 44).
 *
 * Changed files = everything differing from the merge-base with origin/main
 * (commits on the branch, staged, unstaged) plus untracked files. Be
 * conservative: if git can't tell, run it.
 *
 *   PARITY=1  always run parity        PARITY=0  always skip it
 *   CI set    always run parity (CI and release builds test everything)
 *
 * `npm run test:parity` runs the parity suite alone; plain `npm test` and
 * `npm run test:coverage` never skip anything.
 */
import { spawnSync } from 'node:child_process';

/** Paths whose change can alter what parity checks. */
export const PARITY_PATHS: readonly RegExp[] = [
  /^src\/analyses\//, // R code, fixtures, oracles, parsers
  /^src\/engine\//, // WebR bridge, lock.json, engine info
  /^scripts\/webr\//, // staging and package list
  /^scripts\/oracle\//, // fixture generation
  /^public\/webr\//, // staged runtime and package repo
  /^src\/test\/(parity|fixtures|webrNode|globalSetup|setup)\.ts$/,
  /^scripts\/test-run\.ts$/,
  /^vite\.config\.ts$/,
  /^package(-lock)?\.json$/,
  /^\.nvmrc$/,
];

function git(args: string[]): string | null {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/** Why parity runs or is skipped. */
export function decide(env: NodeJS.ProcessEnv): { run: boolean; why: string } {
  if (env['PARITY'] === '1') return { run: true, why: 'PARITY=1' };
  if (env['PARITY'] === '0') return { run: false, why: 'PARITY=0' };
  if (env['CI'] !== undefined && env['CI'] !== '' && env['CI'] !== 'false')
    return { run: true, why: 'CI always runs everything' };

  const base = git(['merge-base', 'HEAD', 'origin/main'])?.trim();
  const tracked = base ? git(['diff', '--name-only', base]) : null;
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  if (!base || tracked === null || untracked === null)
    return { run: true, why: 'could not tell what changed (git failed), so running it' };

  const files = `${tracked}\n${untracked}`.split('\n').filter((f) => f !== '');
  const hit = files.find((f) => PARITY_PATHS.some((p) => p.test(f)));
  return hit
    ? { run: true, why: `${hit} changed` }
    : {
        run: false,
        why: `no analysis, engine or test-harness file changed vs origin/main (${files.length} changed files); PARITY=1 to force`,
      };
}

if (import.meta.main) {
  const { run, why } = decide(process.env);
  // eslint-disable-next-line no-console
  console.log(`[parity] ${run ? 'RUNNING' : 'SKIPPED'}: ${why}`);
  const r = spawnSync('npx', ['vitest', 'run', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, PARITY: run ? '1' : '0' },
  });
  process.exit(r.status ?? 1);
}
