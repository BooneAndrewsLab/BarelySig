import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { play, sessionArb } from '@/test/modelArbitraries';

import type { Id } from './ids';
import { type EngineInfo, inputHashes } from './inputs';
import { type Json, hashJson } from './json';
import type { Analysis, Project } from './project';

const ENGINE: EngineInfo = {
  webr: '0.6.0',
  r: '4.6.0',
  packages: { mvtnorm: '1.3-3' },
  code: { 't-test': 'abc' },
};

/** The hashes as first written: one `hashJson` of the whole input, nothing kept. */
function reference(project: Project, engine: EngineInfo): Map<Id, string | null> {
  const out = new Map<Id, string | null>();
  const hashOf = (a: Analysis, seen: Set<Id>): string | null => {
    if (out.has(a.id)) return out.get(a.id) ?? null;
    if (seen.has(a.id)) return null;
    seen.add(a.id);
    let source: Json | null = null;
    if (a.input.kind === 'table') {
      const t = project.tables.get(a.input.table);
      const sets = a.input.dataSets.map((id) => t?.dataSets.find((d) => d.id === id));
      if (t && sets.every((d) => d !== undefined)) {
        source = {
          type: t.type,
          format: t.format,
          rows: t.rows.map((r) => ({ id: r.id, title: r.title })),
          dataSets: sets.map((d) => ({
            id: d.id,
            title: d.title,
            subcolumns: d.subcolumns,
            excluded: [...d.excluded].sort(),
          })),
        };
      }
    } else {
      const up = project.analyses.get(a.input.analysis);
      const h = up ? hashOf(up, seen) : null;
      source = h === null ? null : { analysis: h };
    }
    const hash =
      source === null
        ? null
        : hashJson({
            kind: a.kind,
            options: { ...a.options },
            source,
            engine: {
              webr: engine.webr,
              r: engine.r,
              packages: { ...engine.packages },
              code: { ...(engine.code ?? {}) },
            },
          });
    out.set(a.id, hash);
    return hash;
  };
  project.analyses.forEach((a) => hashOf(a, new Set()));
  return out;
}

describe('inputHashes', () => {
  it('gives the hashes saved results were recorded with, twice over (kept per table)', () => {
    fc.assert(
      fc.property(sessionArb, (shapes) => {
        const { project } = play(shapes);
        // Few random sessions make an analysis (about 1 in 16): test only those.
        fc.pre(project.analyses.size > 0);
        const want = reference(project, ENGINE);
        expect(inputHashes(project, ENGINE)).toEqual(want);
        expect(inputHashes(project, ENGINE)).toEqual(want);
        expect(inputHashes(project, { ...ENGINE, r: '4.6.1' })).toEqual(
          reference(project, { ...ENGINE, r: '4.6.1' }),
        );
      }),
      { numRuns: 100, maxSkipsPerRun: 1000 },
    );
  });
});
