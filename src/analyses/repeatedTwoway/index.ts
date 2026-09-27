/**
 * Repeated-measures two-way ANOVA, one factor repeated (item 22, #81),
 * from a Grouped table's replicates, and its comparisons (item 24, #85).
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { groupedMatchedSubjects } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import onewayCode from '../oneway/analysis.R?raw';
import type { PairComparison } from '../oneway/types';
import type { Named } from '../ttest/types';
import { need, num, object } from '../values';
import ownCode from './analysis.R?raw';
import type { RepeatedTwoWayRequest, RepeatedTwoWayResult, RepeatedTwoWayTerm } from './types';

/** The one-way code carries the comparison tests (`bs_comparisons`) this file uses. */
const code = `${onewayCode}\n${ownCode}`;

function plain(v: Plain | undefined, what: string): { ss: number; df: number; ms: number } {
  const o = object(v ?? null, what);
  return { ss: need(o['ss'], 'SS'), df: need(o['df'], 'DF'), ms: need(o['ms'], 'MS') };
}

function sumOnly(v: Plain | undefined, what: string): { ss: number; df: number } {
  const o = object(v ?? null, what);
  return { ss: need(o['ss'], 'SS'), df: need(o['df'], 'DF') };
}

function descriptive(v: Plain | undefined, what: string): RepeatedTwoWayTerm {
  return { ...plain(v, what), f: null, p: null };
}

function tested(v: Plain | undefined, what: string): RepeatedTwoWayTerm {
  const o = object(v ?? null, what);
  return {
    ss: need(o['ss'], 'SS'),
    df: need(o['df'], 'DF'),
    ms: need(o['ms'], 'MS'),
    f: need(o['f'], 'F'),
    p: need(o['p'], 'P'),
  };
}

export const repeatedTwoway: AnalysisModule<
  'repeated-two-way-anova',
  RepeatedTwoWayRequest,
  RepeatedTwoWayResult
