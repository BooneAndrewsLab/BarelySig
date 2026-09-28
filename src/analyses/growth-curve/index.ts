/**
 * Growth curve analysis of an XY table's Y data sets (item 33, #94):
 * Zwietering's reparameterized Gompertz growth model, one fit per series,
 * with lag/exponential/stationary phases read off the fit.
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
  FitQuantity,
  GrowthCurveOutcome,
  GrowthCurveRequest,
  GrowthCurveResult,
} from './types';

/** linear-regression's `bs_runs_test` is shared, not copied (note 33, as note 32 does). */
const code = `${runsCode}\n${fitCode}`;

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);
const numbers = (v: Plain | undefined): number[] => list(v).map((x) => num(x) ?? 0);

function quantity(v: Plain | undefined, what: string): FitQuantity {
  const o = object(v ?? null, what);
  return {
    value: need(o['value'], what),
    se: need(o['se'], `${what} SE`),
    lower: need(o['lower'], `${what} CI lower`),
    upper: need(o['upper'], `${what} CI upper`),
  };
}

const WHY = {
  few: 'few',
  few_t: 'few-t',
  constant_y: 'constant-y',
  no_fit: 'no-fit',
} as const;

function outcome(o: PlainObject): GrowthCurveOutcome {
  const n = num(o['n']) ?? 0;
  if (o['ran'] !== true) {
    const why = o['why'];
    return {
      ran: false,
      n,
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
    asymptote: quantity(o['asymptote'], 'Asymptote'),
    growthRate: quantity(o['growth_rate'], 'Growth rate'),
    lag: quantity(o['lag'], 'Lag time'),
    doublingTime: quantity(o['doubling_time'], 'Doubling time'),
    exponentialEnd: quantity(o['exponential_end'], 'End of exponential phase'),
    df: need(o['df'], 'df'),
    ss: need(o['ss'], 'sum of squares'),
    syx: need(o['syx'], 'Sy.x'),
    r2: need(o['r2'], 'R²'),
    residuals,
    runs: runsOutcome(object(o['runs'] ?? null, 'runs test')),
    band: regressionBand(object(o['band'] ?? null, 'band')),
  };
}

export const growthCurve: AnalysisModule<'growth-curve', GrowthCurveRequest, GrowthCurveResult> = {
  kind: 'growth-curve',
  version: 1,
  code,

  prepare(analysis, project): Prepared<GrowthCurveRequest> {
    if (analysis.input.kind !== 'table') {
      return { ok: false, reason: 'A growth curve fit looks at an XY table.' };
    }
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this fit reads no longer exists.' };
    if (table.type !== 'xy') {
      return { ok: false, reason: 'A growth curve fit looks at the Y data sets of an XY table.' };
    }
    if (analysis.input.dataSets.length === 0) {
      return { ok: false, reason: 'Choose a Y data set to fit a growth curve to.' };
    }
    const series = xySeries(table, analysis.input.dataSets);
    const points: { readonly x: number; readonly y: number }[][] = [];
    for (const s of series) {
      if (s.points.length === 0) {
        return {
          ok: false,
          reason: `"${s.title}" has no point with both a time and a Y value; there is nothing to fit.`,
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
      code: `${code}\nbs_growth_curve(x, y, g, k)`,
      inputs: { x, y, g, k: request.points.length },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): GrowthCurveResult {
    const r = object(value, 'growth curve');
    return {
      series: list(r['series']).map((v, i) => {
        const named = request.series[i];
        if (!named) throw new Error('growth curve: more series than asked for');
        return { ...named, outcome: outcome(object(v, 'series')) };
      }),
      warnings: [...warnings],
    };
  },
};
