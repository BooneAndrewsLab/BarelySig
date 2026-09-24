/**
 * t tests (item 04, #17): unpaired (Student or Welch), paired, and
 * unpaired from summary data, reported as Prism does.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { columnGroups, pairedGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, num, object } from '../values';
import code from './analysis.R?raw';
import type { TTestRequest, TTestResult } from './types';

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

export const ttest: AnalysisModule<'t-test', TTestRequest, TTestResult> = {
  kind: 't-test',
  version: 1,
  code,

  prepare(analysis, project): Prepared<TTestRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'A t test compares two groups of a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this t test reads no longer exists.' };
    if (table.type !== 'column') {
      return {
        ok: false,
        reason:
          'A t test compares two groups of a Column table; use two-way ANOVA for Grouped tables.',
      };
    }
    const ids = analysis.input.dataSets;
    if (ids.length !== 2) {
      return {
        ok: false,
        reason:
          ids.length < 2
            ? 'A t test compares two groups; choose two.'
            : `A t test compares two groups; this one has ${String(ids.length)}. Choose two, or use one-way ANOVA.`,
      };
    }
    const [ga, gb] = columnGroups(table, ids);
    if (!ga || !gb) return { ok: false, reason: 'Choose two groups.' };
    const a = { id: ga.id, title: ga.title };
    const b = { id: gb.id, title: gb.title };

    if (ga.data.kind === 'summary' && gb.data.kind === 'summary') {
      if (options.paired) {
        return {
          ok: false,
          reason:
            'A paired t test needs the individual values; summary data (mean, SD, n) can only be compared unpaired.',
        };
      }
      const sa = ga.data;
      const sb = gb.data;
      if (sa.entered === 'mean-lower-upper' || sa.n === null || sb.n === null) {
        return {
          ok: false,
          reason:
            'A t test from summary data needs n for each group. Change the data format to one with n.',
        };
      }
      if (sa.mean === null || sb.mean === null || sa.sd === null || sb.sd === null) {
        return { ok: false, reason: 'Enter the mean, spread and n of both groups.' };
      }
      return {
        ok: true,
        request: {
          a,
          b,
          options,
          data: {
            kind: 'summary',
            a: { mean: sa.mean, sd: sa.sd, n: sa.n },
            b: { mean: sb.mean, sd: sb.sd, n: sb.n },
          },
          dropped: { a: null, b: null, rows: null },
        },
      };
    }
    if (ga.data.kind !== 'raw' || gb.data.kind !== 'raw')
      return { ok: false, reason: 'Both groups must be entered the same way.' };

    if (options.paired) {
      const paired = pairedGroups(table, ga.id, gb.id);
      if (paired.pairs.length < 2) {
        return {
          ok: false,
          reason: `A paired t test needs at least two rows with a value in both groups; there ${paired.pairs.length === 1 ? 'is 1' : `are ${String(paired.pairs.length)}`}.`,
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
    const short = [ga, gb].find((g) => g.data.kind === 'raw' && g.data.values.length < 2);
    if (short?.data.kind === 'raw') {
      return {
        ok: false,
        reason: `Each group needs at least two values for a t test; ${short.title} has ${count(short.data.values.length, 'value', 'values')}.`,
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
    switch (data.kind) {
      case 'unpaired':
        return {
          code: `${code}\nbs_ttest_unpaired(a, b, welch)`,
          inputs: { a: data.a, b: data.b, welch: options.welch },
          packages: [],
        };
      case 'paired':
        return {
          code: `${code}\nbs_ttest_paired(a, b)`,
          inputs: { a: data.a, b: data.b },
          packages: [],
        };
      case 'summary':
        return {
          code: `${code}\nbs_ttest_summary(mean_a, sd_a, n_a, mean_b, sd_b, n_b, welch)`,
          inputs: {
            mean_a: [data.a.mean],
            sd_a: [data.a.sd],
            n_a: [data.a.n],
            mean_b: [data.b.mean],
            sd_b: [data.b.sd],
            n_b: [data.b.n],
            welch: options.welch,
          },
          packages: [],
        };
    }
  },

  parse(value: Plain, request, warnings): TTestResult {
    const r = object(value, 't test');
    const pTwo = need(r['p_two'], 'P');
    const pOne = pTwo / 2;
    const paired = request.data.kind === 'paired';
    const f = num(r['f']);
    const group = (k: 'a' | 'b') => ({
      ...request[k],
      n: need(paired ? r['n_pairs'] : r[`n_${k}`], 'n'),
      mean: need(r[`mean_${k}`], 'mean'),
      sd: paired ? null : num(r[`sd_${k}`]),
    });
    return {
      test: paired ? 'paired' : request.options.welch ? 'welch' : 'unpaired',
      tails: request.options.tails,
      from: request.data.kind === 'summary' ? 'summary' : 'values',
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
      rSquared: need(r['r_squared'], 'R squared'),
      fTest:
        paired || f === null
          ? null
          : {
              f,
              dfn: need(r['f_dfn'], 'DFn'),
              dfd: need(r['f_dfd'], 'DFd'),
              p: need(r['f_p'], 'F test P'),
            },
      pairing: paired
        ? {
            pairs: need(r['n_pairs'], 'pairs'),
            sdDifference: need(r['sd_difference'], 'SD'),
            r: num(r['pairing_r']),
            p: num(r['pairing_p']),
          }
        : null,
      dropped: request.dropped,
      warnings: [...warnings],
    };
  },
};
