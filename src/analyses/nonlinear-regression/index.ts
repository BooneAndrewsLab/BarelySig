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
import { need, num, object, type PlainObject } from '../values';
import fitCode from './analysis.R?raw';
import type {
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
  return {
    value: need(o['value'], what),
    se: need(o['se'], `${what} SE`),
    lower: need(o['lower'], `${what} CI lower`),
    upper: need(o['upper'], `${what} CI upper`),
    dependency: need(o['dependency'], `${what} dependency`),
    ambiguous: o['ambiguous'] === true,
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
  };
}

export const nonlinearRegression: AnalysisModule<
  'nonlinear-regression',
  NonlinearRegressionRequest,
  NonlinearRegressionResult
> = {
  kind: 'nonlinear-regression',
  version: 1,
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
        series: series.map((s) => ({ id: s.id, title: s.title })),
        points,
        logX: analysis.options.x === 'log',
      },
    };
  },

  job(request): EngineJob {
    const x = request.points.flatMap((s) => s.map((p) => p.x));
    const y = request.points.flatMap((s) => s.map((p) => p.y));
    const g = request.points.flatMap((s, i) => s.map(() => i + 1));
    return {
      code: `${code}\nbs_nonlinear_regression(x, y, g, k, log_x)`,
      inputs: { x, y, g, k: request.points.length, log_x: request.logX },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): NonlinearRegressionResult {
    const r = object(value, 'nonlinear regression');
    return {
      logX: request.logX,
      series: list(r['series']).map((v, i) => {
        const named = request.series[i];
        if (!named) throw new Error('nonlinear regression: more series than asked for');
        return { ...named, outcome: outcome(object(v, 'series')) };
      }),
      warnings: [...warnings],
    };
  },
};
