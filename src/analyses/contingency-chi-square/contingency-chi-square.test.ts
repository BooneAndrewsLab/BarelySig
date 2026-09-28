/**
 * The app's chi-square test of independence, run in the app's WebR on
 * every fixture the R oracle wrote (CLAUDE.md, Correctness), and its
 * plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { newId } from '@/model/ids';
import { type Analysis, createProject } from '@/model/project';
import { CONTINGENCY_FORMAT, emptyDataSet, newRows, type ContingencyTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { contingencyChiSquare } from '.';
import type { ContingencyRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): ContingencyRequest {
  const columns = Object.keys(f.input);
  const nrow = f.input[columns[0] ?? '']?.length ?? 0;
  const counts: number[] = [];
  for (let r = 0; r < nrow; r += 1) {
    for (const col of columns) {
      const v = f.input[col]?.[r];
      if (v === null || v === undefined) throw new Error('fixture cell is empty');
      counts.push(v);
    }
  }
  return {
    rows: Array.from({ length: nrow }, (_, r) => ({
      id: `r${String(r)}`,
      title: `Row ${String(r + 1)}`,
    })),
    columns: columns.map((c) => ({ id: c, title: c })),
    counts,
    nrow,
    ncol: columns.length,
  };
}

describe('chi-square test of independence, against the R oracle', () => {
  const fixtures = loadFixtures('contingency-chi-square');

  it('covers 2x2, r x c, a zero cell and a low-expected-count case', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(contingencyChiSquare.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = contingencyChiSquare.parse(out.value, request, out.warnings);
      expect(r.n).toBeGreaterThan(0);
    },
    60_000,
  );

  it('surfaces R’s low-expected-count warning', async () => {
    const f = loadFixtures('contingency-chi-square').find((x) =>
      x.id.endsWith('small-counts-low-expected'),
    );
    if (!f) throw new Error('fixture missing');
    const request = requestFor(f);
    const out = await engine.run(contingencyChiSquare.job(request));
    const r = contingencyChiSquare.parse(out.value, request, out.warnings);
    expect(r.lowExpected).toBe(true);
  }, 60_000);
});

describe('prepare', () => {
  type ContingencyChiSquare = Extract<Analysis, { kind: 'contingency-chi-square' }>;

  function setup(counts: readonly (readonly (number | null)[])[]): {
    readonly project: ReturnType<typeof createProject>;
    readonly table: ContingencyTable;
  } {
    const nrow = counts.length;
    const ncol = counts[0]?.length ?? 0;
    const rows = newRows(
      nrow,
      Array.from({ length: nrow }, (_, r) => `Row ${String(r + 1)}`),
    );
    const table: ContingencyTable = {
      id: newId('t'),
      type: 'contingency',
      title: 'Outcome',
      format: CONTINGENCY_FORMAT,
      rows,
      dataSets: Array.from({ length: ncol }, (_, c) => {
        const ds = emptyDataSet(newId('ds'), `Group ${String(c + 1)}`, nrow, CONTINGENCY_FORMAT);
        return { ...ds, subcolumns: [rows.map((_, r) => counts[r]?.[c] ?? null)] };
      }),
    };
    let project = createProject('p');
    project = {
      ...project,
      tables: new Map([[table.id, table]]),
      order: { ...project.order, tables: [table.id] },
    };
    return { project, table };
  }

  function analysisFor(table: ContingencyTable): ContingencyChiSquare {
    return {
      id: newId('a'),
      title: 'Chi-square test',
      kind: 'contingency-chi-square',
      options: {},
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    };
  }

  it('refuses fewer than two columns', () => {
    const { project, table } = setup([
      [3, null],
      [1, null],
    ]);
    const a = analysisFor(table);
    const first = table.dataSets[0];
    if (!first) throw new Error('table has no data sets');
    const one = { ...a, input: { ...a.input, dataSets: [first.id] } };
    const prepared = contingencyChiSquare.prepare(one, project);
    expect(prepared.ok).toBe(false);
  });

  it('refuses fewer than two rows', () => {
    const { project, table } = setup([[3, 4]]);
    const prepared = contingencyChiSquare.prepare(analysisFor(table), project);
    expect(prepared.ok).toBe(false);
  });

  it('refuses an empty cell', () => {
    const { project, table } = setup([
      [3, 4],
      [null, 5],
    ]);
    const prepared = contingencyChiSquare.prepare(analysisFor(table), project);
    expect(prepared.ok).toBe(false);
  });

  it('accepts a filled 2x2 table', () => {
    const { project, table } = setup([
      [30, 15],
      [10, 25],
    ]);
    const prepared = contingencyChiSquare.prepare(analysisFor(table), project);
    expect(prepared.ok).toBe(true);
  });
});
