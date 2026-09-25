/**
 * Mann-Whitney and Wilcoxon matched-pairs tests (item 06, #24), with exact
 * P values even with ties, reported as Prism does.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { columnGroups, pairedGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, num, object } from '../values';
import code from './analysis.R?raw';
import type { RankTestRequest, RankTestResult } from './types';

const flag = (v: Plain | undefined): boolean => v === true;

export const ranktest: AnalysisModule<'rank-test', RankTestRequest, RankTestResult> = {
  kind: 'rank-test',
  version: 1,
  code,

  prepare(analysis, project): Prepared<RankTestRequest> {
    const { options } = analysis;
    const name = options.paired ? 'A Wilcoxon test' : 'A Mann-Whitney test';
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: `${name} compares two groups of a data table.` };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: `The table this test reads no longer exists.` };
    if (table.type !== 'column')
      return { ok: false, reason: `${name} compares two groups of a Column table.` };
    const ids = analysis.input.dataSets;
    if (ids.length !== 2) {
      return {
        ok: false,
        reason:
          ids.length < 2
            ? `${name} compares two groups; choose two.`
            : `${name} compares two groups; this one has ${String(ids.length)}. Choose two, or use the Kruskal-Wallis test.`,
      };
    }
    const [ga, gb] = columnGroups(table, ids);
    if (!ga || !gb) return { ok: false, reason: 'Choose two groups.' };
    if (ga.data.kind !== 'raw' || gb.data.kind !== 'raw') {
      return {
        ok: false,
        reason: `${name} ranks the individual values, so it can't be computed from summary data (mean, SD, n). Enter the values, or use a t test.`,
      };
    }
    const a = { id: ga.id, title: ga.title };
    const b = { id: gb.id, title: gb.title };
    if (options.paired) {
      const paired = pairedGroups(table, ga.id, gb.id);
      if (paired.pairs.length < 1) {
        return {
          ok: false,
          reason: 'A Wilcoxon test needs at least one row with a value in both groups.',
        };
      }
      return {
        ok: true,
        request: {
          a,
          b,
          options,
          data: {
            kind: 'paired',
            a: paired.pairs.map((p) => p.a),
            b: paired.pairs.map((p) => p.b),
          },
          dropped: { a: null, b: null, rows: paired.droppedRows },
        },
      };
    }
    const empty = [ga, gb].find((g) => g.data.kind === 'raw' && g.data.values.length === 0);
    if (empty) {
      return {
        ok: false,
        reason: `Each group needs at least one value for a Mann-Whitney test; ${empty.title} has none.`,
      };
    }
    return {
      ok: true,
      request: {
        a,
        b,
        options,
        data: { kind: 'unpaired', a: ga.data.values, b: gb.data.values },
        dropped: { a: ga.data.dropped, b: gb.data.dropped, rows: null },
      },
    };
  },

  job(request): EngineJob {
    const { data, options } = request;
    return data.kind === 'paired'
      ? {
          code: `${code}\nbs_wilcoxon(a, b, pratt)`,
          inputs: { a: data.a, b: data.b, pratt: options.zeros === 'pratt' },
          packages: [],
        }
      : { code: `${code}\nbs_mann_whitney(a, b)`, inputs: { a: data.a, b: data.b }, packages: [] };
  },

  parse(value: Plain, request, warnings): RankTestResult {
    const r = object(value, 'rank test');
    const pTwo = need(r['p_two'], 'P');
    const pOne = need(r['p_one'], 'P');
    const common = {
      tails: request.options.tails,
      a: { ...request.a, median: need(r['median_a'], 'median') },
      b: { ...request.b, median: need(r['median_b'], 'median') },
      exact: flag(r['exact']),
      pTwo,
      pOne,
      p: request.options.tails === 'one' ? pOne : pTwo,
      hodgesLehmann: need(r['hodges_lehmann'], 'Hodges-Lehmann'),
      ci: {
        lower: need(r['ci_lower'], 'CI'),
        upper: need(r['ci_upper'], 'CI'),
        level: need(r['ci_level'], 'CI level'),
      },
      dropped: request.dropped,
      warnings: [...warnings],
    };
    if (request.data.kind === 'paired') {
      const pr = num(r['pairing_r']);
      const pp = num(r['pairing_p']);
      return {
        ...common,
        test: 'wilcoxon',
        zeros: request.options.zeros,
        w: need(r['w'], 'W'),
        sumPositive: need(r['sum_positive'], 'sum of ranks'),
        sumNegative: need(r['sum_negative'], 'sum of ranks'),
        pairs: need(r['n_pairs'], 'pairs'),
        zeroPairs: need(r['n_zero'], 'zero pairs'),
        medianDifference: need(r['median_difference'], 'median'),
        pairing: pr === null || pp === null ? null : { r: pr, p: pp },
      };
    }
    return {
      ...common,
      test: 'mann-whitney',
      u: need(r['u'], 'U'),
      nA: need(r['n_a'], 'n'),
      nB: need(r['n_b'], 'n'),
      rankSumA: need(r['rank_sum_a'], 'sum of ranks'),
      rankSumB: need(r['rank_sum_b'], 'sum of ranks'),
      meanRankA: need(r['mean_rank_a'], 'mean rank'),
      meanRankB: need(r['mean_rank_b'], 'mean rank'),
      difference: need(r['difference'], 'difference'),
    };
  },
};
