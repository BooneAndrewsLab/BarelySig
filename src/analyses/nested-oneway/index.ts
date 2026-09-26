/**
 * Nested one-way ANOVA (item 13, #67): the nested t test's REML mixed
 * model over three or more of a Nested table's groups.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { type RawGroupData, nestedGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, object } from '../values';
import code from './analysis.R?raw';
import type { NestedOneWayGroupData, NestedOneWayRequest, NestedOneWayResult } from './types';

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** Replicates with at least one usable value; empties are dropped and counted. */
function usable(replicates: readonly RawGroupData[]): {
  readonly data: NestedOneWayGroupData;
  readonly dropped: number;
} {
  const kept = replicates.filter((r) => r.values.length > 0);
  return {
    data: { replicates: kept.map((r) => r.values) },
    dropped: replicates.length - kept.length,
  };
}

export const nestedOneway: AnalysisModule<
  'nested-one-way-anova',
  NestedOneWayRequest,
  NestedOneWayResult
> = {
  kind: 'nested-one-way-anova',
  version: 1,
  code,

  prepare(analysis, project): Prepared<NestedOneWayRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'Nested one-way ANOVA compares groups of a Nested table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) {
      return { ok: false, reason: 'The table this ANOVA reads no longer exists.' };
    }
    if (table.type !== 'nested') {
      return { ok: false, reason: 'Nested one-way ANOVA compares groups of a Nested table.' };
    }
    const ids = analysis.input.dataSets;
    if (ids.length < 2) {
      return {
        ok: false,
        reason: 'Nested one-way ANOVA compares at least two groups; choose more.',
      };
    }
    const c = options.comparisons;
    let control: number | null = null;
    if (c.kind === 'control') {
      control = ids.indexOf(c.control);
      if (control < 0) {
        return {
          ok: false,
          reason: 'The control group isn’t among the groups analysed. Choose it again.',
        };
      }
    }
    const groups = nestedGroups(table, ids);
    const named = groups.map((g) => ({ id: g.id, title: g.title }));
    const usables = groups.map((g) => usable(g.replicates));
    const short = usables
      .map((u, i) => ({ title: named[i]?.title ?? '', n: u.data.replicates.length }))
      .find((g) => g.n < 2);
    if (short) {
      return {
        ok: false,
        reason: `Each group needs at least two replicates with a usable value for a nested one-way ANOVA; ${short.title} has ${count(short.n, 'replicate', 'replicates')}.`,
      };
    }
    return {
      ok: true,
      request: {
        groups: named,
        comparisons: c,
        control,
        data: usables.map((u) => u.data),
        droppedReplicates: usables.map((u) => u.dropped),
      },
    };
  },

  job(request): EngineJob {
    const { comparisons, data } = request;
    const test = comparisons.kind === 'none' ? 'tukey' : comparisons.test;
    const groupIdx = data.flatMap((g, i) => g.replicates.flatMap((r) => r.map(() => i + 1)));
    const replicateIdx = data.flatMap((g) => g.replicates.flatMap((r, s) => r.map(() => s + 1)));
    return {
      code: `${code}\nbs_nested_oneway(value, group_idx, replicate_idx, k, comps, control, test)`,
      inputs: {
        value: data.flatMap((g) => g.replicates.flat()),
        group_idx: groupIdx,
        replicate_idx: replicateIdx,
        k: data.length,
        comps: comparisons.kind,
        control: (request.control ?? 0) + 1,
        test,
      },
      packages: ['nlme', 'emmeans'],
    };
  },

  parse(value: Plain, request, warnings): NestedOneWayResult {
    const r = object(value, 'nested one-way ANOVA');
    const named = request.groups;
    const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);
    const means = list(r['means']);
    const nRep = list(r['n_rep']);
    const nValues = list(r['n_values']);
    const groups = named.map((g, i) => ({
      ...g,
      nReplicates: need(nRep[i], 'replicates'),
      nValues: need(nValues[i], 'values'),
      mean: need(means[i], 'mean'),
      dropped: request.droppedReplicates[i] ?? 0,
    }));
    const group = (i: Plain | undefined) => {
      const g = named[need(i, 'group') - 1];
      if (!g) throw new Error('nested one-way ANOVA: comparison of an unknown group');
      return g;
    };
    const pairs = list(r['comparisons']).map((v) => {
      const c = object(v, 'comparison');
      return {
        a: group(c['i']),
        b: group(c['j']),
        diff: need(c['diff'], 'difference'),
        se: need(c['se'], 'SE'),
        df: need(c['df'], 'df'),
        statistic: need(c['statistic'], 'statistic'),
        ciLower: need(c['ci_lower'], 'CI'),
        ciUpper: need(c['ci_upper'], 'CI'),
        p: need(c['p'], 'P'),
      };
    });
    return {
      groups,
      anova: {
        f: need(r['f'], 'F'),
        dfn: need(r['dfn'], 'DFn'),
        dfd: need(r['dfd'], 'DFd'),
        p: need(r['p'], 'P'),
      },
      betweenReplicateSd: need(r['between_replicate_sd'], 'between-replicate SD'),
      withinReplicateSd: need(r['within_replicate_sd'], 'within-replicate SD'),
      comparisons: request.comparisons,
      pairs,
      warnings: [...warnings],
    };
  },
};
