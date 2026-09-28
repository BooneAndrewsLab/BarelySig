/**
 * The growth curve fit, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { newId } from '@/model/ids';
import { type Analysis, createProject, DEFAULT_OPTIONS } from '@/model/project';
import { createXyTable, type XyTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { growthCurve } from '.';
import type { GrowthCurveRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): GrowthCurveRequest {
  const t = f.input['t'] ?? [];
  const y = f.input['y'] ?? [];
  const points = t.map((v, i) => {
    const yv = y[i];
    if (v === null || yv === null || yv === undefined) throw new Error('fixture cell is empty');
    return { x: v, y: yv };
  });
  return { series: [{ id: 's1', title: 'Series 1' }], points: [points] };
}

describe('growth curve fit, against the R oracle', () => {
  const fixtures = loadFixtures('growth-curve');

  it('covers a clean curve, a short lag, no plateau, an outlier, decline and refusals', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(growthCurve.job(request));
      // The job runs the batching wrapper (one series here); the fixture's
      // `expected` is that one series' own flat shape.
      expect(mismatches(out.value, { series: [f.expected] }, f.tolerance)).toEqual([]);
      const r = growthCurve.parse(out.value, request, out.warnings);
      expect(r.series).toHaveLength(1);
    },
    120_000,
  );

  it('reports why the curve can’t be fit, in the typed result', async () => {
    for (const [id, why] of [
      ['few', 'few'],
      ['few-t', 'few-t'],
      ['constant-y', 'constant-y'],
      ['declining', 'no-fit'],
    ] as const) {
      const f = fixtures.find((x) => x.id.endsWith(id));
      if (!f) throw new Error(`fixture ${id} missing`);
      const request = requestFor(f);
      const out = await engine.run(growthCurve.job(request));
      const outcome = growthCurve.parse(out.value, request, out.warnings).series[0]?.outcome;
      expect(outcome?.ran).toBe(false);
      if (outcome && !outcome.ran) expect(outcome.why).toBe(why);
    }
  }, 120_000);

  it('reports the exponential phase ending beyond the observed window when the curve has not plateaued', async () => {
    const f = fixtures.find((x) => x.id.endsWith('no-plateau'));
    if (!f) throw new Error('fixture no-plateau missing');
    const request = requestFor(f);
    const out = await engine.run(growthCurve.job(request));
    const o = growthCurve.parse(out.value, request, out.warnings).series[0]?.outcome;
    if (!o?.ran) throw new Error('no-plateau fit did not run');
    const points = request.points[0];
    if (!points) throw new Error('no-plateau fixture has no series');
    const maxT = Math.max(...points.map((p) => p.x));
    expect(o.exponentialEnd.value).toBeGreaterThan(maxT);
    expect(o.doublingTime.value).toBeCloseTo(Math.log(2) / o.growthRate.value, 10);
    expect(o.band.x).toHaveLength(100);
  }, 120_000);
});

describe('prepare', () => {
  type Fit = Extract<Analysis, { kind: 'growth-curve' }>;

  function setup(): {
    readonly project: ReturnType<typeof createProject>;
    readonly table: XyTable;
  } {
    const table = createXyTable({ title: 'Growth curve', groups: ['Culture 1'], rows: 3 });
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

  function analysisFor(table: XyTable): Fit {
    return {
      id: newId('a'),
      title: 'Growth curve',
      kind: 'growth-curve',
      options: { ...DEFAULT_OPTIONS['growth-curve'] },
      input: { kind: 'table', table: table.id, dataSets: [table.dataSets[1]?.id ?? newId('ds')] },
    };
  }

  it('refuses a Y series with no usable point', () => {
    const { project, table } = setup();
    expect(growthCurve.prepare(analysisFor(table), project).ok).toBe(false);
  });

  it('refuses no Y data set chosen', () => {
    const { project, table } = setup();
    const a = analysisFor(table);
    const prepared = growthCurve.prepare(
      { ...a, input: { kind: 'table' as const, table: table.id, dataSets: [] } },
      project,
    );
    expect(prepared.ok).toBe(false);
  });
});
