/**
 * Nested t test (item 13, #66): a REML mixed model over a Nested table's
 * groups and their biological replicates.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { type RawGroupData, nestedGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, object } from '../values';
import code from './analysis.R?raw';
import type { NestedGroupData, NestedTTestRequest, NestedTTestResult } from './types';

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** Replicates with at least one usable value; empties are dropped and counted. */
function usable(replicates: readonly RawGroupData[]): {
  readonly data: NestedGroupData;
  readonly dropped: number;
} {
  const kept = replicates.filter((r) => r.values.length > 0);
  return {
    data: { replicates: kept.map((r) => r.values) },
    dropped: replicates.length - kept.length,
  };
}

export const nestedTTest: AnalysisModule<'nested-t-test', NestedTTestRequest, NestedTTestResult> = {
  kind: 'nested-t-test',
  version: 1,
  code,

  prepare(analysis, project): Prepared<NestedTTestRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'A nested t test compares two groups of a Nested table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) {
      return { ok: false, reason: 'The table this nested t test reads no longer exists.' };
    }
    if (table.type !== 'nested') {
      return { ok: false, reason: 'A nested t test compares two groups of a Nested table.' };
    }
    const ids = analysis.input.dataSets;
    if (ids.length !== 2) {
      return {
        ok: false,
        reason:
          ids.length < 2
            ? 'A nested t test compares two groups; choose two.'
            : `A nested t test compares two groups; this one has ${String(ids.length)}. Choose two, or use nested one-way ANOVA.`,
      };
    }
    const [ga, gb] = nestedGroups(table, ids);
    if (!ga || !gb) return { ok: false, reason: 'Choose two groups.' };
    const a = usable(ga.replicates);
    const b = usable(gb.replicates);
    const short = [
      { title: ga.title, n: a.data.replicates.length },
      { title: gb.title, n: b.data.replicates.length },
    ].find((g) => g.n < 2);
    if (short) {
      return {
        ok: false,
        reason: `Each group needs at least two replicates with a usable value for a nested t test; ${short.title} has ${count(short.n, 'replicate', 'replicates')}.`,
      };
    }
    return {
      ok: true,
      request: {
        a: { id: ga.id, title: ga.title },
        b: { id: gb.id, title: gb.title },
        options,
        data: { a: a.data, b: b.data },
        droppedReplicates: { a: a.dropped, b: b.dropped },
      },
    };
  },

  job(request): EngineJob {
    const flat = (g: NestedGroupData) => ({
      value: g.replicates.flat(),
      replicate: g.replicates.flatMap((r, i) => r.map(() => i + 1)),
    });
    const a = flat(request.data.a);
    const b = flat(request.data.b);
    return {
      code: `${code}\nbs_nested_ttest(a_value, a_replicate, b_value, b_replicate)`,
      inputs: {
        a_value: a.value,
        a_replicate: a.replicate,
        b_value: b.value,
        b_replicate: b.replicate,
      },
      packages: ['nlme'],
    };
  },

  parse(value: Plain, request, warnings): NestedTTestResult {
    const r = object(value, 'nested t test');
    const pTwo = need(r['p_two'], 'P');
    const pOne = pTwo / 2;
    const group = (k: 'a' | 'b') => ({
      ...request[k],
      nReplicates: need(r[`n_rep_${k}`], 'replicates'),
      nValues: need(r[`n_values_${k}`], 'values'),
      mean: need(r[`mean_${k}`], 'mean'),
    });
    return {
      tails: request.options.tails,
      a: group('a'),
      b: group('b'),
      t: need(r['t'], 't'),
      df: need(r['df'], 'df'),
      pTwo,
      pOne,
      p: request.options.tails === 'one' ? pOne : pTwo,
      difference: need(r['difference'], 'difference'),
      seDifference: need(r['se_difference'], 'SE'),
      ciLower: need(r['ci_lower'], 'CI'),
      ciUpper: need(r['ci_upper'], 'CI'),
      betweenReplicateSd: need(r['between_replicate_sd'], 'between-replicate SD'),
      withinReplicateSd: need(r['within_replicate_sd'], 'within-replicate SD'),
      droppedReplicates: request.droppedReplicates,
      warnings: [...warnings],
    };
  },
};
