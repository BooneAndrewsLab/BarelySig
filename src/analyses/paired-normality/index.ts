/**
 * Normality of a paired t test's differences (item 18, #53): D'Agostino-
 * Pearson omnibus K² and Shapiro-Wilk, run once on the row-by-row
 * differences rather than on each group (`normality`'s assumption is about
 * the groups; a paired t test's is about the differences within each
 * row). Reuses `normality`'s R code (`bs_normality_one`) and its
 * `TestOutcome` shape directly.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { pairedGroups } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import normalityCode from '../normality/analysis.R?raw';
import type { TestOutcome } from '../normality/types';
import { need, object, num, type PlainObject } from '../values';
import code from './analysis.R?raw';
import type { PairedNormalityRequest, PairedNormalityResult } from './types';

const fullCode = `${normalityCode}\n${code}`;

function outcome<T>(o: PlainObject, ran: (o: PlainObject) => T): TestOutcome<T> {
  const why = o['why'];
  if (why === 'few' || why === 'many' || why === 'same') {
    return { ran: false, why, limit: num(o['minimum']) ?? num(o['maximum']) };
  }
  return { ran: true, ...ran(o) };
}

export const pairedNormality: AnalysisModule<
  'paired-normality',
  PairedNormalityRequest,
  PairedNormalityResult
> = {
  kind: 'paired-normality',
  version: 1,
  code: fullCode,

  prepare(analysis, project): Prepared<PairedNormalityRequest> {
    if (analysis.input.kind !== 'table')
      return {
        ok: false,
        reason: 'A paired-differences normality test reads the two groups of a paired t test.',
      };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table these tests read no longer exists.' };
    if (table.type !== 'column')
      return { ok: false, reason: 'A paired-differences normality test needs a Column table.' };
    if (table.format.kind === 'summary') {
      return {
        ok: false,
        reason:
          'A paired-differences normality test looks at the individual values, so it can’t be run on summary data (mean, SD, n).',
      };
    }
    const ids = analysis.input.dataSets;
    if (ids.length !== 2) {
      return {
        ok: false,
        reason:
          ids.length < 2
            ? 'This test pairs two groups by row; choose two.'
            : `This test pairs two groups by row; this one has ${String(ids.length)}. Choose two.`,
      };
    }
    const [idA, idB] = ids;
    const ds = table.dataSets;
    const da = ds.find((d) => d.id === idA);
    const db = ds.find((d) => d.id === idB);
    if (!da || !db) return { ok: false, reason: 'Choose two groups.' };
    const a = { id: da.id, title: da.title };
    const b = { id: db.id, title: db.title };
    const paired = pairedGroups(table, da.id, db.id);
    if (paired.pairs.length < 2) {
      return {
        ok: false,
        reason: `This test needs at least two rows with a value in both groups; there ${paired.pairs.length === 1 ? 'is 1' : `are ${String(paired.pairs.length)}`}.`,
      };
    }
    return {
      ok: true,
      request: {
        a,
        b,
        differences: paired.pairs.map((p) => p.b - p.a),
        droppedRows: paired.droppedRows,
      },
    };
  },

  job(request): EngineJob {
    return {
      code: `${fullCode}\nbs_paired_normality(d)`,
      inputs: { d: request.differences },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): PairedNormalityResult {
    const r = object(value, 'paired-normality');
    return {
      a: request.a,
      b: request.b,
      n: need(r['n'], 'n'),
      droppedRows: request.droppedRows,
      shapiroWilk: outcome(object(r['shapiro_wilk'] ?? null, 'Shapiro-Wilk'), (o) => ({
        w: need(o['w'], 'W'),
        p: need(o['p'], 'P'),
      })),
      dagostino: outcome(object(r['dagostino'] ?? null, "D'Agostino"), (o) => ({
        k2: need(o['k2'], 'K2'),
        p: need(o['p'], 'P'),
        zSkewness: need(o['z_skewness'], 'skewness'),
        zKurtosis: need(o['z_kurtosis'], 'kurtosis'),
      })),
      warnings: [...warnings],
    };
  },
};
