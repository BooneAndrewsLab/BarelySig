/**
 * Nonlinear regression of an XY table's Y data sets (item 32, #37): the
 * four-parameter dose-response curve, base R `nls` ("plinear"), one fit
 * per series.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { xyUnknowns } from '@/model/selectors';

import { regressionBand, runsOutcome } from '../linear-regression';
import runsCode from '../linear-regression/analysis.R?raw';
import type { Residual } from '../linear-regression/types';
import type { AnalysisModule, Prepared } from '../module';
import type { ParameterConstraint } from '@/model/project';
import { need, num, object, type PlainObject } from '../values';
import fitCode from './analysis.R?raw';
import { ciFallback, ciUsed } from './ci';
import { wrongWayWarning } from './direction';
import { alternativeFit, effectiveShared, optionsProblem } from './constraints';
import { effectiveConstraints } from './models';
import { weightedSeries, weightingProblem, yPower } from './weighting';
import type {
  ComparisonOutcome,
  GlobalFit,
  DoseResponseOutcome,
  Interpolation,
  UnknownY,
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
    // A side of a profile-likelihood CI can be open (null: unbounded).
    lower: num(o['lower']),
    upper: num(o['upper']),
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
      bottom: num(s['bottom']),
      top: num(s['top']),
      logEc50: num(s['logec50']),
      hillSlope: num(s['hill']),
      ec50: num(s['ec50']),
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
        : {
            ok: false,
            why:
              f['why'] === 'exact_fit'
                ? 'exact-fit'
                : f['why'] === 'not_nested'
                  ? 'not-nested'
                  : 'no-extra',
          },
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
  weights: 'weights',
} as const;

function interpolations(v: Plain | undefined, rows: readonly UnknownY[]): Interpolation[] {
  return list(v).map((item, i) => {
    const u = object(item, 'interpolated value');
    const at = rows[i];
    if (!at) throw new Error('nonlinear regression: more unknowns than asked for');
    const base = { rowNumber: at.rowNumber, y: at.y };
    const status = u['status'];
    if (status === 'ok') {
      return {
        ...base,
        status,
        x: need(u['x'], 'interpolated X'),
        lower: num(u['lower']),
        upper: num(u['upper']),
      };
    }
    return {
      ...base,
      status: status === 'beyond-bottom' || status === 'beyond-top' ? status : 'undefined',
    };
  });
}

function outcome(o: PlainObject, unknowns: readonly UnknownY[]): DoseResponseOutcome {
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
    ec50Lower: num(o['ec50_lower']),
    ec50Upper: num(o['ec50_upper']),
    ci: o['ci_method'] === 'profile' ? 'profile' : 'wald',
    df: need(o['df'], 'df'),
    ss: need(o['ss'], 'sum of squares'),
    syx: need(o['syx'], 'Sy.x'),
    r2: need(o['r2'], 'R²'),
    residuals,
    runs: runsOutcome(object(o['runs'] ?? null, 'runs test')),
    band: regressionBand(object(o['band'] ?? null, 'band')),
    comparison: comparison(o['comparison']),
    unknowns: interpolations(o['unknowns'], unknowns),
  };
}

export const nonlinearRegression: AnalysisModule<
  'nonlinear-regression',
  NonlinearRegressionRequest,
  NonlinearRegressionResult
> = {
  kind: 'nonlinear-regression',
  version: 8,
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
    const problem =
      optionsProblem(analysis.options, analysis.input.dataSets.length) ??
      weightingProblem(analysis.options);
    if (problem) return { ok: false, reason: problem };
    const alternative = alternativeFit(analysis.options, analysis.input.dataSets.length);
    if (typeof alternative === 'string') return { ok: false, reason: alternative };
    const logX = analysis.options.x === 'log';
    const weighted = weightedSeries(
      table,
      analysis.input.dataSets,
      analysis.options.weighting,
      logX,
    );
    if (!weighted.ok) return { ok: false, reason: weighted.reason };
    const series = weighted.series;
    const unknowns = analysis.options.interpolate
      ? xyUnknowns(table, analysis.input.dataSets).map((rows) =>
          rows.map((r) => ({ rowNumber: r.rowNumber, y: r.y })),
        )
      : series.map(() => []);
    const points: (readonly { readonly x: number; readonly y: number }[])[] = [];
    for (const s of series) {
      if (s.points.length === 0) {
        return {
          ok: false,
          reason: `"${s.title}" has no point with both an X and a Y value; there is nothing to fit.`,
        };
      }
      points.push(s.points);
    }
    return {
      ok: true,
      request: {
        model: analysis.options.model,
        series: series.map((s) => ({ id: s.id, title: s.title })),
        points,
        logX,
        constraints: { bottom, top, hillSlope },
        compare: analysis.options.compare,
        alternative,
        compareWith: analysis.options.compareWith,
        alpha: analysis.options.compareAlpha,
        shared: effectiveShared(analysis.options.shared, series.length),
        weighting: analysis.options.weighting,
        weights: series.map((s) => s.weights),
        unknowns,
        ci: analysis.options.ci,
      },
    };
  },

  job(request): EngineJob {
    const x = request.points.flatMap((s) => s.map((p) => p.x));
    const y = request.points.flatMap((s) => s.map((p) => p.y));
    const g = request.points.flatMap((s, i) => s.map(() => i + 1));
    const w = request.weights.flat();
    const u = request.unknowns.flatMap((s) => s.map((r) => r.y));
    const ug = request.unknowns.flatMap((s, i) => s.map(() => i + 1));
    const c = [
      limits(request.constraints.bottom),
      limits(request.constraints.top),
      limits(request.constraints.hillSlope),
    ];
    const cmp = request.compare;
    const sh = request.shared;
    const alt = request.alternative;
    const altLimits = alt
      ? [
          limits(alt.constraints.bottom),
          limits(alt.constraints.top),
          limits(alt.constraints.hillSlope),
        ]
      : c;
    const altShared = alt?.shared ?? sh;
    const role = { none: 0, 'alternative-simpler': 1, 'alternative-complex': 2, 'not-nested': 3 };
    return {
      code: `${code}\nbs_nonlinear_regression(x, y, w, g, k, log_x, lo, hi, has_lo, has_hi, cmp_val, cmp_has, shared,\n  alt_lo, alt_hi, alt_has_lo, alt_has_hi, alt_shared, alt_role, ypow, u, ug, profile)`,
      inputs: {
        x,
        y,
        w,
        g,
        k: request.points.length,
        log_x: request.logX,
        lo: c.map((p) => p.lo),
        hi: c.map((p) => p.hi),
        has_lo: c.map((p) => (p.hasLo ? 1 : 0)),
        has_hi: c.map((p) => (p.hasHi ? 1 : 0)),
        cmp_val: [cmp?.bottom ?? 0, cmp?.top ?? 0, cmp?.hillSlope ?? 0],
        alt_lo: altLimits.map((p) => p.lo),
        alt_hi: altLimits.map((p) => p.hi),
        alt_has_lo: altLimits.map((p) => (p.hasLo ? 1 : 0)),
        alt_has_hi: altLimits.map((p) => (p.hasHi ? 1 : 0)),
        alt_shared: [altShared.bottom, altShared.top, altShared.logEc50, altShared.hillSlope].map(
          (v) => (v ? 1 : 0),
        ),
        alt_role: alt ? role[alt.relation] : role.none,
        ypow: yPower(request.weighting),
        profile: ciUsed(request) === 'profile' ? 1 : 0,
        u,
        ug,
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
    const series = list(r['series']).map((v, i) => {
      const named = request.series[i];
      if (!named) throw new Error('nonlinear regression: more series than asked for');
      return { ...named, outcome: outcome(object(v, 'series'), request.unknowns[i] ?? []) };
    });
    const wrongWay = series.flatMap((s, i) => {
      const w = wrongWayWarning(request.model, s.title, request.points[i] ?? [], s.outcome);
      return w === null ? [] : [w];
    });
    return {
      model: request.model,
      logX: request.logX,
      constraints: request.constraints,
      compare: request.compare,
      alternative: request.alternative,
      compareWith: request.compareWith,
      alpha: request.alpha,
      comparison: comparison(r['comparison']),
      shared: request.shared,
      weighting: request.weighting,
      ci: ciUsed(request),
      ciFallback: ciFallback(request),
      global: globalFit(r['global']),
      series,
      warnings: [...warnings, ...wrongWay],
    };
  },
};
