/**
 * Pearson or Spearman correlation of an XY table's Y data sets against
 * its shared X (item 29, #38): `cor.test()`, base R.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { xySeries } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, num, object, rString } from '../values';
import code from './analysis.R?raw';
import type { CorrelationOutcome, CorrelationRequest, CorrelationResult } from './types';

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

export const correlation: AnalysisModule<'correlation', CorrelationRequest, CorrelationResult> = {
  kind: 'correlation',
  version: 1,
  code,

  prepare(analysis, project): Prepared<CorrelationRequest> {
    if (analysis.input.kind !== 'table') {
      return { ok: false, reason: 'Correlation looks at an XY table.' };
    }
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this correlation reads no longer exists.' };
    if (table.type !== 'xy') {
      return { ok: false, reason: 'Correlation looks at the Y data sets of an XY table.' };
    }
    if (analysis.input.dataSets.length === 0) {
      return { ok: false, reason: 'Choose a Y data set to correlate with X.' };
    }
    const series = xySeries(table, analysis.input.dataSets);
    const points: { readonly x: number; readonly y: number }[][] = [];
    for (const s of series) {
      if (s.points.length === 0) {
        return {
          ok: false,
          reason: `"${s.title}" has no point with both an X and a Y value; there is nothing to correlate.`,
        };
      }
      points.push(s.points.map((p) => ({ x: p.x, y: p.y })));
    }
    return {
      ok: true,
      request: {
        method: analysis.options.method,
        series: series.map((s) => ({ id: s.id, title: s.title })),
        points,
      },
    };
  },

  job(request): EngineJob {
    const x = request.points.flatMap((s) => s.map((p) => p.x));
    const y = request.points.flatMap((s) => s.map((p) => p.y));
    const g = request.points.flatMap((s, i) => s.map(() => i + 1));
    return {
      code: `${code}\nbs_correlation(x, y, g, k, ${rString(request.method)})`,
      inputs: { x, y, g, k: request.points.length },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): CorrelationResult {
    const r = object(value, 'correlation');
    return {
      method: request.method,
      series: list(r['series']).map((v, i) => {
        const named = request.series[i];
        if (!named) throw new Error('correlation: more series than asked for');
        const o = object(v, 'series');
        const outcome: CorrelationOutcome =
          o['ran'] === true
            ? {
                ran: true,
                n: need(o['n'], 'n'),
                r: need(o['r'], 'r'),
                lower: num(o['lower']),
                upper: num(o['upper']),
                statistic: need(o['statistic'], 'test statistic'),
                df: num(o['df']),
                p: need(o['p'], 'P'),
                exact: typeof o['exact'] === 'boolean' ? o['exact'] : null,
                ties: typeof o['ties'] === 'boolean' ? o['ties'] : null,
              }
            : {
                ran: false,
                n: num(o['n']) ?? 0,
                why: o['why'] === 'constant' ? 'constant' : 'few',
                minimum: num(o['minimum']),
              };
        return { ...named, outcome };
      }),
      warnings: [...warnings],
    };
  },
};
