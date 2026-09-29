/**
 * Nonlinear regression of an XY table's Y data sets (item 32, #37): the
 * four-parameter dose-response curve, base R `nls` ("plinear"), one fit
 * per series.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { xySeries } from '@/model/selectors';

import { regressionBand, runsOutcome } from '../linear-regression';
import runsCode from '../linear-regression/analysis.R?raw';
import type { Residual } from '../linear-regression/types';
import type { AnalysisModule, Prepared } from '../module';
import type { ParameterConstraint } from '@/model/project';
import { need, num, object, type PlainObject } from '../values';
import fitCode from './analysis.R?raw';
import { effectiveShared, optionsProblem } from './constraints';
import { effectiveConstraints } from './models';
import type {
  ComparisonOutcome,
  GlobalFit,
  DoseResponseOutcome,
  FitParameter,
  NonlinearRegressionRequest,
  NonlinearRegressionResult,
} from './types';

/** linear-regression's `bs_runs_test` is shared, not copied (note 32). */
const code = `${runsCode}\n${fitCode}`;

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);
const numbers = (v: Plain | undefined): number[] => list(v).map((x) => num(x) ?? 0);

function parameter(v: Plain | undefined, what: string): FitParameter {
  const o = object(v ?? null, what);
  const status = o['status'] === 'fixed' || o['status'] === 'at_bound' ? o['status'] : 'fitted';
  if (status !== 'fitted') {
    return {
      value: need(o['value'], what),
      status: status === 'fixed' ? 'fixed' : 'at-bound',
      se: null,
      lower: null,
      upper: null,
      dependency: null,
      ambiguous: false,
    };
  }
  return {
    value: need(o['value'], what),
    status,
    se: need(o['se'], `${what} SE`),
    lower: need(o['lower'], `${what} CI lower`),
    upper: need(o['upper'], `${what} CI upper`),
    dependency: need(o['dependency'], `${what} dependency`),
    ambiguous: o['ambiguous'] === true,
  };
}

/** What the R fit takes for one constraint: its limits, the way `nls(algorithm = "port")` wants them. */
function limits(c: ParameterConstraint): {
  lo: number;
  hi: number;
  hasLo: boolean;
  hasHi: boolean;
} {
  switch (c.kind) {
    case 'free':
      return { lo: 0, hi: 0, hasLo: false, hasHi: false };
    case 'fixed':
      return { lo: c.value, hi: c.value, hasLo: true, hasHi: true };
    case 'bounded':
      return {
        lo: c.lower ?? 0,
        hi: c.upper ?? 0,
        hasLo: c.lower !== null,
        hasHi: c.upper !== null,
      };
  }
}

function comparison(v: Plain | undefined): ComparisonOutcome | null {
  if (v === undefined || v === null) return null;
  const c = object(v, 'model comparison');
  if (c['ran'] !== true) return { ran: false, why: c['why'] === 'worse' ? 'worse' : 'no-fit' };
  const s = object(c['simpler'] ?? null, 'simpler model');
  const f = object(c['f_test'] ?? null, 'F test');
  const a = object(c['aicc'] ?? null, 'AICc');
  return {
    ran: true,
    simpler: {
      bottom: need(s['bottom'], 'simpler Bottom'),
      top: need(s['top'], 'simpler Top'),
      logEc50: need(s['logec50'], 'simpler LogEC50'),
      hillSlope: need(s['hill'], 'simpler HillSlope'),
      ec50: need(s['ec50'], 'simpler EC50'),
      ss: need(s['ss'], 'simpler sum of squares'),
      df: need(s['df'], 'simpler df'),
    },
    fTest:
      f['ok'] === true
        ? {
            ok: true,
            f: need(f['f'], 'F'),
            dfNumerator: need(f['df_num'], 'F numerator df'),
            dfDenominator: need(f['df_den'], 'F denominator df'),
            p: need(f['p'], 'F test P'),
          }
        : { ok: false, why: f['why'] === 'exact_fit' ? 'exact-fit' : 'no-extra' },
    aicc:
      a['ok'] === true
        ? {
            ok: true,
            fit: need(a['fit'], 'AICc'),
            simpler: need(a['simpler'], 'simpler AICc'),
            probabilityFit: need(a['prob_fit'], 'probability of the fit'),
            probabilitySimpler: need(a['prob_simpler'], 'probability of the simpler model'),
          }
        : { ok: false },
  };
}

function globalFit(v: Plain | undefined): GlobalFit | null {
  if (v === undefined || v === null) return null;
  const g = object(v, 'global fit');
  return {
    n: need(g['n'], 'global n'),
    parameters: need(g['parameters'], 'global parameters'),
    df: need(g['df'], 'global df'),
    ss: need(g['ss'], 'global sum of squares'),
    syx: need(g['syx'], 'global Sy.x'),
  };
}

const WHY = {
  few: 'few',
  few_x: 'few-x',
  constant_y: 'constant-y',
  no_fit: 'no-fit',
} as const;

