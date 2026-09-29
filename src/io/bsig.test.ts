import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import { createProject } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import { createColumnTable } from '@/model/table';
import { play, sessionArb } from '@/test/modelArbitraries';

import { BsigError, type Migration, SCHEMA_VERSION, migrate, readBsig, writeBsig } from './bsig';

const ENGINE: EngineInfo = { webr: '0.6.0', r: '4.6.0', packages: { mvtnorm: '1.2-4' } };

function sample() {
  const table = createColumnTable({ title: 'Viability', groups: ['WT', 'KO'], rows: 3 });
  const [wt, ko] = table.dataSets;
  const [r0, r1, r2] = table.rows;
  if (!wt || !ko || !r0 || !r1 || !r2) throw new Error('unreachable');
  let project = applyEdit(createProject('Lab meeting'), { op: 'addTable', table });
  project = applyEdit(project, {
    op: 'setCells',
    table: table.id,
    cells: [
      { dataSet: wt.id, subcolumn: 0, row: r0.id, value: 1.5 },
      { dataSet: wt.id, subcolumn: 0, row: r1.id, value: 0 },
      { dataSet: ko.id, subcolumn: 0, row: r0.id, value: 3e-310 },
      { dataSet: ko.id, subcolumn: 0, row: r2.id, value: 0.1 },
    ],
  });
  project = applyEdit(project, {
    op: 'setExcluded',
    table: table.id,
    dataSet: ko.id,
    cells: [{ subcolumn: 0, row: r2.id }],
    excluded: true,
  });
  const analysis = asId('a_1');
  project = applyEdit(project, {
    op: 'addAnalysis',
    analysis: {
      id: analysis,
      title: 'Unpaired t test',
      kind: 't-test',
      options: { paired: false, welch: true, tails: 'two' },
      input: { kind: 'table', table: table.id, dataSets: [wt.id, ko.id] },
    },
  });
  const results = new Map<ReturnType<typeof asId>, ResultEntry>([
    [analysis, { inputHash: 'abc', ok: true, value: { p: 1.234567890123456e-18, t: -3.25 } }],
  ]);
  return { project, results };
}

