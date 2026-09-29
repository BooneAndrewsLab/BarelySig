/**
 * The dose-response fit, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { newId } from '@/model/ids';
import {
  type Analysis,
  createProject,
  DEFAULT_OPTIONS,
  type ParameterConstraint,
} from '@/model/project';
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
    constraints: {
      bottom: constraintOf(f.options?.['bottom']),
      top: constraintOf(f.options?.['top']),
      hillSlope: constraintOf(f.options?.['hillSlope']),
    },
  };
}

/** A fixture's constraint option, as the oracle wrote it (an absent limit is `{}` in its JSON). */
function constraintOf(o: Plain | undefined): ParameterConstraint {
  if (o === undefined || o === null || typeof o !== 'object' || Array.isArray(o)) {
    return { kind: 'free' };
  }
  const num = (v: Plain | undefined): number | null => (typeof v === 'number' ? v : null);
  if (o['kind'] === 'fixed') return { kind: 'fixed', value: num(o['value']) ?? Number.NaN };
  if (o['kind'] === 'bounded')
    return { kind: 'bounded', lower: num(o['lower']), upper: num(o['upper']) };
  return { kind: 'free' };
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

  it('reports held parameters without SE or CI, and a limit the fit ran into as at-bound', async () => {
    for (const [id, statuses, df] of [
      ['bottom-zero', ['fixed', 'fitted', 'fitted', 'fitted'], 30],
      ['three-held', ['fixed', 'fixed', 'fitted', 'fixed'], 32],
      ['bound-active-bottom', ['at-bound', 'fitted', 'fitted', 'fitted'], 30],
      ['bounds-inactive', ['fitted', 'fitted', 'fitted', 'fitted'], 29],
    ] as const) {
      const f = fixtures.find((x) => x.id.endsWith(id));
      if (!f) throw new Error(`fixture ${id} missing`);
      const request = requestFor(f);
      const out = await engine.run(nonlinearRegression.job(request));
      const o = nonlinearRegression.parse(out.value, request, out.warnings).series[0]?.outcome;
      if (!o?.ran) throw new Error(`${id} did not run`);
      const ps = [o.bottom, o.top, o.hillSlope, o.logEc50];
      expect([o.bottom, o.top, o.logEc50, o.hillSlope].map((p) => p.status)).toEqual(statuses);
      expect(o.df).toBe(df);
      for (const p of ps) {
        if (p.status === 'fitted') expect(p.se).not.toBeNull();
        else {
          expect(p.se).toBeNull();
          expect(p.lower).toBeNull();
          expect(p.upper).toBeNull();
        }
      }
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

  it('passes constraints through, and refuses ones that make no sense', () => {
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
    const withOptions = (o: Partial<Fit['options']>): Fit => {
      const a = analysisFor(filled);
      return { ...a, options: { ...a.options, ...o } };
    };
    const held = nonlinearRegression.prepare(
      withOptions({ bottom: { kind: 'fixed', value: 0 } }),
      project2,
    );
    expect(held.ok && held.request.constraints.bottom).toEqual({ kind: 'fixed', value: 0 });
    expect(
      nonlinearRegression.prepare(withOptions({ hillSlope: { kind: 'fixed', value: 0 } }), project2)
        .ok,
    ).toBe(false);
    expect(
      nonlinearRegression.prepare(
        withOptions({ top: { kind: 'bounded', lower: 5, upper: 5 } }),
        project2,
      ).ok,
    ).toBe(false);
    expect(
      nonlinearRegression.prepare(
        withOptions({ top: { kind: 'bounded', lower: null, upper: null } }),
        project2,
      ).ok,
    ).toBe(false);
    expect(
      nonlinearRegression.prepare(
        withOptions({ bottom: { kind: 'fixed', value: Number.NaN } }),
        project2,
      ).ok,
    ).toBe(false);
  });
});
