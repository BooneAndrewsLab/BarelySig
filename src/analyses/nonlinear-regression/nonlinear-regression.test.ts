/**
 * The dose-response fit, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { newId } from '@/model/ids';
import { type Analysis, createProject, DEFAULT_OPTIONS } from '@/model/project';
import { createXyTable, type XyTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { nonlinearRegression } from '.';
import type { NonlinearRegressionRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): NonlinearRegressionRequest {
  const x = f.input['dose'] ?? [];
  const y = f.input['y'] ?? [];
  const points = x.map((v, i) => {
    const yv = y[i];
    if (v === null || yv === null || yv === undefined) throw new Error('fixture cell is empty');
    return { x: v, y: yv };
  });
  return {
    series: [{ id: 's1', title: 'Series 1' }],
    points: [points],
    logX: f.options?.['x'] !== 'concentration',
  };
}

describe('dose-response fit, against the R oracle', () => {
  const fixtures = loadFixtures('nonlinear-regression');

  it('covers rising, falling, concentrations, a tiny EC50, an outlier, one plateau and refusals', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(nonlinearRegression.job(request));
      // The job runs the batching wrapper (one series here); the fixture's
      // `expected` is that one series' own flat shape.
      expect(mismatches(out.value, { series: [f.expected] }, f.tolerance)).toEqual([]);
      const r = nonlinearRegression.parse(out.value, request, out.warnings);
      expect(r.series).toHaveLength(1);
    },
    120_000,
  );

  it('reports why the curve can’t be fit, in the typed result', async () => {
    for (const [id, why] of [
      ['n4', 'few'],
      ['three-doses', 'few-x'],
      ['constant-y', 'constant-y'],
      ['half-curve', 'no-fit'],
    ] as const) {
      const f = fixtures.find((x) => x.id.endsWith(id));
      if (!f) throw new Error(`fixture ${id} missing`);
      const request = requestFor(f);
      const out = await engine.run(nonlinearRegression.job(request));
      const outcome = nonlinearRegression.parse(out.value, request, out.warnings).series[0]
        ?.outcome;
      expect(outcome?.ran).toBe(false);
      if (outcome && !outcome.ran) expect(outcome.why).toBe(why);
    }
  }, 120_000);

  it('reads a falling curve as Bottom < Top with a negative Hill slope, and EC50 = 10^LogEC50', async () => {
    const f = fixtures.find((x) => x.id.endsWith('falling'));
    if (!f) throw new Error('fixture falling missing');
    const request = requestFor(f);
    const out = await engine.run(nonlinearRegression.job(request));
    const o = nonlinearRegression.parse(out.value, request, out.warnings).series[0]?.outcome;
    if (!o?.ran) throw new Error('falling fit did not run');
    expect(o.bottom.value).toBeLessThan(o.top.value);
    expect(o.hillSlope.value).toBeLessThan(0);
    expect(o.ec50).toBeCloseTo(10 ** o.logEc50.value, 12);
    expect(o.ec50Lower).toBeLessThan(o.ec50);
    expect(o.ec50Upper).toBeGreaterThan(o.ec50);
    expect(o.band.x).toHaveLength(100);
  }, 120_000);
});

describe('prepare', () => {
  type Fit = Extract<Analysis, { kind: 'nonlinear-regression' }>;

  function setup(): {
    readonly project: ReturnType<typeof createProject>;
    readonly table: XyTable;
  } {
    const table = createXyTable({ title: 'Dose response', groups: ['Y1'], rows: 3 });
    const project = createProject('p');
    return {
      project: {
        ...project,
        tables: new Map([[table.id, table]]),
        order: { ...project.order, tables: [table.id] },
      },
      table,
    };
  }

  function analysisFor(table: XyTable, x: 'log' | 'concentration' = 'log'): Fit {
    return {
      id: newId('a'),
      title: 'Dose-response',
      kind: 'nonlinear-regression',
      options: { ...DEFAULT_OPTIONS['nonlinear-regression'], x },
      input: { kind: 'table', table: table.id, dataSets: [table.dataSets[1]?.id ?? newId('ds')] },
    };
  }

  it('refuses a Y series with no usable point', () => {
    const { project, table } = setup();
    expect(nonlinearRegression.prepare(analysisFor(table), project).ok).toBe(false);
  });

  it('refuses no Y data set chosen', () => {
    const { project, table } = setup();
    const a = analysisFor(table);
    const prepared = nonlinearRegression.prepare(
      { ...a, input: { kind: 'table' as const, table: table.id, dataSets: [] } },
      project,
    );
    expect(prepared.ok).toBe(false);
  });

  it('passes the X option through', () => {
    const { project, table } = setup();
    const x = table.dataSets[0];
    const y = table.dataSets[1];
    if (!x || !y) throw new Error('table has no data sets');
    const filled: XyTable = {
      ...table,
      dataSets: [
        { ...x, subcolumns: [[0, 1e-9, 1e-8]] },
        { ...y, subcolumns: [[2, 4, 6]] },
      ],
    };
    const project2 = { ...project, tables: new Map([[filled.id, filled]]) };
    const log = nonlinearRegression.prepare(analysisFor(filled), project2);
    const conc = nonlinearRegression.prepare(analysisFor(filled, 'concentration'), project2);
    expect(log.ok && log.request.logX).toBe(true);
    expect(conc.ok && !conc.request.logX).toBe(true);
  });
});
