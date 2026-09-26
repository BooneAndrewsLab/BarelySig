/**
 * What an analysis result depends on, as one content hash (item 02): the
 * data it reads, its options, and the engine that computes it. A result
 * is fresh when its recorded hash equals the current one; nothing has to
 * notice an edit, and undoing back to earlier data finds earlier results
 * valid again.
 *
 * Only what can change the numbers goes in. Renaming the analysis or the
 * table, recolouring a data set or changing its display decimals does not
 * make results stale; renaming a data set or a row level does, because
 * results label groups by those names.
 */
import type { Id } from './ids';
import { type Json, canonicalJson, hashString } from './json';
import type { Analysis, Project } from './project';
import type { Table } from './table';

/** The engine a result was computed with. Part of every hash, so an engine update rechecks results. */
export interface EngineInfo {
  readonly webr: string;
  readonly r: string;
  /** R package versions (`src/engine/lock.json`). */
  readonly packages: Readonly<Record<string, string>>;
  /**
   * A fingerprint of each analysis's own code and result format (item 04),
   * so changing how an analysis computes makes its saved results stale.
   */
  readonly code?: Readonly<Record<string, string>>;
}

function tableInput(table: Table, dataSets: readonly Id[]): Json | null {
  const sets: Json[] = [];
  for (const id of dataSets) {
    const d = table.dataSets.find((x) => x.id === id);
    if (!d) return null;
    sets.push({
      id: d.id,
      title: d.title,
      subcolumns: d.subcolumns,
      excluded: [...d.excluded].sort(),
    });
  }
  return {
    type: table.type,
    format: table.format,
    rows: table.rows.map((r) => ({ id: r.id, title: r.title })),
    dataSets: sets,
  };
}

/**
 * Hashes of an analysis's input, kept per table object: tables are
 * immutable, so a table that didn't change keeps its hashes, and an edit
 * elsewhere (a graph's format, a notice) doesn't rehash thousands of cells.
 */
const byTable = new WeakMap<Table, Map<string, string | null>>();

/**
 * `hashJson({ kind, options, source, engine })`, written out: the keys in
 * canonical (sorted) order, with the source's JSON made once per table.
 */
function hashWith(rest: string, source: string): string {
  return hashString(`{${rest},"source":${source}}`);
}

function restOf(a: Analysis, engine: EngineInfo): string {
  const e = canonicalJson({
    webr: engine.webr,
    r: engine.r,
    packages: { ...engine.packages },
    code: { ...(engine.code ?? {}) },
  });
  return `"engine":${e},"kind":${canonicalJson(a.kind)},"options":${canonicalJson({ ...a.options })}`;
}

function tableHash(table: Table, a: Analysis, dataSets: readonly Id[], engine: EngineInfo) {
  const rest = restOf(a, engine);
  const key = `${dataSets.join('\u0000')}\u0001${rest}`;
  let known = byTable.get(table);
  if (!known) {
    known = new Map();
    byTable.set(table, known);
  }
  const hit = known.get(key);
  if (hit !== undefined) return hit;
  const source = tableInput(table, dataSets);
  const hash = source === null ? null : hashWith(rest, canonicalJson(source));
  known.set(key, hash);
  return hash;
}

/**
 * The input hashes of every analysis in the project, or null for one
 * whose input is missing (a deleted table, a broken chain). Chained
 * analyses hash their upstream's input hash, not its result, so the hash
 * is known before anything has run.
 */
export function inputHashes(project: Project, engine: EngineInfo): Map<Id, string | null> {
  const out = new Map<Id, string | null>();
  const visiting = new Set<Id>();
  const hashOf = (a: Analysis): string | null => {
    const known = out.get(a.id);
    if (known !== undefined) return known;
    if (visiting.has(a.id)) return null;
    visiting.add(a.id);
    let hash: string | null;
    if (a.input.kind === 'table') {
      const t = project.tables.get(a.input.table);
      hash = t ? tableHash(t, a, a.input.dataSets, engine) : null;
    } else {
      const up = project.analyses.get(a.input.analysis);
      const h = up ? hashOf(up) : null;
      const source: Json | null = h === null ? null : { analysis: h };
      hash = source === null ? null : hashWith(restOf(a, engine), canonicalJson(source));
    }
    visiting.delete(a.id);
    out.set(a.id, hash);
    return hash;
  };
  project.analyses.forEach((a) => {
    hashOf(a);
  });
  return out;
}
