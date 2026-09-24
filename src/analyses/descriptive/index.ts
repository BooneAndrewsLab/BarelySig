/**
 * Descriptive statistics (item 04, #16): Prism's column statistics for
 * each selected group of a Column table, from its values or from summary
 * data.
 */
import type { EngineInput, EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { columnGroups } from '@/model/selectors';

import type { AnalysisModule } from '../module';
import { num, object } from '../values';
import code from './analysis.R?raw';
import type { DescribedGroup, DescriptiveRequest, DescriptiveResult } from './types';

const NONE = {
  min: null,
  q1: null,
  median: null,
  q3: null,
  max: null,
  range: null,
  geomean: null,
  sum: null,
};

export const descriptive: AnalysisModule<'descriptive', DescriptiveRequest, DescriptiveResult> = {
  kind: 'descriptive',
  version: 1,
  code,

  prepare(analysis, project) {
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'Descriptive statistics describe a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this analysis describes no longer exists.' };
    if (table.type !== 'column') {
      return {
        ok: false,
        reason:
          'Descriptive statistics of Grouped tables are not available yet; use a Column table.',
      };
    }
    if (analysis.input.dataSets.length === 0)
      return { ok: false, reason: 'Choose at least one group to describe.' };
    const groups = columnGroups(table, analysis.input.dataSets);
    const any = groups.some((g) =>
      g.data.kind === 'raw' ? g.data.values.length > 0 : g.data.mean !== null,
    );
    if (!any) return { ok: false, reason: 'There are no values to describe yet.' };
    return { ok: true, request: { groups } };
  },

  job(request): EngineJob {
    const inputs: Record<string, EngineInput> = {};
    const calls = request.groups.map((g, i) => {
      const k = `g${String(i + 1)}`;
      if (g.data.kind === 'raw') {
        inputs[k] = g.data.values;
        return `${k} = bs_describe(${k})`;
      }
      inputs[`${k}_mean`] = [g.data.mean];
      inputs[`${k}_sd`] = [g.data.sd];
      inputs[`${k}_n`] = [g.data.n];
      return `${k} = bs_describe_summary(${k}_mean, ${k}_sd, ${k}_n)`;
    });
    return { code: `${code}\nlist(${calls.join(', ')})`, inputs, packages: [] };
  },

  parse(value: Plain, request, warnings) {
    const all = object(value, 'descriptive statistics');
    const groups = request.groups.map((g, i): DescribedGroup => {
      const r = object(all[`g${String(i + 1)}`] ?? null, 'group');
      const common = {
        id: g.id,
        title: g.title,
        n: num(r['n']),
        mean: num(r['mean']),
        sd: num(r['sd']),
        sem: num(r['sem']),
        ciLower: num(r['ci_lower']),
        ciUpper: num(r['ci_upper']),
        cv: num(r['cv']),
      };
      if (g.data.kind === 'summary') return { ...common, ...NONE, from: 'summary', dropped: null };
      return {
        ...common,
        from: 'values',
        dropped: g.data.dropped,
        min: num(r['min']),
        q1: num(r['q1']),
        median: num(r['median']),
        q3: num(r['q3']),
        max: num(r['max']),
        range: num(r['range']),
        geomean: num(r['geomean']),
        sum: num(r['sum']),
      };
    });
    return { groups, warnings: [...warnings] };
  },
};