function outcome(o: PlainObject): DoseResponseOutcome {
  const n = num(o['n']) ?? 0;
  const dropped = num(o['dropped']) ?? 0;
  if (o['ran'] !== true) {
    const why = o['why'];
    return {
      ran: false,
      n,
      dropped,
      why: typeof why === 'string' && why in WHY ? WHY[why as keyof typeof WHY] : 'no-fit',
      minimum: num(o['minimum']),
    };
  }
  const xs = numbers(o['x']);
  const ys = numbers(o['y']);
  const fitted = numbers(o['fitted']);
  const residual = numbers(o['residual']);
  const residuals: Residual[] = xs.map((x, i) => ({
    x,
    y: ys[i] ?? 0,
    fitted: fitted[i] ?? 0,
    residual: residual[i] ?? 0,
  }));
  return {
    ran: true,
    n,
    dropped,
    bottom: parameter(o['bottom'], 'Bottom'),
    top: parameter(o['top'], 'Top'),
    logEc50: parameter(o['logec50'], 'LogEC50'),
    hillSlope: parameter(o['hill'], 'HillSlope'),
    ec50: need(o['ec50'], 'EC50'),
    ec50Lower: need(o['ec50_lower'], 'EC50 CI lower'),
    ec50Upper: need(o['ec50_upper'], 'EC50 CI upper'),
    df: need(o['df'], 'df'),
    ss: need(o['ss'], 'sum of squares'),
    syx: need(o['syx'], 'Sy.x'),
    r2: need(o['r2'], 'R²'),
    residuals,
    runs: runsOutcome(object(o['runs'] ?? null, 'runs test')),
    band: regressionBand(object(o['band'] ?? null, 'band')),
    comparison: comparison(o['comparison']),
  };
}

export const nonlinearRegression: AnalysisModule<
  'nonlinear-regression',
  NonlinearRegressionRequest,
  NonlinearRegressionResult
> = {
  kind: 'nonlinear-regression',
  version: 5,
  code,

  prepare(analysis, project): Prepared<NonlinearRegressionRequest> {
    if (analysis.input.kind !== 'table') {
      return { ok: false, reason: 'A dose-response fit looks at an XY table.' };
    }
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this fit reads no longer exists.' };
    if (table.type !== 'xy') {
      return { ok: false, reason: 'A dose-response fit looks at the Y data sets of an XY table.' };
    }
    if (analysis.input.dataSets.length === 0) {
      return { ok: false, reason: 'Choose a Y data set to fit a curve to.' };
    }
    const { bottom, top, hillSlope } = effectiveConstraints(analysis.options);
    const problem = optionsProblem(analysis.options, analysis.input.dataSets.length);
    if (problem) return { ok: false, reason: problem };
    const series = xySeries(table, analysis.input.dataSets);
    const points: { readonly x: number; readonly y: number }[][] = [];
    for (const s of series) {
      if (s.points.length === 0) {
        return {
          ok: false,
          reason: `"${s.title}" has no point with both an X and a Y value; there is nothing to fit.`,
        };
      }
      points.push(s.points.map((p) => ({ x: p.x, y: p.y })));
    }
    return {
      ok: true,
      request: {
        model: analysis.options.model,
        series: series.map((s) => ({ id: s.id, title: s.title })),
        points,
        logX: analysis.options.x === 'log',
        constraints: { bottom, top, hillSlope },
        compare: analysis.options.compare,
        shared: effectiveShared(analysis.options.shared, series.length),
      },
    };
  },

  job(request): EngineJob {
    const x = request.points.flatMap((s) => s.map((p) => p.x));
    const y = request.points.flatMap((s) => s.map((p) => p.y));
    const g = request.points.flatMap((s, i) => s.map(() => i + 1));
    const c = [
      limits(request.constraints.bottom),
      limits(request.constraints.top),
      limits(request.constraints.hillSlope),
    ];
    const cmp = request.compare;
    const sh = request.shared;
    return {
      code: `${code}\nbs_nonlinear_regression(x, y, g, k, log_x, lo, hi, has_lo, has_hi, cmp_val, cmp_has, shared)`,
      inputs: {
        x,
        y,
        g,
        k: request.points.length,
        log_x: request.logX,
        lo: c.map((p) => p.lo),
        hi: c.map((p) => p.hi),
        has_lo: c.map((p) => (p.hasLo ? 1 : 0)),
        has_hi: c.map((p) => (p.hasHi ? 1 : 0)),
        cmp_val: [cmp?.bottom ?? 0, cmp?.top ?? 0, cmp?.hillSlope ?? 0],
        shared: [sh.bottom, sh.top, sh.logEc50, sh.hillSlope].map((v) => (v ? 1 : 0)),
        cmp_has: [cmp?.bottom, cmp?.top, cmp?.hillSlope].map((v) =>
          v === null || v === undefined ? 0 : 1,
        ),
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): NonlinearRegressionResult {
    const r = object(value, 'nonlinear regression');
    return {
      model: request.model,
      logX: request.logX,
      constraints: request.constraints,
      compare: request.compare,
      shared: request.shared,
      global: globalFit(r['global']),
      series: list(r['series']).map((v, i) => {
        const named = request.series[i];
        if (!named) throw new Error('nonlinear regression: more series than asked for');
        return { ...named, outcome: outcome(object(v, 'series')) };
      }),
      warnings: [...warnings],
    };
  },
};
