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
  type ComparisonWith,
  createProject,
  DEFAULT_OPTIONS,
  DOSE_RESPONSE_MODEL_IDS,
  type ParameterConstraint,
  type SharedParameters,
  type SimplerModel,
} from '@/model/project';
import { createXyTable, type XyTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { nonlinearRegression } from '.';
import { alternativeFit, comparisonWithProblem } from './constraints';
import { effectiveConstraints } from './models';
import type { NonlinearRegressionRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): NonlinearRegressionRequest {
  const x = f.input['dose'] ?? [];
  const y = f.input['y'] ?? [];
  const g = f.input['g'];
  const modelId = f.options?.['model'];
  const model =
    DOSE_RESPONSE_MODEL_IDS.find((id) => id === modelId) ?? 'log-agonist-variable-slope';
  // A global-fit fixture stacks its data sets in one column with a set number `g`; a cell that
  // is empty stays out of the request, as the grid would leave it.
  const sets = g === undefined ? [1] : [...new Set(g.map((v) => v ?? 0))].sort((p, q) => p - q);
  const points = sets.map((set) =>
    x.flatMap((v, i) => {
      const yv = y[i];
      if (g !== undefined && g[i] !== set) return [];
      if (g !== undefined && (v === null || yv === null || yv === undefined)) return [];
      if (v === null || yv === null || yv === undefined) throw new Error('fixture cell is empty');
      return [{ x: v, y: yv }];
    }),
  );
  const compareWith = compareWithOf(f.options?.['compareWith']);
  const compareAlpha =
    typeof f.options?.['compareAlpha'] === 'number' ? f.options['compareAlpha'] : 0.05;
  const constraint = {
    bottom: constraintOf(f.options?.['bottom']),
    top: constraintOf(f.options?.['top']),
    hillSlope: constraintOf(f.options?.['hillSlope']),
  };
  const compare = compareOf(f.options?.['compare']);
  const shared = sharedOf(f.options?.['shared']);
  const alternative = alternativeFit(
    { model, ...constraint, compare, compareWith, shared },
    sets.length,
  );
  if (typeof alternative === 'string') throw new Error(alternative);
  return {
    model,
    series: sets.map((set) => ({ id: `s${String(set)}`, title: `Series ${String(set)}` })),
    points,
    logX: f.options?.['x'] !== 'concentration',
    // What `prepare` would send: the model's own holds over the fixture's constraints. A model
    // fixture states none of its own, so the oracle's hand-derived bounds check the presets.
    constraints: effectiveConstraints({ model, ...constraint }),
    compare,
    alternative,
    compareWith,
    alpha: compareAlpha,
    shared,
  };
}

/** A fixture's comparison with another model or with sharing undone (absent = none). */
function compareWithOf(o: Plain | undefined): ComparisonWith | null {
  if (o === undefined || o === null || typeof o !== 'object' || Array.isArray(o)) return null;
  if (o['kind'] === 'model') {
    const model = DOSE_RESPONSE_MODEL_IDS.find((id) => id === o['model']);
    return model === undefined ? null : { kind: 'model', model };
  }
  return o['kind'] === 'sharing' ? { kind: 'sharing', test: sharedOf(o['test']) } : null;
}

/** A fixture's shared parameters (absent = none). */
function sharedOf(o: Plain | undefined): SharedParameters {
  const on = (k: string): boolean =>
    o !== undefined && o !== null && typeof o === 'object' && !Array.isArray(o) && o[k] === true;
  return {
    bottom: on('bottom'),
    top: on('top'),
    hillSlope: on('hillSlope'),
    logEc50: on('logEc50'),
  };
}

/** A fixture's simpler model: the parameters it holds, and where (absent = still estimated). */
function compareOf(o: Plain | undefined): SimplerModel | null {
  if (o === undefined || o === null || typeof o !== 'object' || Array.isArray(o)) return null;
  const held = (v: Plain | undefined): number | null => (typeof v === 'number' ? v : null);
  return {
    bottom: held(o['bottom']),
    top: held(o['top']),
    hillSlope: held(o['hillSlope']),
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
      if (f.id.includes('global-')) {
        // Several data sets: the fixture's `expected` is the whole result.
        expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
        const r = nonlinearRegression.parse(out.value, request, out.warnings);
        expect(r.series).toHaveLength(request.points.length);
        return;
      }
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

  it('reports the comparison with the simpler model in the typed result', async () => {
    const outcome = async (id: string) => {
      const f = fixtures.find((x) => x.id.endsWith(id));
      if (!f) throw new Error(`fixture ${id} missing`);
      const request = requestFor(f);
      const out = await engine.run(nonlinearRegression.job(request));
      const o = nonlinearRegression.parse(out.value, request, out.warnings).series[0]?.outcome;
      if (!o?.ran) throw new Error(`${id} did not run`);
      return o.comparison;
    };
    const rejected = await outcome('compare-bottom-zero-rejected');
    if (!rejected?.ran || !rejected.fTest.ok || !rejected.aicc.ok) throw new Error('no comparison');
    expect(rejected.fTest.p).toBeLessThan(0.001);
    expect(rejected.fTest.dfNumerator).toBe(1);
    expect(rejected.simpler.bottom).toBe(0);
    expect(rejected.aicc.probabilityFit + rejected.aicc.probabilitySimpler).toBeCloseTo(1, 12);
    expect(rejected.aicc.probabilityFit).toBeGreaterThan(0.9);
    const few = await outcome('compare-few-points');
    if (!few?.ran) throw new Error('no comparison');
    expect(few.fTest.ok).toBe(true);
    expect(few.aicc.ok).toBe(false);
    // No comparison asked for: nothing reported.
    expect(await outcome('rising')).toBeNull();
  }, 120_000);

  it('reports the comparison with a different model or with sharing undone in the typed result', async () => {
    const run = async (id: string) => {
      const f = fixtures.find((x) => x.id.endsWith(id));
      if (!f) throw new Error(`fixture ${id} missing`);
      const request = requestFor(f);
      const out = await engine.run(nonlinearRegression.job(request));
      return nonlinearRegression.parse(out.value, request, out.warnings);
    };
    const first = async (id: string) => {
      const o = (await run(id)).series[0]?.outcome;
      if (!o?.ran) throw new Error(`${id} did not run`);
      return o.comparison;
    };
    // The configured variable slope against a standard slope it contains.
    const rejected = await first('compare-model-slope-rejected');
    if (!rejected?.ran || !rejected.fTest.ok) throw new Error('no comparison');
    expect(rejected.fTest.p).toBeLessThan(0.001);
    expect(rejected.aicc.ok && rejected.aicc.probabilityFit).toBeGreaterThan(0.9);
    expect(rejected.simpler.hillSlope).toBe(1);
    // Data that follow a standard slope: no evidence for the extra parameter.
    const accepted = await first('compare-model-slope-accepted');
    if (!accepted?.ran || !accepted.fTest.ok) throw new Error('no comparison');
    expect(accepted.fTest.p).toBeGreaterThan(0.05);
    // The configured (standard slope) fit is the simpler side.
    const swapped = await first('compare-model-configured-simpler');
    if (!swapped?.ran || !swapped.fTest.ok) throw new Error('no comparison');
    expect(swapped.simpler.hillSlope).toBe(1);
    expect(swapped.fTest.p).toBeLessThan(0.001);
    // Two models neither of which contains the other: AICc only.
    const loose = await first('compare-model-not-nested');
    if (!loose?.ran) throw new Error('no comparison');
    expect(loose.fTest).toEqual({ ok: false, why: 'not-nested' });
    expect(loose.aicc.ok).toBe(true);
    // Five points: AICc is not available, the F test is.
    const few = await first('compare-model-few-points');
    if (!few?.ran) throw new Error('no comparison');
    expect(few.fTest.ok).toBe(true);
    expect(few.aicc.ok).toBe(false);
    // Sharing undone: one comparison of the whole fit, none per data set.
    const shared = await run('global-compare-ec50-different');
    const whole = shared.comparison;
    if (!whole?.ran || !whole.fTest.ok) throw new Error('no whole-fit comparison');
    expect(whole.fTest.p).toBeLessThan(0.001);
    expect(whole.fTest.dfNumerator).toBe(1);
    for (const s of shared.series) expect(s.outcome.ran && s.outcome.comparison).toBeNull();
    const same = (await run('global-compare-ec50-same')).comparison;
    if (!same?.ran || !same.fTest.ok) throw new Error('no whole-fit comparison');
    expect(same.fTest.p).toBeGreaterThan(0.05);
    // Nothing shared in either model: one comparison per data set.
    const each = await run('global-compare-two-sets-models');
    expect(each.comparison).toBeNull();
    for (const s of each.series) expect(s.outcome.ran && s.outcome.comparison?.ran).toBe(true);
    // Not asked for: nothing reported.
    expect((await run('rising')).comparison).toBeNull();
  }, 240_000);

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

  it('applies the chosen model: its holds replace the constraints chosen for the same parameters', () => {
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
    const free = { kind: 'free' } as const;
    const fixed = (value: number) => ({ kind: 'fixed', value }) as const;
    const cases = [
      ['log-agonist-variable-slope', free, free, free],
      ['log-inhibitor-variable-slope', free, free, free],
      ['log-agonist-standard-slope', free, free, fixed(1)],
      ['log-inhibitor-standard-slope', free, free, fixed(-1)],
      ['log-agonist-normalized-variable-slope', fixed(0), fixed(100), free],
      ['log-inhibitor-normalized-variable-slope', fixed(0), fixed(100), free],
      ['log-agonist-normalized-standard-slope', fixed(0), fixed(100), fixed(1)],
      ['log-inhibitor-normalized-standard-slope', fixed(0), fixed(100), fixed(-1)],
    ] as const;
    for (const [model, bottom, top, hillSlope] of cases) {
      const p = nonlinearRegression.prepare(withOptions({ model }), project2);
      if (!p.ok) throw new Error(`${model} was refused: ${p.reason}`);
      expect(p.request.model).toBe(model);
      expect(p.request.constraints).toEqual({ bottom, top, hillSlope });
    }
    // A limit chosen for a parameter the model holds is ignored, not merged.
    const over = nonlinearRegression.prepare(
      withOptions({
        model: 'log-agonist-normalized-variable-slope',
        bottom: { kind: 'bounded', lower: 5, upper: 5 },
        hillSlope: { kind: 'bounded', lower: 0, upper: null },
      }),
      project2,
    );
    expect(over.ok && over.request.constraints.bottom).toEqual(fixed(0));
    expect(over.ok && over.request.constraints.hillSlope).toEqual({
      kind: 'bounded',
      lower: 0,
      upper: null,
    });
    // The simpler model can only hold what the model itself leaves free.
    const none = { bottom: null, top: null, hillSlope: null };
    expect(
      nonlinearRegression.prepare(
        withOptions({
          model: 'log-inhibitor-standard-slope',
          compare: { ...none, hillSlope: 1 },
        }),
        project2,
      ).ok,
    ).toBe(false);
    expect(
      nonlinearRegression.prepare(
        withOptions({
          model: 'log-inhibitor-standard-slope',
          compare: { ...none, bottom: 0 },
        }),
        project2,
      ).ok,
    ).toBe(true);
  });

  it('shares parameters only across two or more data sets, and not with limits or a comparison', () => {
    const { project, table } = setup();
    const x = table.dataSets[0];
    const y = table.dataSets[1];
    if (!x || !y) throw new Error('table has no data sets');
    const y2 = { ...y, id: newId('ds') };
    const filled: XyTable = {
      ...table,
      dataSets: [
        { ...x, subcolumns: [[0, 1e-9, 1e-8]] },
        { ...y, subcolumns: [[2, 4, 6]] },
        { ...y2, subcolumns: [[1, 5, 7]] },
      ],
    };
    const project2 = { ...project, tables: new Map([[filled.id, filled]]) };
    const shared = { bottom: true, top: false, hillSlope: true, logEc50: false };
    const build = (ids: readonly string[], o: Partial<Fit['options']>): Fit => {
      const a = analysisFor(filled);
      return {
        ...a,
        options: { ...a.options, shared, ...o },
        input: { kind: 'table', table: filled.id, dataSets: ids.map((id) => id as never) },
      };
    };
    const both = [y.id, y2.id];
    const two = nonlinearRegression.prepare(build(both, {}), project2);
    expect(two.ok && two.request.shared).toEqual(shared);
    const one = nonlinearRegression.prepare(build([y.id], {}), project2);
    expect(one.ok && one.request.shared).toEqual({
      bottom: false,
      top: false,
      hillSlope: false,
      logEc50: false,
    });
    const limited = nonlinearRegression.prepare(
      build(both, { top: { kind: 'bounded', lower: 0, upper: 100 } }),
      project2,
    );
    expect(limited.ok).toBe(false);
    const compared = nonlinearRegression.prepare(
      build(both, { compare: { bottom: 0, top: null, hillSlope: null } }),
      project2,
    );
    expect(compared.ok).toBe(false);
  });

  it('passes the simpler model through, and refuses one that is not nested in the fit', () => {
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
    const none = { bottom: null, top: null, hillSlope: null };
    const ok = nonlinearRegression.prepare(
      withOptions({ compare: { ...none, bottom: 0 } }),
      project2,
    );
    expect(ok.ok && ok.request.compare).toEqual({ ...none, bottom: 0 });
    for (const options of [
      { compare: none }, // holds nothing
      { compare: { ...none, hillSlope: 0 } },
      { compare: { ...none, top: Number.NaN } },
      { compare: { bottom: 0, top: 100, hillSlope: 1 } }, // only the EC50 left
      { compare: { ...none, bottom: 0 }, bottom: { kind: 'fixed' as const, value: 1 } },
      { compare: { ...none, top: 100 }, top: { kind: 'bounded' as const, lower: 0, upper: 90 } },
    ]) {
      expect(nonlinearRegression.prepare(withOptions(options), project2).ok).toBe(false);
    }
  });
});

describe('alternativeFit', () => {
  const base = DEFAULT_OPTIONS['nonlinear-regression'];
  const none: SharedParameters = { bottom: false, top: false, hillSlope: false, logEc50: false };
  const relation = (o: Partial<typeof base>, sets = 1): string => {
    const a = alternativeFit({ ...base, ...o }, sets);
    if (a === null) return 'none';
    return typeof a === 'string' ? `problem: ${a}` : a.relation;
  };

  it('compares nothing unless asked', () => {
    expect(relation({})).toBe('none');
  });

  it('orders models by what they hold: the standard slope is inside the variable slope', () => {
    const other = (model: (typeof DOSE_RESPONSE_MODEL_IDS)[number]) => ({
      compareWith: { kind: 'model' as const, model },
    });
    expect(relation(other('log-agonist-standard-slope'))).toBe('alternative-simpler');
    expect(
      relation({ model: 'log-agonist-standard-slope', ...other('log-agonist-variable-slope') }),
    ).toBe('alternative-complex');
    expect(
      relation({
        model: 'log-agonist-normalized-variable-slope',
        ...other('log-agonist-variable-slope'),
      }),
    ).toBe('alternative-complex');
    // Standard slope (plateaus free) and normalized (slope free): neither contains the other.
    expect(
      relation({
        model: 'log-agonist-standard-slope',
        ...other('log-agonist-normalized-variable-slope'),
      }),
    ).toBe('not-nested');
    // An agonist's slope of +1 is not in an inhibitor's (slope -1) curve.
    expect(
      relation({ model: 'log-agonist-standard-slope', ...other('log-inhibitor-standard-slope') }),
    ).toBe('not-nested');
  });

  it('refuses to compare a model with itself, or with two comparisons at once', () => {
    expect(
      relation({ compareWith: { kind: 'model', model: 'log-agonist-variable-slope' } }),
    ).toMatch(/^problem:/);
    expect(
      relation({
        compareWith: { kind: 'model', model: 'log-agonist-standard-slope' },
        compare: { bottom: 0, top: null, hillSlope: null },
      }),
    ).toMatch(/^problem:/);
  });

  it('undoes sharing only for parameters that are shared, and needs two data sets', () => {
    const sharing = (test: Partial<SharedParameters>, shared: Partial<SharedParameters>) => ({
      shared: { ...none, ...shared },
      compareWith: { kind: 'sharing' as const, test: { ...none, ...test } },
    });
    expect(relation(sharing({ logEc50: true }, { logEc50: true }), 2)).toBe('alternative-complex');
    expect(relation(sharing({ logEc50: true }, { logEc50: true }), 1)).toMatch(/^problem:/);
    expect(relation(sharing({ logEc50: true }, { hillSlope: true }), 2)).toMatch(/^problem:/);
    expect(relation(sharing({}, { logEc50: true }), 2)).toMatch(/^problem:/);
  });

  it('refuses an alpha outside (0, 1)', () => {
    for (const compareAlpha of [0, 1, -0.1, Number.NaN]) {
      const o = {
        ...base,
        compareAlpha,
        compareWith: { kind: 'model' as const, model: 'log-agonist-standard-slope' as const },
      };
      expect(comparisonWithProblem(o, 1)).not.toBeNull();
    }
    expect(
      comparisonWithProblem(
        { ...base, compareWith: { kind: 'model', model: 'log-agonist-standard-slope' } },
        1,
      ),
    ).toBeNull();
  });
});
