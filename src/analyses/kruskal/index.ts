/**
 * Kruskal-Wallis test with Dunn's multiple comparisons (item 06, #26),
 * reported as Prism does.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { columnGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, object } from '../values';
import code from './analysis.R?raw';
import type { KruskalWallisRequest, KruskalWallisResult } from './types';

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

export const kruskal: AnalysisModule<'kruskal-wallis', KruskalWallisRequest, KruskalWallisResult> =
  {
    kind: 'kruskal-wallis',
    version: 1,
    code,

    prepare(analysis, project): Prepared<KruskalWallisRequest> {
      const { options } = analysis;
      if (analysis.input.kind !== 'table')
        return { ok: false, reason: 'The Kruskal-Wallis test compares groups of a data table.' };
      const table = project.tables.get(analysis.input.table);
      if (!table) return { ok: false, reason: 'The table this test reads no longer exists.' };
      if (table.type !== 'column')
        return {
          ok: false,
          reason: 'The Kruskal-Wallis test compares the groups of a Column table.',
        };
      const ids = analysis.input.dataSets;
      if (ids.length < 2) {
        return {
          ok: false,
          reason: 'The Kruskal-Wallis test compares at least two groups; choose more.',
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
      const groups = columnGroups(table, ids);
      const values: (readonly number[])[] = [];
      const dropped = [];
      for (const g of groups) {
        if (g.data.kind !== 'raw') {
          return {
            ok: false,
            reason:
              'The Kruskal-Wallis test ranks the individual values, so it can’t be computed from summary data (mean, SD, n). Enter the values, or use one-way ANOVA.',
          };
        }
        if (g.data.values.length === 0) {
          return {
            ok: false,
            reason: `Every group needs at least one value; ${g.title} has none. Leave it out, or enter its values.`,
          };
        }
        values.push(g.data.values);
        dropped.push(g.data.dropped);
      }
      return {
        ok: true,
        request: {
          groups: groups.map((g) => ({ id: g.id, title: g.title })),
          options,
          values,
          control,
          dropped,
        },
      };
    },

    job(request): EngineJob {
      const { options, values } = request;
      return {
        code: `${code}\nbs_kruskal(y, g, k, comps, control, corrected)`,
        inputs: {
          y: values.flat(),
          g: values.flatMap((xs, i) => xs.map(() => i + 1)),
          k: values.length,
          comps: options.comparisons.kind,
          control: (request.control ?? 0) + 1,
          corrected: options.corrected,
        },
        packages: [],
      };
    },

    parse(value: Plain, request, warnings): KruskalWallisResult {
      const r = object(value, 'Kruskal-Wallis');
      const named = request.groups;
      const group = (i: Plain | undefined) => {
        const g = named[need(i, 'group') - 1];
        if (!g) throw new Error('Kruskal-Wallis: comparison of an unknown group');
        return g;
      };
      return {
        groups: list(r['groups']).map((v, i) => {
          const g = object(v, 'group');
          const n = named[i];
          if (!n) throw new Error('Kruskal-Wallis: more groups than asked for');
          return {
            ...n,
            n: need(g['n'], 'n'),
            median: need(g['median'], 'median'),
            rankSum: need(g['rank_sum'], 'sum of ranks'),
            meanRank: need(g['mean_rank'], 'mean rank'),
            dropped: request.dropped[i] ?? null,
          };
        }),
        h: need(r['h'], 'H'),
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
