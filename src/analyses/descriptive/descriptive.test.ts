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
import type { GroupData } from '@/model/selectors';
import { createColumnTable, createGroupedTable } from '@/model/table';
import { loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { descriptive } from '.';

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
      const request = { groups: [{ id: 'ds_1', title: 'A', data: groupFrom(f.input, summary) }] };
      const out = await engine.run(descriptive.job(request));
      const [group] = descriptive.parse(out.value, request, out.warnings).groups;
      expect(mismatches(group as unknown as Plain, camelKeys(f.expected), f.tolerance)).toEqual([]);
    },
    60_000,
  );

  it('describes several groups in one run, in order', async () => {
    const request = {
      groups: [
        { id: 'a', title: 'A', data: groupFrom({ x: [1, 2, 3] }, false) },
        { id: 'b', title: 'B', data: groupFrom({ mean: [10], sd: [2], n: [4] }, true) },
        { id: 'c', title: 'C', data: groupFrom({ x: [] }, false) },
      ],
    };
    const out = await engine.run(descriptive.job(request));
    const r = descriptive.parse(out.value, request, out.warnings);
    expect(r.groups.map((g) => [g.title, g.from, g.n, g.mean])).toEqual([
      ['A', 'values', 3, 2],
      ['B', 'summary', 4, 10],
      ['C', 'values', 0, null],
    ]);
    expect(r.groups[1]?.median).toBeNull();
  }, 60_000);
});

describe('prepare', () => {
  function project() {
    const t = createColumnTable({ title: 'T', groups: ['WT', 'KO'], rows: 2 });
    const [wt, ko] = t.dataSets;
    const [r0] = t.rows;
    if (!wt || !ko || !r0) throw new Error('unreachable');
    let p: Project = applyEdit(createProject('P'), { op: 'addTable', table: t });
    const analysis = (dataSets = [wt.id, ko.id]): Analysis => ({
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
    const onGrouped: Analysis = {
      ...s.analysis(),
      input: { kind: 'table', table: g.id, dataSets: [] },
    };
    expect(descriptive.prepare(onGrouped, withGrouped)).toMatchObject({ ok: false });
  });

  it('hands over each group, with empty and excluded cells already dropped', () => {
    const s = project();
    s.fill();
    const r = descriptive.prepare(s.analysis(), s.p);
    expect(r.ok && r.request.groups.map((g) => [g.title, g.data])).toEqual([
      ['WT', { kind: 'raw', values: [3], dropped: { empty: 0, excluded: 0 } }],
      ['KO', { kind: 'raw', values: [], dropped: { empty: 0, excluded: 0 } }],
    ]);
  });
});
