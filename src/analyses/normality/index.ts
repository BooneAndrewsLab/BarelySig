/**
 * Normality tests (item 06, #28): D'Agostino-Pearson omnibus K² and
 * Shapiro-Wilk for each group, as Prism reports them.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { columnGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, num, object, type PlainObject } from '../values';
import code from './analysis.R?raw';
import type { NormalityRequest, NormalityResult, TestOutcome } from './types';

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

function outcome<T>(o: PlainObject, ran: (o: PlainObject) => T): TestOutcome<T> {
  const why = o['why'];
  if (why === 'few' || why === 'many' || why === 'same') {
    return { ran: false, why, limit: num(o['minimum']) ?? num(o['maximum']) };
  }
  return { ran: true, ...ran(o) };
}

export const normality: AnalysisModule<'normality', NormalityRequest, NormalityResult> = {
  kind: 'normality',
  version: 1,
  code,

  prepare(analysis, project): Prepared<NormalityRequest> {
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'Normality tests look at the groups of a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table these tests read no longer exists.' };
    if (table.type !== 'column')
      return { ok: false, reason: 'Normality tests look at the groups of a Column table.' };
    if (analysis.input.dataSets.length === 0)
      return { ok: false, reason: 'Choose a group to test.' };
    const groups = columnGroups(table, analysis.input.dataSets);
    const values: (readonly number[])[] = [];
    const dropped = [];
    for (const g of groups) {
      if (g.data.kind !== 'raw') {
        return {
          ok: false,
          reason:
            'A normality test looks at the individual values, so it can’t be run on summary data (mean, SD, n).',
        };
      }
      values.push(g.data.values);
      dropped.push(g.data.dropped);
    }
    return {
      ok: true,
      request: { groups: groups.map((g) => ({ id: g.id, title: g.title })), values, dropped },
    };
  },

  job(request): EngineJob {
    return {
      code: `${code}\nbs_normality(y, g, k)`,
      inputs: {
        y: request.values.flat(),
        g: request.values.flatMap((xs, i) => xs.map(() => i + 1)),
        k: request.values.length,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): NormalityResult {
    const r = object(value, 'normality');
    return {
      groups: list(r['groups']).map((v, i) => {
        const g = object(v, 'group');
        const named = request.groups[i];
        if (!named) throw new Error('normality: more groups than asked for');
        return {
          ...named,
          n: need(g['n'], 'n'),
          dropped: request.dropped[i] ?? null,
          shapiroWilk: outcome(object(g['shapiro_wilk'] ?? null, 'Shapiro-Wilk'), (o) => ({
            w: need(o['w'], 'W'),
            p: need(o['p'], 'P'),
          })),
          dagostino: outcome(object(g['dagostino'] ?? null, "D'Agostino"), (o) => ({
            k2: need(o['k2'], 'K2'),
            p: need(o['p'], 'P'),
            zSkewness: need(o['z_skewness'], 'skewness'),
            zKurtosis: need(o['z_kurtosis'], 'kurtosis'),
          })),
        };
      }),
      warnings: [...warnings],
    };
  },
};
