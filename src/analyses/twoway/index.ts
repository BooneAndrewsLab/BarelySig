/**
 * Two-way ANOVA with multiple comparisons (item 06, #27), from a Grouped
 * table's replicates, or its summary data when balanced; reported as
 * Prism does.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { EQUAL_SD_ALL, EQUAL_SD_CONTROL } from '@/model/project';
import { groupedCells } from '@/model/selectors';

import type { AnalysisModule, Prepared } from '../module';
import onewayCode from '../oneway/analysis.R?raw';
import type { PairComparison } from '../oneway/types';
import type { Named } from '../ttest/types';
import { need, num, object } from '../values';
import twowayCode from './analysis.R?raw';
import type { TwoWayRequest, TwoWayResult, TwoWayTerm } from './types';

/** The one-way code carries the comparison tests the two-way code uses. */
const code = `${onewayCode}\n${twowayCode}`;

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

function term(v: Plain | undefined, what: string): TwoWayTerm {
  const o = object(v ?? null, what);
  return {
    ss: need(o['ss'], 'SS'),
    df: need(o['df'], 'DF'),
    ms: need(o['ms'], 'MS'),
    f: need(o['f'], 'F'),
    p: need(o['p'], 'P'),
    percent: need(o['percent'], '% of total variation'),
  };
}

const isObject = (v: Plain | undefined): boolean =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