describe('.bsig', () => {
  it('round-trips a project with its results exactly', () => {
    const { project, results } = sample();
    const text = writeBsig({ project, results, engine: ENGINE, app: '0.2.0' });
    const back = readBsig(text);
    expect(back.project).toStrictEqual(project);
    expect(back.results).toStrictEqual(results);
    expect(back.engine).toStrictEqual(ENGINE);
    expect(back.app).toBe('0.2.0');
  });

  it('keeps empty cells empty and tiny values exact', () => {
    const { project, results } = sample();
    const doc = JSON.parse(writeBsig({ project, results, engine: null, app: '0.2.0' })) as {
      project: {
        tables: { dataSets: { subcolumns: (number | null)[][]; excluded: string[] }[] }[];
      };
      schemaVersion: number;
    };
    const [wt, ko] = doc.project.tables[0]?.dataSets ?? [];
    expect(wt?.subcolumns).toEqual([[1.5, 0, null]]);
    expect(ko?.subcolumns).toEqual([[3e-310, null, 0.1]]);
    expect(ko?.excluded).toHaveLength(1);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('round-trips any editing session, and writes the same text again', () => {
    fc.assert(
      fc.property(sessionArb, (shapes) => {
        const { project } = play(shapes);
        const text = writeBsig({ project, results: new Map(), engine: ENGINE, app: '0.2.0' });
        const back = readBsig(text);
        expect(back.project).toStrictEqual(project);
        expect(writeBsig({ ...back, engine: ENGINE })).toBe(text);
      }),
      { numRuns: 200 },
    );
  });

  it('generates every trace error band, so the round trip above covers the field', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(sessionArb, (shapes) => {
        for (const g of play(shapes).project.graphs.values())
          if (g.plot.kind === 'xy-scatter') seen.add(g.plot.error);
      }),
      { numRuns: 1000 },
    );
    expect([...seen].sort()).toEqual(['ci95', 'none', 'sd', 'sem']);
  });

  it('opens a file from before the error band as no band', () => {
    const doc = JSON.parse(
      writeBsig({ project: sample().project, results: new Map(), engine: null, app: '0.2.0' }),
    ) as { project: { graphs: { plot: Record<string, unknown> }[] } };
    const plots = doc.project.graphs.map((g) => g.plot).filter((p) => p['kind'] === 'xy-scatter');
    for (const p of plots) delete p['error'];
    const back = readBsig(JSON.stringify(doc));
    for (const g of back.project.graphs.values())
      if (g.plot.kind === 'xy-scatter') expect(g.plot.error).toBe('none');
  });

  it('drops results of analyses the project does not have', () => {
    const { project } = sample();
    const results = new Map<ReturnType<typeof asId>, ResultEntry>([
      [asId('a_gone'), { inputHash: 'h', ok: false, error: 'x' }],
    ]);
    expect(readBsig(writeBsig({ project, results, engine: null, app: '0.2.0' })).results.size).toBe(
      0,
    );
  });

  describe('refuses, with a message', () => {
    const valid = (): Record<string, unknown> =>
      JSON.parse(writeBsig({ ...sample(), engine: null, app: '0.2.0' })) as Record<string, unknown>;

    it('text that is not JSON', () => {
      expect(() => readBsig('{"format": "barelysig", ')).toThrow(/not valid JSON/);
    });

    it('JSON that is not a BarelySig file', () => {
      expect(() => readBsig('{"hello": 1}')).toThrow(/not a BarelySig project/);
      expect(() => readBsig('[1, 2]')).toThrow(BsigError);
    });

    it('a file from a newer version of the app', () => {
      const doc = { ...valid(), schemaVersion: SCHEMA_VERSION + 1 };
      expect(() => readBsig(JSON.stringify(doc))).toThrow(/newer version of BarelySig/);
    });

    it('a file without a schema version', () => {
      const { schemaVersion: _, ...doc } = valid();
      expect(() => readBsig(JSON.stringify(doc))).toThrow(/schema version/);
    });

    it('a damaged cell, naming where it is', () => {
      const text = writeBsig({ ...sample(), engine: null, app: '0.2.0' }).replace('1.5', '"1.5"');
      expect(() => readBsig(text)).toThrow(
        /file\.project\.tables\[0\]\.dataSets\[0\]\.subcolumns\[0\]\[0\] should be a number/,
      );
    });

    it('a file that breaks a model invariant', () => {
      const doc = valid() as { project: { tables: { rows: unknown[] }[] } };
      doc.project.tables[0]?.rows.pop();
      expect(() => readBsig(JSON.stringify(doc))).toThrow(/damaged: .*cells for 2 rows/);
    });

    it('an analysis this version does not know', () => {
      const text = writeBsig({ ...sample(), engine: null, app: '0.2.0' }).replace(
        '"t-test"',
        '"anova-9000"',
      );
      expect(() => readBsig(text)).toThrow(/does not know \("anova-9000"\)/);
    });
  });
});

describe('migrate', () => {
  // Stand-in migrations: v1 renamed `name` to `title`, v2 added `tags`.
  const chain: readonly Migration[] = [
    ({ name, ...rest }) => ({ ...rest, title: name ?? null }),
    (doc) => ({ ...doc, tags: [] }),
  ];

  it('runs every step from the file version to the current one', () => {
    expect(migrate({ schemaVersion: 1, name: 'x' }, chain)).toEqual({
      schemaVersion: 3,
      title: 'x',
      tags: [],
    });
    expect(migrate({ schemaVersion: 2, title: 'y' }, chain)).toEqual({
      schemaVersion: 3,
      title: 'y',
      tags: [],
    });
    expect(migrate({ schemaVersion: 3, title: 'z', tags: [] }, chain)).toEqual({
      schemaVersion: 3,
      title: 'z',
      tags: [],
    });
  });

  it('refuses versions newer than the chain, and nonsense', () => {
    expect(() => migrate({ schemaVersion: 4 }, chain)).toThrow(/newer version/);
    expect(() => migrate({ schemaVersion: 0 }, chain)).toThrow(/schema version/);
    expect(() => migrate({ schemaVersion: 1.5 }, chain)).toThrow(/schema version/);
  });
});
