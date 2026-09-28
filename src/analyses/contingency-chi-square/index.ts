/**
 * Chi-square test of independence (item 28, #39): `chisq.test` on a
 * Contingency table's row × column counts, Prism's own default (Yates'
 * continuity correction, applied by R only to a 2×2 table). See design
 * note 28 for why this is its own module rather than sharing one with
 * Fisher's exact test.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { contingencyCells } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import { need, object } from '../values';
import code from './analysis.R?raw';
import type { ContingencyChiSquareResult, ContingencyRequest } from './types';

export const contingencyChiSquare: AnalysisModule<
  'contingency-chi-square',
  ContingencyRequest,
  ContingencyChiSquareResult
> = {
  kind: 'contingency-chi-square',
  version: 1,
  code,

  prepare(analysis, project): Prepared<ContingencyRequest> {
    if (analysis.input.kind !== 'table') {
      return { ok: false, reason: 'A chi-square test looks at a data table.' };
    }
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this test reads no longer exists.' };
    if (table.type !== 'contingency') {
      return { ok: false, reason: 'A chi-square test looks at the counts of a Contingency table.' };
    }
    const ids = analysis.input.dataSets;
    if (ids.length < 2) {
      return { ok: false, reason: 'A chi-square test needs at least two columns; choose more.' };
    }
    const { rows, columns, counts } = contingencyCells(table, ids);
    if (rows.length < 2) {
      return { ok: false, reason: 'A chi-square test needs at least two rows in the table.' };
    }
    const flat: number[] = [];
    for (const row of counts) {
      for (const c of row) {
        if (c === null) {
          return {
            ok: false,
            reason: 'Every cell needs a count before this test can run; fill in the empty ones.',
          };
        }
        if (!(Number.isInteger(c) && c >= 0)) {
          return {
            ok: false,
            reason:
              'Every cell must be a non-negative whole number: a count, not a fraction or a negative number.',
          };
        }
        flat.push(c);
      }
    }
    return {
      ok: true,
      request: {
        rows: rows.map((r) => ({ id: r.id, title: r.title ?? '' })),
        columns,
        counts: flat,
        nrow: rows.length,
        ncol: columns.length,
      },
    };
  },

  job(request): EngineJob {
    return {
      code: `${code}\nbs_contingency_chi_square(counts, nrow, ncol)`,
      inputs: { counts: [...request.counts], nrow: request.nrow, ncol: request.ncol },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): ContingencyChiSquareResult {
    const r = object(value, 'chi-square test');
    const counts = Array.from({ length: request.nrow }, (_, i) =>
      request.counts.slice(i * request.ncol, (i + 1) * request.ncol),
    );
    return {
      rows: request.rows,
      columns: request.columns,
      counts,
      n: need(r['n'], 'n'),
      chiSq: need(r['chi_sq'], 'chi-square'),
      df: need(r['df'], 'df'),
      p: need(r['p'], 'P'),
      corrected: r['corrected'] === true,
      lowExpected: r['low_expected'] === true,
      warnings: [...warnings],
    };
  },
};
