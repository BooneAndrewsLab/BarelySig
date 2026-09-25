/**
 * A graph's box and violin statistics, run in the app's WebR on every
 * fixture the R oracle wrote (CLAUDE.md, Correctness).
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import { type Analysis, type Whiskers, createProject } from '@/model/project';
import { createColumnTable, createGroupedTable } from '@/model/table';
import { loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { graphSummary } from '.';
import type { GraphSummaryRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function request(x: readonly (number | null)[], options: Readonly<Record<string, Plain>>) {
  const values = x.filter((v): v is number => v !== null);
  const r: GraphSummaryRequest = {
    cells: [
      { id: 'c1', title: 'A', data: { kind: 'raw', values, dropped: { empty: 0, excluded: 0 } } },
    ],
    options: {
      whiskers: typeof options['whiskers'] === 'string' ? (options['whiskers'] as Whiskers) : null,
      kde:
        typeof options['adjust'] === 'number'
          ? { adjust: options['adjust'], log: options['log'] === true }
          : null,
    },
  };
  return r;
}

describe('graph summaries, against the R oracle', () => {
  const fixtures = loadFixtures('graphsummary');

  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(12);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const req = request(f.input['x'] ?? [], f.options ?? {});
      const out = await engine.run(graphSummary.job(req));
      const [cell] = graphSummary.parse(out.value, req, out.warnings).cells;
      expect(mismatches(cell as unknown as Plain, f.expected, f.tolerance)).toEqual([]);
    },
    60_000,
  );

  it('gives no violin for two values, and the summary of summary data', async () => {
    const req: GraphSummaryRequest = {
      cells: [
        {
          id: 'a',
          title: 'A',
          data: { kind: 'raw', values: [1, 2], dropped: { empty: 0, excluded: 0 } },
        },
        {
          id: 'b',
          title: 'B',
          data: { kind: 'summary', mean: 10, sd: 2, n: 4, interval: null, entered: 'mean-sd-n' },
        },
        {
          id: 'c',
          title: 'C',
          data: { kind: 'raw', values: [], dropped: { empty: 0, excluded: 0 } },
        },
      ],
      options: { whiskers: 'tukey', kde: { adjust: 1, log: false } },
    };
    const out = await engine.run(graphSummary.job(req));
    const r = graphSummary.parse(out.value, req, out.warnings);
    expect(r.cells.map((c) => [c.id, c.n, c.mean, c.kde, c.whiskers === null])).toEqual([
      ['a', 2, 1.5, null, false],
      ['b', 4, 10, null, true],
      ['c', 0, null, null, true],
    ]);
  }, 60_000);
});

describe('prepare', () => {
  it('reads a Column table’s data sets and says why it can’t run', () => {
    const t = createColumnTable({ title: 'T', groups: ['WT', 'KO'], rows: 1 });
    const [wt, ko] = t.dataSets;
    const [r0] = t.rows;
    if (!wt || !ko || !r0) throw new Error('unreachable');
    let p = applyEdit(createProject('P'), { op: 'addTable', table: t });
    const a: Extract<Analysis, { kind: 'graph-summary' }> = {
      id: asId('g/summary'),
      title: 'Summary',
      kind: 'graph-summary',
      options: { whiskers: 'min-max', kde: null },
      input: { kind: 'table', table: t.id, dataSets: [wt.id, ko.id] },
    };
    expect(graphSummary.prepare(a, p)).toEqual({
      ok: false,
      reason: 'There are no values to plot yet.',
    });
    p = applyEdit(p, {
      op: 'setCells',
      table: t.id,
      cells: [{ dataSet: ko.id, subcolumn: 0, row: r0.id, value: 4 }],
    });
    const r = graphSummary.prepare(a, p);
    expect(r.ok && r.request.cells.map((c) => c.id)).toEqual([wt.id, ko.id]);
    const g = createGroupedTable({
      title: 'G',
      rowTitles: ['a'],
      groups: ['x'],
      format: { kind: 'replicates', count: 2 },
    });
    const q = applyEdit(p, { op: 'addTable', table: g });
    expect(
      graphSummary.prepare({ ...a, input: { kind: 'table', table: g.id, dataSets: [] } }, q),
    ).toMatchObject({ ok: false });
  });
});
