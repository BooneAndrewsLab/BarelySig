/**
 * Simple linear regression, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { newId } from '@/model/ids';
import { type Analysis, createProject } from '@/model/project';
import { createXyTable, type XyTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { linearRegression } from '.';
import type { LinearRegressionRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): LinearRegressionRequest {
  const x = f.input['x'] ?? [];
  const y = f.input['y'] ?? [];
  const points = x.map((v, i) => {
    const yv = y[i];
    if (v === null || yv === null || yv === undefined) throw new Error('fixture cell is empty');
    return { x: v, y: yv };
  });
  return { series: [{ id: 's1', title: 'Series 1' }], points: [points] };
}

describe('linear regression, against the R oracle', () => {
  const fixtures = loadFixtures('linear-regression');

  it('covers a clean fit, n = 2, constant X, constant Y, R² = 0, an outlier and a tiny P', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(linearRegression.job(request));
      // The job runs the batching wrapper (one series here); the fixture's
      // `expected` is that one series' own flat shape.
      expect(mismatches(out.value, { series: [f.expected] }, f.tolerance)).toEqual([]);
      const r = linearRegression.parse(out.value, request, out.warnings);
      expect(r.series).toHaveLength(1);
    },
    60_000,
  );

  it('reports why the fit can’t run at n = 2, constant X and constant Y', async () => {
    const fixtures2 = loadFixtures('linear-regression');
    for (const [id, why] of [
      ['n2', 'few'],
      ['constant-x', 'constant-x'],
      ['constant-y', 'constant-y'],
    ] as const) {
      const f = fixtures2.find((x) => x.id.endsWith(id));
      if (!f) throw new Error(`fixture ${id} missing`);
      const request = requestFor(f);
      const out = await engine.run(linearRegression.job(request));
      const r = linearRegression.parse(out.value, request, out.warnings);
      const outcome = r.series[0]?.outcome;
      expect(outcome?.ran).toBe(false);
      if (outcome && !outcome.ran) expect(outcome.why).toBe(why);
    }
  }, 60_000);
});

describe('prepare', () => {
  type LinearRegression = Extract<Analysis, { kind: 'linear-regression' }>;

  function setup(): {
    readonly project: ReturnType<typeof createProject>;
    readonly table: XyTable;
  } {
    const table = createXyTable({ title: 'Dose response', groups: ['Y1'], rows: 3 });
    let project = createProject('p');
    project = {
      ...project,
      tables: new Map([[table.id, table]]),
      order: { ...project.order, tables: [table.id] },
    };
    return { project, table };
  }

  function analysisFor(table: XyTable): LinearRegression {
    return {
      id: newId('a'),
      title: 'Linear regression',
      kind: 'linear-regression',
      options: {},
      input: { kind: 'table', table: table.id, dataSets: [table.dataSets[1]?.id ?? newId('ds')] },
    };
  }

  it('refuses a Column table', () => {
    const { project, table } = setup();
    const columnish = { ...table, type: 'column' as const };
    const project2 = { ...project, tables: new Map([[columnish.id, columnish]]) };
    const prepared = linearRegression.prepare(analysisFor(table), project2);
    expect(prepared.ok).toBe(false);
  });

  it('refuses no Y data set chosen', () => {
    const { project, table } = setup();
    const a = analysisFor(table);
    const prepared = linearRegression.prepare(
      { ...a, input: { kind: 'table' as const, table: table.id, dataSets: [] } },
      project,
    );
    expect(prepared.ok).toBe(false);
  });

  it('refuses a Y series with no usable point', () => {
    const { project, table } = setup();
    const prepared = linearRegression.prepare(analysisFor(table), project);
    expect(prepared.ok).toBe(false);
  });

  it('accepts a Y series with usable points', () => {
    const { project, table } = setup();
    const x = table.dataSets[0];
    const y = table.dataSets[1];
    if (!x || !y) throw new Error('table has no data sets');
    const filled: XyTable = {
      ...table,
      dataSets: [
        { ...x, subcolumns: [[1, 2, 3]] },
        { ...y, subcolumns: [[2, 4, 6]] },
      ],
    };
    const project2 = { ...project, tables: new Map([[filled.id, filled]]) };
    const prepared = linearRegression.prepare(analysisFor(filled), project2);
    expect(prepared.ok).toBe(true);
  });
});