> = {
  kind: 'repeated-two-way-anova',
  version: 1,
  code,

  prepare(analysis, project): Prepared<RepeatedTwoWayRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'Repeated-measures two-way ANOVA analyses a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this ANOVA reads no longer exists.' };
    if (table.type !== 'grouped') {
      return {
        ok: false,
        reason:
          'Repeated-measures two-way ANOVA needs a Grouped table (rows are one factor, data sets the other).',
      };
    }
    const ids = analysis.input.dataSets;
    if (ids.length < 2) {
      return {
        ok: false,
        reason: 'Repeated-measures two-way ANOVA needs at least two data sets; choose more.',
      };
    }
    if (table.format.kind === 'summary') {
      return {
        ok: false,
        reason:
          'Repeated-measures two-way ANOVA needs the individual values, not summary data (mean, SD, n): matching by subcolumn needs every value.',
      };
    }
    if (table.rows.length < 2) {
      return {
        ok: false,
        reason: 'Repeated-measures two-way ANOVA needs at least two rows (the second factor).',
      };
    }
    let matched;
    try {
      matched = groupedMatchedSubjects(table, ids, options.repeatedFactor);
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    const rows: Named[] = matched.rows.map((r, i) => ({
      id: r.id,
      title: r.title !== null && r.title !== '' ? r.title : `Row ${String(i + 1)}`,
    }));
    const columns: Named[] = matched.dataSets.map((d) => ({ id: d.id, title: d.title }));
    const betweenCount = options.repeatedFactor === 'column' ? rows.length : columns.length;
    const usedLevels = new Set(matched.subjects.map((s) => s.level));
    if (usedLevels.size < betweenCount) {
      return {
        ok: false,
        reason:
          options.repeatedFactor === 'column'
            ? 'Every row needs at least one complete subject (a value in every data set).'
            : 'Every data set needs at least one complete subject (a value in every row).',
      };
    }
    if (matched.subjects.length < betweenCount + 1) {
      return {
        ok: false,
        reason:
          'Repeated-measures two-way ANOVA needs more complete subjects than levels of the between-subjects factor.',
      };
    }
    // Whichever levels the chosen family compares (note 24): between-subjects
    // levels for `main-between`/`simple`, repeated levels for `main-repeated`.
    const betweenNamed = options.repeatedFactor === 'column' ? rows : columns;
    const repeatedNamed = options.repeatedFactor === 'column' ? columns : rows;
    const c = options.comparisons;
    let control: number | null = null;
    if (c.kind === 'control') {
      const controlNamed = options.family === 'main-repeated' ? repeatedNamed : betweenNamed;
      control = controlNamed.findIndex((n) => n.id === c.control);
      if (control < 0) {
        return {
          ok: false,
          reason: 'The control level isn’t among the levels compared. Choose it again.',
        };
      }
    }
    return {
      ok: true,
      request: {
        rows,
        columns,
        options,
        subjects: matched.subjects,
        droppedSubjects: matched.droppedSubjects,
        control,
      },
    };
  },

  job(request): EngineJob {
    const { subjects, options } = request;
    const p = options.repeatedFactor === 'column' ? request.rows.length : request.columns.length;
    const q = options.repeatedFactor === 'column' ? request.columns.length : request.rows.length;
    const c = options.comparisons;
    return {
      code: `${code}\nbs_repeated_twoway(y, level, n, p, q, family, comps, control, test)`,
      inputs: {
        y: subjects.flatMap((s) => s.values),
        level: subjects.map((s) => s.level + 1),
        n: subjects.length,
        p,
        q,
        family: options.family,
        comps: c.kind,
        control: (request.control ?? 0) + 1,
        test: c.kind === 'none' ? 'tukey' : c.test,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): RepeatedTwoWayResult {
    const r = object(value, 'repeated-measures two-way ANOVA');
    const { options } = request;
    // Whichever levels the chosen family compares (note 24): see `prepare` above.
    const betweenNamed = options.repeatedFactor === 'column' ? request.rows : request.columns;
    const repeatedNamed = options.repeatedFactor === 'column' ? request.columns : request.rows;
    const comparedNamed = options.family === 'main-repeated' ? repeatedNamed : betweenNamed;
    const group = (i: Plain | undefined): Named => {
      const g = comparedNamed[need(i, 'group') - 1];
      if (!g) throw new Error('repeated-measures two-way ANOVA: comparison of an unknown level');
      return g;
    };
    const families = (Array.isArray(r['families']) ? r['families'] : []).map((v) => {
      const f = object(v, 'family');
      const level = num(f['level']);
      const lvl = level !== null ? (repeatedNamed[level - 1] ?? null) : null;
      const pairs: PairComparison[] = (Array.isArray(f['pairs']) ? f['pairs'] : []).map((pv) => {
        const c = object(pv, 'comparison');
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
      return { label: lvl?.title ?? null, level: lvl, pairs };
    });
    return {
      rows: request.rows,
      columns: request.columns,
      options: request.options,
      families,
      betweenLevels: need(r['p'], 'p'),
      repeatedLevels: need(r['q'], 'q'),
      n: need(r['n'], 'n'),
      droppedSubjects: request.droppedSubjects,
      between: tested(r['between'], 'between-subjects factor'),
      subjects: descriptive(r['subjects'], 'subjects'),
      repeated: tested(r['repeated'], 'repeated factor'),
      interaction: tested(r['interaction'], 'interaction'),
      residual: plain(r['residual'], 'residual'),
      total: sumOnly(r['total'], 'total'),
      ggEpsilon: need(r['gg_epsilon'], 'epsilon'),
      hfEpsilon: need(r['hf_epsilon'], 'epsilon'),
      repeatedGgP: need(r['repeated_gg_p'], 'P'),
      repeatedHfP: need(r['repeated_hf_p'], 'P'),
      interactionGgP: need(r['interaction_gg_p'], 'P'),
      interactionHfP: need(r['interaction_hf_p'], 'P'),
      warnings: [...warnings],
    };
  },
};
