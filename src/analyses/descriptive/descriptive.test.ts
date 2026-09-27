/**
 * The app's descriptive statistics, run in the app's WebR on every
 * fixture the R oracle wrote (CLAUDE.md, Correctness).
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import { type Analysis, type Project, createProject } from '@/model/project';

type Descriptive = Extract<Analysis, { kind: 'descriptive' }>;
import type { Cell } from '@/model/missing';
import type { GroupData } from '@/model/selectors';
import { type EntryFormat, createColumnTable, createGroupedTable } from '@/model/table';
import { loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { descriptive } from '.';
import type { DescriptiveRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function camelKeys(v: Plain): Plain {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [camel(k), x]));
}

function groupFrom(
  input: Readonly<Record<string, readonly (number | null)[]>>,
  summary: boolean,
): GroupData {
  if (summary) {
    const one = (k: string) => input[k]?.[0] ?? null;
    return {
      kind: 'summary',
      mean: one('mean'),
      sd: one('sd'),
      n: one('n'),
      interval: null,
      entered: 'mean-sd-n',
    };
  }
  const x = input['x'] ?? [];
  const values = x.filter((v): v is number => v !== null);
  return { kind: 'raw', values, dropped: { empty: x.length - values.length, excluded: 0 } };
}

describe('descriptive statistics, against the R oracle', () => {
  const fixtures = loadFixtures('descriptive');

  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const summary = f.options?.['from'] === 'summary';
      const request: DescriptiveRequest = {
        kind: 'column',
        groups: [{ id: 'ds_1', title: 'A', data: groupFrom(f.input, summary) }],
      };
      const out = await engine.run(descriptive.job(request));
      const r = descriptive.parse(out.value, request, out.warnings);
      const [group] = r.kind === 'column' ? r.groups : [];
      expect(mismatches(group as unknown as Plain, camelKeys(f.expected), f.tolerance)).toEqual([]);
    },
    60_000,
  );

  it('describes several groups in one run, in order', async () => {
    const request: DescriptiveRequest = {
      kind: 'column',
      groups: [
        { id: 'a', title: 'A', data: groupFrom({ x: [1, 2, 3] }, false) },
        { id: 'b', title: 'B', data: groupFrom({ mean: [10], sd: [2], n: [4] }, true) },
        { id: 'c', title: 'C', data: groupFrom({ x: [] }, false) },
      ],
    };
    const out = await engine.run(descriptive.job(request));
    const r = descriptive.parse(out.value, request, out.warnings);
    if (r.kind !== 'column') throw new Error('unreachable');
    expect(r.groups.map((g) => [g.title, g.from, g.n, g.mean])).toEqual([
      ['A', 'values', 3, 2],
      ['B', 'summary', 4, 10],
      ['C', 'values', 0, null],
    ]);
    expect(r.groups[1]?.median).toBeNull();
  }, 60_000);

  it('pools a data set over rows (item 18, #54), as the R oracle describes the concatenation', async () => {
    const pooledFixture = fixtures.find((f) => f.id.endsWith('/pooled'));
    const basic = fixtures.find((f) => f.id.endsWith('/basic'));
    const missing = fixtures.find((f) => f.id.endsWith('/missing'));
    if (!pooledFixture || !basic || !missing) throw new Error('missing fixture');

    const row1 = groupFrom(basic.input, false);
    const row2 = groupFrom(missing.input, false);
    if (row1.kind !== 'raw' || row2.kind !== 'raw') throw new Error('unreachable');
    const request: DescriptiveRequest = {
      kind: 'grouped',
      rows: [
        { id: 'row1', title: 'Row 1' },
        { id: 'row2', title: 'Row 2' },
      ],
      columns: [{ id: 'ds_1', title: 'A' }],
      cells: [[row1], [row2]],
      pooled: [
        {
          kind: 'raw',
          values: [...row1.values, ...row2.values],
          dropped: { empty: row1.dropped.empty + row2.dropped.empty, excluded: 0 },
        },
      ],
    };
    const out = await engine.run(descriptive.job(request));
    const r = descriptive.parse(out.value, request, out.warnings);
    if (r.kind !== 'grouped' || r.pooled === null) throw new Error('unreachable');
    expect(
      mismatches(
        r.pooled[0] as unknown as Plain,
        camelKeys(pooledFixture.expected),
        pooledFixture.tolerance,
      ),
    ).toEqual([]);
  }, 60_000);
});

describe('prepare', () => {
  function project() {
    const t = createColumnTable({ title: 'T', groups: ['WT', 'KO'], rows: 2 });
    const [wt, ko] = t.dataSets;
    const [r0] = t.rows;
    if (!wt || !ko || !r0) throw new Error('unreachable');
    let p: Project = applyEdit(createProject('P'), { op: 'addTable', table: t });
    const analysis = (dataSets = [wt.id, ko.id]): Descriptive => ({
      id: asId('a_1'),
      title: 'Stats',
      kind: 'descriptive',
      options: {},
      input: { kind: 'table', table: t.id, dataSets },
    });
    const fill = () => {
      p = applyEdit(p, {
        op: 'setCells',
        table: t.id,
        cells: [{ dataSet: wt.id, subcolumn: 0, row: r0.id, value: 3 }],
      });
    };
    return {
      get p() {
        return p;
      },
      analysis,
      fill,
    };
  }

  it('says why it cannot run, in plain words', () => {
    const s = project();
    expect(descriptive.prepare(s.analysis(), s.p)).toEqual({
      ok: false,
      reason: 'There are no values to describe yet.',
    });
    expect(descriptive.prepare(s.analysis([]), s.p)).toMatchObject({
      reason: 'Choose at least one group to describe.',
    });
    const g = createGroupedTable({
      title: 'G',
      rowTitles: ['a'],
      groups: ['x'],
      format: { kind: 'replicates', count: 2 },
    });
    const withGrouped = applyEdit(s.p, { op: 'addTable', table: g });
    const onGrouped: Descriptive = {
      ...s.analysis(),
      input: { kind: 'table', table: g.id, dataSets: [] },
    };
    expect(descriptive.prepare(onGrouped, withGrouped)).toMatchObject({ ok: false });
  });

  it('hands over each group, with empty and excluded cells already dropped', () => {
    const s = project();
    s.fill();
    const r = descriptive.prepare(s.analysis(), s.p);
    expect(
      r.ok && r.request.kind === 'column' && r.request.groups.map((g) => [g.title, g.data]),
    ).toEqual([
      ['WT', { kind: 'raw', values: [3], dropped: { empty: 0, excluded: 0 } }],
      ['KO', { kind: 'raw', values: [], dropped: { empty: 0, excluded: 0 } }],
    ]);
  });
});

describe('prepare, Grouped tables (item 18, #54)', () => {
  function project(format: EntryFormat = { kind: 'replicates', count: 2 }) {
    const t = createGroupedTable({
      title: 'G',
      rowTitles: ['Row A', 'Row B'],
      groups: ['x', 'y'],
      format,
    });
    const [x, y] = t.dataSets;
    const [r0, r1] = t.rows;
    if (!x || !y || !r0 || !r1) throw new Error('unreachable');
    let p: Project = applyEdit(createProject('P'), { op: 'addTable', table: t });
    const analysis = (dataSets = [x.id, y.id]): Descriptive => ({
      id: asId('a_1'),
      title: 'Stats',
      kind: 'descriptive',
      options: {},
      input: { kind: 'table', table: t.id, dataSets },
    });
    const setCells = (
      cells: readonly {
        readonly dataSet: string;
        readonly subcolumn: number;
        readonly row: string;
        readonly value: Cell;
      }[],
    ) => {
      p = applyEdit(p, {
        op: 'setCells',
        table: t.id,
        cells: cells.map((c) => ({
          dataSet: c.dataSet === 'x' ? x.id : y.id,
          subcolumn: c.subcolumn,
          row: c.row === 'r0' ? r0.id : r1.id,
          value: c.value,
        })),
      });
    };
    return {
      get p() {
        return p;
      },
      analysis,
      setCells,
      t,
      x,
      y,
      r0,
      r1,
    };
  }

  it('describes a Grouped table too, no longer refusing it', () => {
    const s = project();
    expect(descriptive.prepare(s.analysis(), s.p)).toEqual({
      ok: false,
      reason: 'There are no values to describe yet.',
    });
    s.setCells([
      { dataSet: 'x', subcolumn: 0, row: 'r0', value: 1 },
      { dataSet: 'x', subcolumn: 1, row: 'r0', value: 3 },
      { dataSet: 'x', subcolumn: 0, row: 'r1', value: 5 },
      { dataSet: 'y', subcolumn: 0, row: 'r0', value: 2 },
    ]);
    const r = descriptive.prepare(s.analysis(), s.p);
    expect(r.ok).toBe(true);
    if (!r.ok || r.request.kind !== 'grouped') throw new Error('unreachable');
    expect(r.request.rows.map((row) => row.title)).toEqual(['Row A', 'Row B']);
    expect(r.request.columns.map((c) => c.title)).toEqual(['x', 'y']);
    expect(r.request.cells[0]?.[0]).toEqual({
      kind: 'raw',
      values: [1, 3],
      dropped: { empty: 0, excluded: 0 },
    });
    // Row B's second replicate is left empty: one empty cell, as a Column table would count it.
    expect(r.request.cells[1]?.[0]).toEqual({
      kind: 'raw',
      values: [5],
      dropped: { empty: 1, excluded: 0 },
    });
    // Pooled: x's row A (1, 3) and row B (5) values, concatenated, empty cells summed.
    expect(r.request.pooled?.[0]).toEqual({
      kind: 'raw',
      values: [1, 3, 5],
      dropped: { empty: 1, excluded: 0 },
    });
  });

  it('has no pooled statistics from summary data (percentiles can’t be recovered, note 18)', () => {
    const s = project({ kind: 'summary', stats: 'mean-sd-n' });
    s.setCells([
      { dataSet: 'x', subcolumn: 0, row: 'r0', value: 5 },
      { dataSet: 'x', subcolumn: 1, row: 'r0', value: 1 },
      { dataSet: 'x', subcolumn: 2, row: 'r0', value: 4 },
    ]);
    const r = descriptive.prepare(s.analysis(), s.p);
    expect(r.ok).toBe(true);
    if (!r.ok || r.request.kind !== 'grouped') throw new Error('unreachable');
    expect(r.request.pooled).toBeNull();
  });
});
