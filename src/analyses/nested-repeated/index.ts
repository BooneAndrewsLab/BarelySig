/**
 * Matched nested one-way ANOVA (note 21, #71): three or more groups of a
 * Nested table whose replicate n is the same experiment in every group.
 * No new statistics: `prepare()` matches replicates by position exactly as
 * the matched nested t test does (note 14's `matchedPairs`, generalized
 * past two groups), reduces each matched replicate to its per-group means,
 * and hands those rows to `bs_repeated` (`repeated/analysis.R`, reused via
 * the same raw-source concatenation `repeated/index.ts` uses for
 * `oneway`'s comparisons code).
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { type NestedGroup, nestedGroups } from '@/model/selectors';
import type { NestedTable } from '@/model/table';

import type { AnalysisModule, Prepared } from '../module';
import onewayCode from '../oneway/analysis.R?raw';
import repeatedCode from '../repeated/analysis.R?raw';
import { need, object } from '../values';
import type { NestedRepeatedRequest, NestedRepeatedResult } from './types';

const code = `${onewayCode}\n${repeatedCode}`;

const mean = (values: readonly number[]) => values.reduce((s, v) => s + v, 0) / values.length;

/**
 * Replicates matched by position across every group (note 14's
 * `matchedPairs`, generalized): a replicate with a usable value in every
 * group becomes one row of group means; one with a value in some groups
 * but not all is left out of every group and named ("unmatched" -- a real
 * loss, worth telling the user, unlike an empty replicate); one with no
 * usable value anywhere is dropped and just counted.
 */
function matchedRows(
  table: NestedTable,
  groups: readonly NestedGroup[],
): {
  readonly rows: (readonly number[])[];
  readonly unmatched: string[];
  readonly dropped: number;
} {
  const count = Math.max(0, ...groups.map((g) => g.replicates.length));
  const rows: (readonly number[])[] = [];
  const unmatched: string[] = [];
  let dropped = 0;
  for (let i = 0; i < count; i += 1) {
    const replicates = groups.map((g) => g.replicates[i]);
    const present = replicates.filter((r) => (r?.values.length ?? 0) > 0);
    if (present.length === 0) {
      dropped += 1;
    } else if (present.length < replicates.length) {
      unmatched.push(table.replicateTitles?.[i] ?? `Replicate ${String(i + 1)}`);
    } else {
      rows.push(replicates.map((r) => mean(r?.values ?? [])));
    }
  }
  return { rows, unmatched, dropped };
}

export const nestedRepeated: AnalysisModule<
  'nested-repeated-anova',
  NestedRepeatedRequest,
  NestedRepeatedResult
> = {
  kind: 'nested-repeated-anova',
  version: 1,
  code,

  prepare(analysis, project): Prepared<NestedRepeatedRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return {
        ok: false,
        reason: 'Matched nested one-way ANOVA compares matched groups of a Nested table.',
      };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this ANOVA reads no longer exists.' };
    if (table.type !== 'nested') {
      return {
        ok: false,
        reason: 'Matched nested one-way ANOVA compares matched groups of a Nested table.',
      };
    }
    const ids = analysis.input.dataSets;
    if (ids.length < 3) {
      return {
        ok: false,
        reason:
          ids.length < 2
            ? 'Matched nested one-way ANOVA compares three or more groups; choose more.'
            : 'Matched nested one-way ANOVA compares three or more groups; with two, use the matched nested t test.',
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
    const m = matchedRows(table, groups);
    if (m.rows.length < 2) {
      const left = m.unmatched.length
        ? ` (${m.unmatched.join(', ')} ${m.unmatched.length === 1 ? 'has' : 'have'} values in some groups only)`
        : '';
      return {
        ok: false,
        reason: `Matched nested one-way ANOVA needs at least two replicates with values in every group; there ${m.rows.length === 1 ? 'is' : 'are'} ${String(m.rows.length)}${left}.`,
      };
    }
    return {
      ok: true,
      request: {
        groups: named,
        options,
        rows: m.rows,
        control,
        droppedReplicates: m.dropped,
        unmatched: m.unmatched,
      },
    };
  },

  job(request): EngineJob {
    const { options, rows, groups } = request;
    const c = options.comparisons;
    return {
      code: `${code}\nbs_repeated(y, n, k, comps, control, test)`,
      inputs: {
        y: rows.flatMap((r) => r),
        n: rows.length,
        k: groups.length,
        comps: c.kind,
        control: (request.control ?? 0) + 1,
        test: c.kind === 'none' ? 'tukey' : c.test,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): NestedRepeatedResult {
    const r = object(value, 'matched nested one-way ANOVA');
    const named = request.groups;
    const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);
    const groups = list(r['groups']).map((v, i) => {
      const g = object(v, 'group');
      const n = named[i];
      if (!n) throw new Error('matched nested one-way ANOVA: more groups than asked for');
      return { ...n, mean: need(g['mean'], 'mean') };
    });
    const group = (i: Plain | undefined) => {
      const g = named[need(i, 'group') - 1];
      if (!g) throw new Error('matched nested one-way ANOVA: comparison of an unknown group');
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
      n: need(r['n'], 'n'),
      droppedReplicates: request.droppedReplicates,
      unmatched: request.unmatched,
      anova: {
        ssTreatment: need(r['ss_treatment'], 'SS'),
        ssSubjects: need(r['ss_subjects'], 'SS'),
        ssResidual: need(r['ss_residual'], 'SS'),
        ssTotal: need(r['ss_total'], 'SS'),
        dfTreatment: need(r['df_treatment'], 'DF'),
        dfSubjects: need(r['df_subjects'], 'DF'),
        dfResidual: need(r['df_residual'], 'DF'),
        dfTotal: need(r['df_total'], 'DF'),
        msTreatment: need(r['ms_treatment'], 'MS'),
        msSubjects: need(r['ms_subjects'], 'MS'),
        msResidual: need(r['ms_residual'], 'MS'),
        f: need(r['f'], 'F'),
        p: need(r['p'], 'P'),
        rSquaredTreatment: need(r['r_squared_treatment'], 'R squared'),
        rSquaredSubjects: need(r['r_squared_subjects'], 'R squared'),
      },
      ggEpsilon: need(r['gg_epsilon'], 'epsilon'),
      hfEpsilon: need(r['hf_epsilon'], 'epsilon'),
      ggP: need(r['gg_p'], 'P'),
      hfP: need(r['hf_p'], 'P'),
      comparisons: request.options.comparisons,
      pairs,
      warnings: [...warnings],
    };
  },
};
