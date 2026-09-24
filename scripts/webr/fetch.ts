/**
 * Stages everything WebR needs into public/webr/ so the app serves it
 * itself: no CDN, no request to r-wasm.org from a user's browser.
 *
 *   public/webr/            the runtime, copied from node_modules/webr/dist
 *   public/webr/repo/       a CRAN-like repository with our packages and their
 *                           dependencies, downloaded from the WebR repository
 *   public/webr/repo/lock.json  the exact versions staged
 *
 * The versions are pinned in src/engine/lock.json (item 04): the script
 * fails if the repository resolves to anything else, so the engine users
 * get never changes by itself. `-- --update-lock` rewrites the pin on
 * purpose.
 *
 * Downloads are cached in node_modules/.cache/webr-repo, so a rebuild is
 * offline. Run by `npm run webr:fetch` (and before dev/build).
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
interface Config {
  readonly webr: string;
  readonly rVersion: string;
  readonly repo: string;
  readonly packages: readonly string[];
}
type Fields = Record<string, string>;

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;

const config = await readJson<Config>(join(root, 'scripts/webr/packages.json'));
const out = join(root, 'public/webr');
const cache = join(root, 'node_modules/.cache/webr-repo');
const contrib = `bin/emscripten/contrib/${config.rVersion}`;

const installed = await readJson<{ version: string }>(join(root, 'node_modules/webr/package.json'));
if (installed.version !== config.webr) {
  throw new Error(`node_modules has webr ${installed.version}, packages.json pins ${config.webr}`);
}

/** Packages that ship inside WebR's own filesystem image. */
const BASE = new Set([
  'R',
  'base',
  'compiler',
  'datasets',
  'graphics',
  'grDevices',
  'grid',
  'methods',
  'parallel',
  'splines',
  'stats',
  'stats4',
  'tcltk',
  'tools',
  'utils',
  'webr',
]);

// --- runtime -----------------------------------------------------------------
const dist = join(root, 'node_modules/webr/dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of ['webr-worker.js', 'R.js', 'R.wasm', 'libRblas.so', 'libRlapack.so', 'vfs']) {
  await cp(join(dist, f), join(out, f), { recursive: true });
}

// --- packages ----------------------------------------------------------------
async function cached(url: string, file: string): Promise<Buffer> {
  const path = join(cache, file);
  try {
    await stat(path);
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFile(path);
}

/** PACKAGES index → Map(name → fields). Cached per WebR version. */
const index = new Map<string, { fields: Fields; block: string }>();
const text = (
  await cached(`${config.repo}/${contrib}/PACKAGES`, `${config.webr}/PACKAGES`)
).toString('utf8');
for (const block of text.split(/\n\s*\n/)) {
  const fields: Fields = {};
  let key = '';
  for (const line of block.split('\n')) {
    if (/^\s/.test(line) && key) fields[key] = `${fields[key] ?? ''} ${line.trim()}`;
    else {
      const m = /^([^:]+):\s*(.*)$/.exec(line);
      if (m?.[1] !== undefined) fields[(key = m[1])] = m[2] ?? '';
    }
  }
  const name = fields['Package'];
  if (name !== undefined) index.set(name, { fields, block: block.trim() });
}

// LinkingTo is compile-time only (headers); a binary never loads it.
const deps = (f: Fields): string[] =>
  ['Depends', 'Imports']
    .flatMap((k) => (f[k] ?? '').split(','))
    .map((d) => d.trim().split(/[\s(]/)[0] ?? '')
    .filter((d) => d !== '' && !BASE.has(d));

const need = new Set<string>();
const queue = [...config.packages];
for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
  if (need.has(name)) continue;
  const entry = index.get(name);
  if (!entry) throw new Error(`${name} is not in the WebR ${config.rVersion} repository`);
  need.add(name);
  queue.push(...deps(entry.fields));
}

const repoDir = join(out, 'repo', contrib);
await mkdir(repoDir, { recursive: true });
const lock: Record<string, string> = {};
const blocks: string[] = [];
let bytes = 0;
for (const name of [...need].sort()) {
  const entry = index.get(name);
  if (!entry) throw new Error(`${name}: missing from index`);
  const version = entry.fields['Version'] ?? '';
  const md5 = entry.fields['MD5sum'];
  const file = `${name}_${version}.tgz`;
  const data = await cached(`${config.repo}/${contrib}/${file}`, `${config.webr}/${file}`);
  if (md5 !== undefined && createHash('md5').update(data).digest('hex') !== md5) {
    throw new Error(`${file}: MD5 mismatch`);
  }
  await writeFile(join(repoDir, file), data);
  lock[name] = version;
  const { block } = entry;
  blocks.push(block);
  bytes += data.length;
}
const lockPath = join(root, 'src/engine/lock.json');
interface Lock {
  readonly $comment?: string;
  readonly webr: string;
  readonly r: string;
  readonly packages: Record<string, string>;
}
const pinned = await readJson<Lock>(lockPath);
if (process.argv.includes('--update-lock')) {
  await writeFile(
    lockPath,
    `${JSON.stringify({ ...pinned, webr: config.webr, packages: lock }, null, 2)}\n`,
  );
  console.warn(`updated ${lockPath}: rerun oracle:pin, oracle:generate and the parity test`);
} else {
  const drift = [...new Set([...Object.keys(lock), ...Object.keys(pinned.packages)])]
    .filter((name) => lock[name] !== pinned.packages[name])
    .map(
      (name) =>
        `${name}: pinned ${pinned.packages[name] ?? 'none'}, repository has ${lock[name] ?? 'none'}`,
    );
  if (pinned.webr !== config.webr)
    drift.unshift(`webr: pinned ${pinned.webr}, packages.json has ${config.webr}`);
  if (drift.length > 0) {
    throw new Error(
      `The WebR engine drifted from src/engine/lock.json:\n  ${drift.join('\n  ')}\n` +
        'Update deliberately with `npm run webr:fetch -- --update-lock`, then oracle:pin, oracle:generate and the parity test.',
    );
  }
}
await writeFile(join(repoDir, 'PACKAGES'), `${blocks.join('\n\n')}\n`);
await writeFile(join(out, 'repo/lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
console.warn(
  `webr ${config.webr}: runtime + ${need.size} packages (${(bytes / 1048576).toFixed(1)} MB) → public/webr/`,
);
