/**
 * Repeated-measures two-way ANOVA, both factors repeated (item 23, #84),
 * from a Grouped table's replicates.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { groupedFullyMatchedSubjects } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import type { Named } from '../ttest/types';
import { need, object } from '../values';
import code from './analysis.R?raw';
import type {
  RepeatedTwoWayBothError,
  RepeatedTwoWayBothRequest,
  RepeatedTwoWayBothResult,
  RepeatedTwoWayBothTerm,
} from './types';

function sumOnly(v: Plain | undefined, what: string): { ss: number; df: number } {
  const o = object(v ?? null, what);
  return { ss: need(o['ss'], 'SS'), df: need(o['df'], 'DF') };
}

function descriptive(v: Plain | undefined, what: string): RepeatedTwoWayBothTerm {
  const o = object(v ?? null, what);
  return {
    ss: need(o['ss'], 'SS'),
    df: need(o['df'], 'DF'),
    ms: need(o['ms'], 'MS'),
    f: null,
    p: null,
  };
}

function tested(v: Plain | undefined, what: string): RepeatedTwoWayBothTerm {
  const o = object(v ?? null, what);
  return {
    ss: need(o['ss'], 'SS'),
    df: need(o['df'], 'DF'),
    ms: need(o['ms'], 'MS'),
    f: need(o['f'], 'F'),
    p: need(o['p'], 'P'),
  };
}

function errorTerm(v: Plain | undefined, what: string): RepeatedTwoWayBothError {
  const o = object(v ?? null, what);
  return {
    ss: need(o['ss'], 'SS'),
    df: need(o['df'], 'DF'),
    ms: need(o['ms'], 'MS'),
    ggEpsilon: need(o['gg_epsilon'], 'epsilon'),
    hfEpsilon: need(o['hf_epsilon'], 'epsilon'),
    ggP: need(o['gg_p'], 'P'),
    hfP: need(o['hf_p'], 'P'),
  };
}

export const repeatedTwowayBoth: AnalysisModule<
  'repeated-two-way-anova-both',
  RepeatedTwoWayBothRequest,
  RepeatedTwoWayBothResult
> = {
  kind: 'repeated-two-way-anova-both',
  version: 1,
  code,

  prepare(analysis, project): Prepared<RepeatedTwoWayBothRequest> {
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
      matched = groupedFullyMatchedSubjects(table, ids);
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    if (matched.subjects.length < 2) {
      return {
        ok: false,
        reason:
          'Repeated-measures two-way ANOVA needs at least two complete subjects (a value at every row × data-set combination).',
      };
    }
    const rows: Named[] = matched.rows.map((r, i) => ({
      id: r.id,
      title: r.title !== null && r.title !== '' ? r.title : `Row ${String(i + 1)}`,
    }));
    const columns: Named[] = matched.dataSets.map((d) => ({ id: d.id, title: d.title }));
    return {
      ok: true,
      request: {
        rows,
        columns,
        options,
        subjects: matched.subjects,
        droppedSubjects: matched.droppedSubjects,
      },
    };
  },

  job(request): EngineJob {
    const { subjects, rows, columns } = request;
    return {
      code: `${code}\nbs_repeated_twoway_both(y, n, p, q)`,
      inputs: {
        y: subjects.flatMap((s) => s.values),
        n: subjects.length,
        p: rows.length,
        q: columns.length,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): RepeatedTwoWayBothResult {
    const r = object(value, 'repeated-measures two-way ANOVA');
    return {
      rows: request.rows,
      columns: request.columns,
      options: request.options,
      rowLevels: need(r['p'], 'p'),
      columnLevels: need(r['q'], 'q'),
      n: need(r['n'], 'n'),
      droppedSubjects: request.droppedSubjects,
      subjects: descriptive(r['subjects'], 'subjects'),
      row: tested(r['row'], 'row factor'),
      rowError: errorTerm(r['row_error'], 'row error'),
      column: tested(r['column'], 'column factor'),
      columnError: errorTerm(r['column_error'], 'column error'),
      interaction: tested(r['interaction'], 'interaction'),
      interactionError: errorTerm(r['interaction_error'], 'interaction error'),
      total: sumOnly(r['total'], 'total'),
      warnings: [...warnings],
    };
  },
};
