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
import { type Json, hashJson } from './json';
import type { Analysis, Project } from './project';
import type { Table } from './table';

/** The engine a result was computed with. Part of every hash, so an engine update rechecks results. */
export interface EngineInfo {
  readonly webr: string;
  readonly r: string;
  /** R package versions (`public/webr/repo/lock.json`). */
  readonly packages: Readonly<Record<string, string>>;
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
    let source: Json | null;
    if (a.input.kind === 'table') {
      const t = project.tables.get(a.input.table);
      source = t ? tableInput(t, a.input.dataSets) : null;
    } else {
      const up = project.analyses.get(a.input.analysis);
      const h = up ? hashOf(up) : null;
      source = h === null ? null : { analysis: h };
    }
    const hash =
      source === null
        ? null
        : hashJson({
            kind: a.kind,
            options: { ...a.options },
            source,
            engine: { ...engine, packages: { ...engine.packages } },
          });
    visiting.delete(a.id);
    out.set(a.id, hash);
    return hash;
  };
  project.analyses.forEach((a) => {
    hashOf(a);
  });
  return out;
}
