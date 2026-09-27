/**
 * Nested t test (item 13, #66): a REML mixed model over a Nested table's
 * groups and their biological replicates; or, matched (note 14, #70), a
 * paired t test on the replicate means.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { type NestedGroup, type RawGroupData, nestedGroups } from '@/model/selectors';
import type { NestedTable } from '@/model/table';

import type { AnalysisModule, Prepared } from '../module';
import { need, num, object } from '../values';
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

/**
 * Matched replicates (note 14): replicate n is the same experiment in both groups, so a
 * replicate is used only when it has values in both — as a paired test drops a row with a
 * missing value on either side. Empty in both: dropped and counted; in one only: unmatched.
 */
function matchedPairs(table: NestedTable, ga: NestedGroup, gb: NestedGroup) {
  const a: (readonly number[])[] = [];
  const b: (readonly number[])[] = [];
  const unmatched: string[] = [];
  let dropped = 0;
  ga.replicates.forEach((ra, i) => {
    const va = ra.values;
    const vb = gb.replicates[i]?.values ?? [];
    if (va.length > 0 && vb.length > 0) {
      a.push(va);
      b.push(vb);
    } else if (va.length > 0 || vb.length > 0) {
      unmatched.push(table.replicateTitles?.[i] ?? `Replicate ${String(i + 1)}`);
    } else dropped += 1;
  });
  return { a: { replicates: a }, b: { replicates: b }, unmatched, dropped };
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
    if (options.matched) {
      const m = matchedPairs(table, ga, gb);
      if (m.a.replicates.length < 2) {
        const left = m.unmatched.length
          ? ` (${m.unmatched.join(', ')} ${m.unmatched.length === 1 ? 'has' : 'have'} values in one group only)`
          : '';
        return {
          ok: false,
          reason: `A matched nested t test needs at least two replicates with values in both groups; there ${m.a.replicates.length === 1 ? 'is' : 'are'} ${String(m.a.replicates.length)}${left}.`,
        };
      }
      return {
        ok: true,
        request: {
          a: { id: ga.id, title: ga.title },
          b: { id: gb.id, title: gb.title },
          options,
          data: { a: m.a, b: m.b },
          droppedReplicates: { a: m.dropped, b: m.dropped },
          unmatched: m.unmatched,
        },
      };
    }
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
        unmatched: [],
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
      code: `${code}\n${request.options.matched ? 'bs_nested_ttest_matched' : 'bs_nested_ttest'}(a_value, a_replicate, b_value, b_replicate)`,
      inputs: {
        a_value: a.value,
        a_replicate: a.replicate,
        b_value: b.value,
        b_replicate: b.replicate,
      },
      packages: request.options.matched ? [] : ['nlme'],
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
    const common = {
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
      droppedReplicates: request.droppedReplicates,
      warnings: [...warnings],
    };
    if (request.options.matched) {
      return {
        ...common,
        design: 'matched',
        sdDifference: need(r['sd_difference'], 'SD of differences'),
        pairingR: num(r['pairing_r']),
        pairingP: num(r['pairing_p']),
        unmatched: request.unmatched,
      };
    }
    return {
      ...common,
      design: 'nested',
      betweenReplicateSd: need(r['between_replicate_sd'], 'between-replicate SD'),
      withinReplicateSd: need(r['within_replicate_sd'], 'within-replicate SD'),
    };
  },
};