export const twoway: AnalysisModule<'two-way-anova', TwoWayRequest, TwoWayResult> = {
  kind: 'two-way-anova',
  version: 1,
  code,

  prepare(analysis, project): Prepared<TwoWayRequest> {
    const { options } = analysis;
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'Two-way ANOVA analyses a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this ANOVA reads no longer exists.' };
    if (table.type !== 'grouped') {
      return {
        ok: false,
        reason:
          'Two-way ANOVA needs a Grouped table (rows are one factor, data sets the other); use one-way ANOVA for a Column table.',
      };
    }
    const ids = analysis.input.dataSets;
    if (ids.length < 2) {
      return { ok: false, reason: 'Two-way ANOVA needs at least two data sets; choose more.' };
    }
    const grid = groupedCells(table, ids);
    const has = (d: (typeof grid.cells)[number][number]) =>
      d.kind === 'raw' ? d.values.length > 0 : d.mean !== null;
    const keptRows = grid.rows.flatMap((r, i) => {
      const cells = grid.cells[i] ?? [];
      return cells.some(has) ? [{ row: r, cells }] : [];
    });
    const rows: Named[] = keptRows.map(({ row }, i) => ({
      id: row.id,
      title: row.title !== null && row.title !== '' ? row.title : `Row ${String(i + 1)}`,
    }));
    const columns: Named[] = grid.dataSets.map((d) => ({ id: d.id, title: d.title }));
    if (rows.length < 2) {
      return {
        ok: false,
        reason: 'Two-way ANOVA needs at least two rows with values (the second factor).',
      };
    }
    const emptyColumn = columns.find(
      (_, c) =>
        !keptRows.some(({ cells }) => {
          const d = cells[c];
          return d !== undefined && has(d);
        }),
    );
    if (emptyColumn) {
      return {
        ok: false,
        reason: `Every data set needs values; ${emptyColumn.title} has none. Leave it out, or enter its values.`,
      };
    }

    const c = options.comparisons;
    if (c.kind !== 'none') {
      const ok: readonly string[] = c.kind === 'all' ? EQUAL_SD_ALL : EQUAL_SD_CONTROL;
      if (!ok.includes(c.test)) {
        return {
          ok: false,
          reason:
            'Two-way ANOVA assumes the same SD in every cell; choose Tukey, Dunnett, Šidák or Bonferroni.',
        };
      }
    }
    let control: number | null = null;
    if (c.kind === 'control') {
      if (options.family === 'all-cells') {
        return {
          ok: false,
          reason: 'Comparing every cell has no control; compare every pair instead.',
        };
      }
      const byColumn = options.family === 'within-rows' || options.family === 'main-columns';
      control = (byColumn ? columns : rows).findIndex((x) => x.id === c.control);
      if (control < 0) {
        return {
          ok: false,
          reason: `The control ${byColumn ? 'data set' : 'row'} isn’t among those analysed. Choose it again.`,
        };
      }
    }
    const base = {
      rows,
      columns,
      options,
      control,
      emptyRows: grid.rows.length - rows.length,
    };

    if (table.format.kind === 'summary') {
      const means: number[] = [];
      const sds: number[] = [];
      const ns: number[] = [];
      const ri: number[] = [];
      const ci: number[] = [];
      for (const [r, { cells }] of keptRows.entries()) {
        for (const [col, d] of cells.entries()) {
          if (d.kind !== 'summary') continue;
          if (d.entered === 'mean-lower-upper' || d.n === null) {
            return {
              ok: false,
              reason:
                'Two-way ANOVA from summary data needs n for each cell. Change the data format to one with n.',
            };
          }
          if (d.mean === null || d.sd === null) {
            return {
              ok: false,
              reason: `Enter the mean, spread and n of every cell; ${rows[r]?.title ?? 'a row'}, ${columns[col]?.title ?? 'a data set'} is incomplete.`,
            };
          }
          means.push(d.mean);
          sds.push(d.sd);
          ns.push(d.n);
          ri.push(r + 1);
          ci.push(col + 1);
        }
      }
      if (new Set(ns).size > 1) {
        return {
          ok: false,
          reason:
            'From summary data, two-way ANOVA needs the same n in every cell (Prism uses an approximate method otherwise, which BarelySig doesn’t yet). Enter the values instead.',
        };
      }
      return {
        ok: true,
        request: { ...base, data: { kind: 'summary', means, sds, ns, ri, ci }, droppedValues: 0 },
      };
    }

    const y: number[] = [];
    const ri: number[] = [];
    const ci: number[] = [];
    let dropped = 0;
    for (const [r, { cells }] of keptRows.entries()) {
      for (const [col, d] of cells.entries()) {
        if (d.kind !== 'raw') continue;
        dropped += d.dropped.empty + d.dropped.excluded;
        for (const v of d.values) {
          y.push(v);
          ri.push(r + 1);
          ci.push(col + 1);
        }
      }
    }
    return {
      ok: true,
      request: { ...base, data: { kind: 'values', y, ri, ci }, droppedValues: dropped },
    };
  },

  job(request): EngineJob {
    const { options, data } = request;
    const c = options.comparisons;
    const common = {
      R: request.rows.length,
      C: request.columns.length,
      family: options.family,
      comps: c.kind,
      control: (request.control ?? 0) + 1,
      test: c.kind === 'none' ? 'tukey' : c.test,
    };
    const args = 'ri, ci, R, C, family, comps, control, test';
    return data.kind === 'summary'
      ? {
          code: `${code}\nbs_twoway_summary(means, sds, ns, ${args})`,
          inputs: {
            means: data.means,
            sds: data.sds,
            ns: data.ns,
            ri: data.ri,
            ci: data.ci,
            ...common,
          },
          packages: [],
        }
      : {
          code: `${code}\nbs_twoway(y, ${args})`,
          inputs: { y: data.y, ri: data.ri, ci: data.ci, ...common },
          packages: [],
        };
  },

  parse(value: Plain, request, warnings): TwoWayResult {
    const r = object(value, 'two-way ANOVA');
    const { rows, columns, options } = request;
    const cellName = (i: number): Named => {
      const row = rows[Math.floor(i / columns.length)];
      const col = columns[i % columns.length];
      if (!row || !col) throw new Error('two-way ANOVA: comparison of an unknown cell');
      return { id: `${row.id}/${col.id}`, title: `${row.title}: ${col.title}` };
    };
    const byFamily = new Map<number, PairComparison[]>();
    for (const v of list(r['comparisons'])) {
      const x = object(v, 'comparison');
      const fam = need(x['family'], 'family');
      const i = need(x['i'], 'i') - 1;
      const j = need(x['j'], 'j') - 1;
      const levels =
        options.family === 'within-rows' || options.family === 'main-columns' ? columns : rows;
      const pick = (k: number): Named => {
        if (options.family === 'all-cells') return cellName(k);
        const g = levels[k];
        if (!g) throw new Error('two-way ANOVA: comparison of an unknown level');
        return g;
      };
      const pair: PairComparison = {
        a: pick(i),
        b: pick(j),
        diff: need(x['diff'], 'difference'),
        se: need(x['se'], 'SE'),
        df: need(x['df'], 'DF'),
        statistic: need(x['statistic'], 'statistic'),
        ciLower: need(x['ci_lower'], 'CI'),
        ciUpper: need(x['ci_upper'], 'CI'),
        p: need(x['p'], 'P'),
      };
      byFamily.set(fam, [...(byFamily.get(fam) ?? []), pair]);
    }
    const familyLabel = (f: number): string | null =>
      options.family === 'within-rows'
        ? (rows[f - 1]?.title ?? null)
        : options.family === 'within-columns'
          ? (columns[f - 1]?.title ?? null)
          : null;
    const note = r['comparisons_note'];
    const why = r['why'];
    return {
      from: request.data.kind === 'summary' ? 'summary' : 'values',
      model: r['model'] === 'full' ? 'full' : 'main-effects',
      why: why === 'empty-cell' || why === 'no-replicates' ? why : null,
      rows,
      columns,
      nTotal: need(r['n_total'], 'n'),
      interaction: isObject(r['interaction']) ? term(r['interaction'], 'interaction') : null,
      row: term(r['row'], 'row factor'),
      column: term(r['column'], 'column factor'),
      residual: (() => {
        const o = object(r['residual'] ?? null, 'residual');
        return { ss: need(o['ss'], 'SS'), df: need(o['df'], 'DF'), ms: need(o['ms'], 'MS') };
      })(),
      total: (() => {
        const o = object(r['total'] ?? null, 'total');
        return { ss: need(o['ss'], 'SS'), df: need(o['df'], 'DF') };
      })(),
      cells: list(r['cells']).map((row) =>
        list(row).map((v) => {
          const o = object(v, 'cell');
          return { n: need(o['n'], 'n'), mean: num(o['mean']), sd: num(o['sd']) };
        }),
      ),
      options,
      families: [...byFamily.entries()]
        .sort(([a], [b]) => a - b)
        .map(([f, pairs]) => ({ label: familyLabel(f), pairs })),
      comparisonsNote: note === 'empty-cell' || note === 'no-replicates' ? note : null,
      emptyRows: request.emptyRows,
      droppedValues: request.droppedValues,
      warnings: [...warnings],
    };
  },
};
