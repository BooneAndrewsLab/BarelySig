/**
 * Simple linear regression of an XY table's Y data sets against its
 * shared X (item 29, #38): `lm(y ~ x)`, base R.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { xySeries } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, num, object, type PlainObject } from '../values';
import code from './analysis.R?raw';
import type {
  LinearRegressionRequest,
  LinearRegressionResult,
  RegressionBand,
  RegressionOutcome,
  Residual,
  RunsOutcome,
} from './types';

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

export function runsOutcome(o: PlainObject): RunsOutcome {
  const why = o['why'];
  if (why === 'few' || why === 'same') {
    return {
      ran: false,
      why,
      nPositive: num(o['n_pos']) ?? 0,
      nNegative: num(o['n_neg']) ?? 0,
    };
  }
  return {
    ran: true,
    nRuns: need(o['n_runs'], 'runs'),
    nPositive: need(o['n_pos'], 'n+'),
    nNegative: need(o['n_neg'], 'n-'),
    z: need(o['z'], 'Z'),
    p: need(o['p'], 'P'),
  };
}

export function regressionBand(o: PlainObject): RegressionBand {
  return {
    x: list(o['x']).map((v) => num(v) ?? 0),
    fit: list(o['fit']).map((v) => num(v) ?? 0),
    confidenceLower: list(o['confidence_lower']).map((v) => num(v) ?? 0),
    confidenceUpper: list(o['confidence_upper']).map((v) => num(v) ?? 0),
    predictionLower: list(o['prediction_lower']).map((v) => num(v) ?? 0),
    predictionUpper: list(o['prediction_upper']).map((v) => num(v) ?? 0),
  };
}

function regressionOutcome(o: PlainObject): RegressionOutcome {
  const n = num(o['n']) ?? 0;
  if (o['ran'] !== true) {
    const why = o['why'];
    return {
      ran: false,
      n,
      why: why === 'constant_x' ? 'constant-x' : why === 'constant_y' ? 'constant-y' : 'few',
      minimum: num(o['minimum']),
    };
  }
  const xs = list(o['x']).map((v) => num(v) ?? 0);
  const ys = list(o['y']).map((v) => num(v) ?? 0);
  const fitted = list(o['fitted']).map((v) => num(v) ?? 0);
  const residual = list(o['residual']).map((v) => num(v) ?? 0);
  const residuals: Residual[] = xs.map((x, i) => ({
    x,
    y: ys[i] ?? 0,
    fitted: fitted[i] ?? 0,
    residual: residual[i] ?? 0,
  }));
  return {
    ran: true,
    n,
    slope: need(o['slope'], 'slope'),
    slopeLower: need(o['slope_lower'], 'slope CI lower'),
    slopeUpper: need(o['slope_upper'], 'slope CI upper'),
    intercept: need(o['intercept'], 'intercept'),
    interceptLower: need(o['intercept_lower'], 'intercept CI lower'),
    interceptUpper: need(o['intercept_upper'], 'intercept CI upper'),
    r2: need(o['r2'], 'R²'),
    f: need(o['f'], 'F'),
    dfNum: need(o['df_num'], 'df (numerator)'),
    dfDen: need(o['df_den'], 'df (denominator)'),
    p: need(o['p'], 'P'),
    residuals,
    runs: runsOutcome(object(o['runs'] ?? null, 'runs test')),
    band: regressionBand(object(o['band'] ?? null, 'band')),
  };
}

export const linearRegression: AnalysisModule<
  'linear-regression',
  LinearRegressionRequest,
  LinearRegressionResult
> = {
  kind: 'linear-regression',
  version: 1,
  code,

  prepare(analysis, project): Prepared<LinearRegressionRequest> {
    if (analysis.input.kind !== 'table') {
      return { ok: false, reason: 'Linear regression looks at an XY table.' };
    }
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this regression reads no longer exists.' };
    if (table.type !== 'xy') {
      return { ok: false, reason: 'Linear regression looks at the Y data sets of an XY table.' };
    }
    if (analysis.input.dataSets.length === 0) {
      return { ok: false, reason: 'Choose a Y data set to fit a line to.' };
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
      request: { series: series.map((s) => ({ id: s.id, title: s.title })), points },
    };
  },

  job(request): EngineJob {
    const x = request.points.flatMap((s) => s.map((p) => p.x));
    const y = request.points.flatMap((s) => s.map((p) => p.y));
    const g = request.points.flatMap((s, i) => s.map(() => i + 1));
    return {
      code: `${code}\nbs_linear_regression(x, y, g, k)`,
      inputs: { x, y, g, k: request.points.length },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): LinearRegressionResult {
    const r = object(value, 'linear regression');
    return {
      series: list(r['series']).map((v, i) => {
        const named = request.series[i];
        if (!named) throw new Error('linear regression: more series than asked for');
        return { ...named, outcome: regressionOutcome(object(v, 'series')) };
      }),
      warnings: [...warnings],
    };
  },
};
