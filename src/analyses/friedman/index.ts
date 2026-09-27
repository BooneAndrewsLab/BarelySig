/**
 * The Friedman test with Dunn's multiple comparisons (item 17, #50),
 * reported as Prism does: the nonparametric matched test for three or
 * more groups measured on the same rows.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { matchedGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, object } from '../values';
import code from './analysis.R?raw';
import type { FriedmanRequest, FriedmanResult } from './types';

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

export const friedman: AnalysisModule<'friedman', FriedmanRequest, FriedmanResult> = {
  kind: 'friedman',
  version: 1,
  code,

  prepare(analysis, project): Prepared<FriedmanRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'The Friedman test compares matched groups of a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this test reads no longer exists.' };
    if (table.type !== 'column')
      return { ok: false, reason: 'The Friedman test compares the groups of a Column table.' };
    const ids = analysis.input.dataSets;
    if (ids.length < 3) {
      return {
        ok: false,
        reason:
          'The Friedman test compares three or more matched groups; for two, use the Wilcoxon test.',
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
    if (table.format.kind === 'summary') {
      return {
        ok: false,
        reason:
          'The Friedman test needs the individual values, not summary data (mean, SD, n): ranking and pairing by row both need every value.',
      };
    }
    const groups = ids.map((id) => {
      const ds = table.dataSets.find((d) => d.id === id);
      return { id, title: ds?.title ?? id };
    });
    const matched = matchedGroups(table, ids);
    if (matched.rows.length < 2) {
      return {
        ok: false,
        reason: `The Friedman test needs at least two rows with a value in every group; there ${matched.rows.length === 1 ? 'is 1' : `are ${String(matched.rows.length)}`}.`,
      };
    }
    return {
      ok: true,
      request: {
        groups,
        options,
        rows: matched.rows.map((r) => r.values),
        control,
        droppedRows: matched.droppedRows,
      },
    };
  },

  job(request): EngineJob {
    const { options, rows, groups } = request;
    return {
      code: `${code}\nbs_friedman(y, n, k, comps, control, corrected)`,
      inputs: {
        y: rows.flatMap((r) => r),
        n: rows.length,
        k: groups.length,
        comps: options.comparisons.kind,
        control: (request.control ?? 0) + 1,
        corrected: options.corrected,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): FriedmanResult {
    const r = object(value, 'Friedman test');
    const named = request.groups;
    const group = (i: Plain | undefined) => {
      const g = named[need(i, 'group') - 1];
      if (!g) throw new Error('Friedman test: comparison of an unknown group');
      return g;
    };
    return {
      groups: list(r['groups']).map((v, i) => {
        const g = object(v, 'group');
        const n = named[i];
        if (!n) throw new Error('Friedman test: more groups than asked for');
        return {
          ...n,
          rankSum: need(g['rank_sum'], 'sum of ranks'),
          meanRank: need(g['mean_rank'], 'mean rank'),
        };
      }),
      n: need(r['n'], 'n'),
      droppedRows: request.droppedRows,
      statistic: need(r['statistic'], 'Friedman statistic'),
      df: need(r['df'], 'df'),
      p: need(r['p'], 'P'),
      comparisons: request.options.comparisons,
      corrected: request.options.corrected,
      pairs: list(r['comparisons']).map((v) => {
        const c = object(v, 'comparison');
        return {
          a: group(c['i']),
          b: group(c['j']),
          diff: need(c['diff'], 'mean rank difference'),
          z: need(c['z'], 'z'),
          pUnadjusted: need(c['p_unadjusted'], 'P'),
          p: need(c['p'], 'P'),
        };
      }),
      warnings: [...warnings],
    };
  },
};
