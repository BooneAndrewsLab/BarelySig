/**
 * One-way ANOVA with multiple comparisons (item 06, #25), from values or
 * summary data, reported as Prism does.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import {
  type Comparisons,
  EQUAL_SD_ALL,
  EQUAL_SD_CONTROL,
  WELCH_ALL,
  WELCH_CONTROL,
} from '@/model/project';
import { columnGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, num, object, type PlainObject } from '../values';
import code from './analysis.R?raw';
import type { FTest, OneWayRequest, OneWayResult } from './types';

const TEST_NAME: Readonly<Record<string, string>> = {
  tukey: 'Tukey',
  bonferroni: 'Bonferroni',
  sidak: 'Šidák',
  dunnett: 'Dunnett',
  'games-howell': 'Games-Howell',
  'dunnett-t3': 'Dunnett T3',
  'tamhane-t2': 'Tamhane T2',
};

/** Whether a comparison test goes with the SD assumption; the reason if not. */
export function comparisonMismatch(welch: boolean, c: Comparisons): string | null {
  if (c.kind === 'none') return null;
  const ok: readonly string[] =
    c.kind === 'all'
      ? welch
        ? WELCH_ALL
        : EQUAL_SD_ALL
      : welch
        ? WELCH_CONTROL
        : EQUAL_SD_CONTROL;
  if (ok.includes(c.test)) return null;
  const name = TEST_NAME[c.test] ?? c.test;
  return welch
    ? `${name}’s test assumes the groups have the same SD; after Welch’s ANOVA choose Games-Howell, Dunnett T3 or Tamhane T2.`
    : `${name}’s test is for groups with different SDs; choose it with Welch’s ANOVA, or use Tukey, Dunnett, Šidák or Bonferroni.`;
}

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

function fTest(v: Plain | undefined, stat = 'statistic'): FTest | null {
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v;
  return {
    f: need(o[stat], 'F'),
    dfn: need(o['dfn'], 'DFn'),
    dfd: need(o['dfd'], 'DFd'),
    p: need(o['p'], 'P'),
  };
}

export const oneway: AnalysisModule<'one-way-anova', OneWayRequest, OneWayResult> = {
  kind: 'one-way-anova',
  version: 1,
  code,

  prepare(analysis, project): Prepared<OneWayRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'One-way ANOVA compares groups of a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this ANOVA reads no longer exists.' };
    if (table.type !== 'column') {
      return {
        ok: false,
        reason:
          'One-way ANOVA compares the groups of a Column table; use two-way ANOVA for Grouped tables.',
      };
    }
    const ids = analysis.input.dataSets;
    if (ids.length < 2) {
      return { ok: false, reason: 'One-way ANOVA compares at least two groups; choose more.' };
    }
    const mismatch = comparisonMismatch(options.welch, options.comparisons);
    if (mismatch) return { ok: false, reason: mismatch };
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
    const named = groups.map((g) => ({ id: g.id, title: g.title }));
    const base = { groups: named, options, control };
    const raw = groups.flatMap((g) => (g.data.kind === 'raw' ? [g.data] : []));
    if (raw.length === groups.length) {
      const empty = groups.find((g) => g.data.kind === 'raw' && g.data.values.length === 0);
      if (empty) {
        return {
          ok: false,
          reason: `Every group needs at least one value; ${empty.title} has none. Leave it out, or enter its values.`,
        };
      }
      return {
        ok: true,
        request: {
          ...base,
          data: { kind: 'values', groups: raw.map((d) => d.values) },
          dropped: raw.map((d) => d.dropped),
        },
      };
    }
    const summary = groups.flatMap((g) => (g.data.kind === 'summary' ? [g.data] : []));
    if (summary.length !== groups.length)
      return { ok: false, reason: 'Every group must be entered the same way.' };
    if (summary.some((s) => s.entered === 'mean-lower-upper' || s.n === null)) {
      return {
        ok: false,
        reason:
          'ANOVA from summary data needs n for each group. Change the data format to one with n.',
      };
    }
    const means: number[] = [];
    const sds: number[] = [];
    const ns: number[] = [];
    for (const [i, s] of summary.entries()) {
      if (s.mean === null || s.sd === null || s.n === null) {
        return {
          ok: false,
          reason: `Enter the mean, spread and n of every group; ${named[i]?.title ?? 'a group'} is incomplete.`,
        };
      }
      means.push(s.mean);
      sds.push(s.sd);
      ns.push(s.n);
    }
    return {
      ok: true,
      request: {
        ...base,
        data: { kind: 'summary', means, sds, ns },
        dropped: summary.map(() => null),
      },
    };
  },

  job(request): EngineJob {
    const { options, data } = request;
    const c = options.comparisons;
    const common = {
      welch: options.welch,
      comps: c.kind,
      control: (request.control ?? 0) + 1,
      test: c.kind === 'none' ? 'tukey' : c.test,
    };
    const args = 'welch, comps, control, test';
    if (data.kind === 'summary') {
      return {
        code: `${code}\nbs_oneway_summary(means, sds, ns, ${args})`,
        inputs: { means: data.means, sds: data.sds, ns: data.ns, ...common },
        packages: [],
      };
    }
    return {
      code: `${code}\nbs_oneway(y, g, k, ${args})`,
      inputs: {
        y: data.groups.flat(),
        g: data.groups.flatMap((xs, i) => xs.map(() => i + 1)),
        k: data.groups.length,
        ...common,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): OneWayResult {
    const r = object(value, 'one-way ANOVA');
    const named = request.groups;
    const groups = list(r['groups']).map((v, i) => {
      const g = object(v, 'group');
      const n = named[i];
      if (!n) throw new Error('one-way ANOVA: more groups than asked for');
      return {
        ...n,
        n: need(g['n'], 'n'),
        mean: need(g['mean'], 'mean'),
        sd: num(g['sd']),
        median: num(g['median']),
        dropped: request.dropped[i] ?? null,
      };
    });
    const bart = r['bartlett'];
    const bartlett =
      bart !== null && typeof bart === 'object' && !Array.isArray(bart)
        ? {
            statistic: need(bart['statistic'], 'Bartlett'),
            df: need(bart['df'], 'df'),
            p: need(bart['p'], 'P'),
          }
        : null;
    const group = (i: Plain | undefined) => {
      const g = named[need(i, 'group') - 1];
      if (!g) throw new Error('one-way ANOVA: comparison of an unknown group');
      return g;
    };
    const pairs = list(r['comparisons']).map((v) => {
      const c: PlainObject = object(v, 'comparison');
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
      from: request.data.kind === 'summary' ? 'summary' : 'values',
      welch: request.options.welch,
      groups,
      anova: {
        ssBetween: need(r['ss_between'], 'SS'),
        ssWithin: need(r['ss_within'], 'SS'),
        ssTotal: need(r['ss_total'], 'SS'),
        dfBetween: need(r['df_between'], 'DF'),
        dfWithin: need(r['df_within'], 'DF'),
        dfTotal: need(r['df_total'], 'DF'),
        msBetween: need(r['ms_between'], 'MS'),
        msWithin: need(r['ms_within'], 'MS'),
        f: need(r['f'], 'F'),
        p: need(r['p'], 'P'),
        rSquared: need(r['r_squared'], 'R squared'),
      },
      bartlett,
      brownForsythe: fTest(r['brown_forsythe_sd']),
      welchAnova: fTest(r['welch']),
      brownForsytheAnova: fTest(r['brown_forsythe']),
      comparisons: request.options.comparisons,
      pairs,
      warnings: [...warnings],
    };
  },
};
