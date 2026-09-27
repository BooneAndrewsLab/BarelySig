/**
 * Repeated-measures one-way ANOVA with the Geisser-Greenhouse correction
 * (item 17, #50), reported as Prism does: a Column table paired by row.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { matchedGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import onewayCode from '../oneway/analysis.R?raw';
import { need, object } from '../values';
import ownCode from './analysis.R?raw';
import type { RepeatedMeasuresRequest, RepeatedMeasuresResult } from './types';

/** The one-way code carries the comparison tests (`bs_comparisons`) this file uses. */
const code = `${onewayCode}\n${ownCode}`;

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

export const repeatedMeasures: AnalysisModule<
  'repeated-measures-anova',
  RepeatedMeasuresRequest,
  RepeatedMeasuresResult
> = {
  kind: 'repeated-measures-anova',
  version: 1,
  code,

  prepare(analysis, project): Prepared<RepeatedMeasuresRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return {
        ok: false,
        reason: 'Repeated-measures ANOVA compares matched groups of a data table.',
      };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this test reads no longer exists.' };
    if (table.type !== 'column') {
      return {
        ok: false,
        reason: 'Repeated-measures ANOVA compares the groups of a Column table.',
      };
    }
    const ids = analysis.input.dataSets;
    if (ids.length < 2) {
      return {
        ok: false,
        reason: 'Repeated-measures ANOVA compares two or more matched groups.',
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
          'Repeated-measures ANOVA needs the individual values, not summary data (mean, SD, n): pairing by row needs every value.',
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
        reason: `Repeated-measures ANOVA needs at least two rows with a value in every group; there ${matched.rows.length === 1 ? 'is 1' : `are ${String(matched.rows.length)}`}.`,
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
    const c = options.comparisons;
    return {
      code: `${code}\nbs_repeated(y, n, k, comps, control, test, sphericity)`,
      inputs: {
        y: rows.flatMap((r) => r),
        n: rows.length,
        k: groups.length,
        comps: c.kind,
        control: (request.control ?? 0) + 1,
        test: c.kind === 'none' ? 'tukey' : c.test,
        sphericity: options.assumeSphericity,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): RepeatedMeasuresResult {
    const r = object(value, 'repeated-measures ANOVA');
    const named = request.groups;
    const groups = list(r['groups']).map((v, i) => {
      const g = object(v, 'group');
      const n = named[i];
      if (!n) throw new Error('repeated-measures ANOVA: more groups than asked for');
      return { ...n, mean: need(g['mean'], 'mean') };
    });
    const group = (i: Plain | undefined) => {
      const g = named[need(i, 'group') - 1];
      if (!g) throw new Error('repeated-measures ANOVA: comparison of an unknown group');
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
      droppedRows: request.droppedRows,
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
      assumeSphericity: request.options.assumeSphericity,
      pairs,
      warnings: [...warnings],
    };
  },
};
