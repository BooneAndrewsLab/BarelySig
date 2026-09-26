/**
 * A graph's statistics (note 07, #31): what its bars, error bars, boxes
 * and violins show, computed in R like every other number (note 05,
 * decision 3). An internal analysis: the results bridge adds one per
 * graph (`<graph>/summary`); it is never listed or saved as an analysis.
 */
import type { EngineInput, EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import type { Id } from '@/model/ids';
import { columnGroups, groupedCells } from '@/model/selectors';
import type { GroupedTable } from '@/model/table';

import { cellId } from '../pairwise';

import { descriptive } from '../descriptive';
import type { AnalysisModule } from '../module';
import { need, object, rString } from '../values';
import own from './analysis.R?raw';
import type { GraphSummaryRequest, GraphSummaryResult, Kde, SummaryCell } from './types';

/** R's vectors of one element arrive as a number. */
function numbers(v: Plain | undefined): number[] {
  if (typeof v === 'number') return [v];
  return Array.isArray(v) ? v.map((x) => need(x, 'value')) : [];
}

function kde(v: Plain | undefined): Kde | null {
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) return null;
  return { bw: need(v['bw'], 'bandwidth'), y: numbers(v['y']), density: numbers(v['density']) };
}

const code = `${descriptive.code}\n${own}`;

/** A Grouped table's cells, row by row, named `<row>/<data set>` (note 07). */
function cellsOf(table: GroupedTable, dataSets: readonly Id[]): GraphSummaryRequest['cells'] {
  const g = groupedCells(table, dataSets);
  return g.rows.flatMap((row, r) =>
    g.dataSets.flatMap((ds, d) => {
      const data = g.cells[r]?.[d];
      const rowTitle = row.title ?? `Row ${String(r + 1)}`;
      return data ? [{ id: cellId(row.id, ds.id), title: `${rowTitle}: ${ds.title}`, data }] : [];
    }),
  );
}

export const graphSummary: AnalysisModule<
  'graph-summary',
  GraphSummaryRequest,
  GraphSummaryResult
> = {
  kind: 'graph-summary',
  version: 1,
  code,

  prepare(analysis, project) {
    if (analysis.input.kind !== 'table') return { ok: false, reason: 'A graph plots a table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this graph plots no longer exists.' };
    if (table.type === 'nested') {
      return { ok: false, reason: 'Graphing a Nested table is not supported yet.' };
    }
    const cells =
      table.type === 'column'
        ? columnGroups(table, analysis.input.dataSets)
        : cellsOf(table, analysis.input.dataSets);
    const any = cells.some((g) =>
      g.data.kind === 'raw' ? g.data.values.length > 0 : g.data.mean !== null,
    );
    if (!any) return { ok: false, reason: 'There are no values to plot yet.' };
    return { ok: true, request: { cells, options: analysis.options } };
  },

  job(request): EngineJob {
    const { whiskers, kde: k } = request.options;
    const inputs: Record<string, EngineInput> = {};
    const w = whiskers === null ? 'NA' : rString(whiskers);
    const adjust = k === null ? 'NA' : String(k.adjust);
    const log = k?.log ? 'TRUE' : 'FALSE';
    const calls = request.cells.map((c, i) => {
      const v = `g${String(i + 1)}`;
      if (c.data.kind === 'raw') {
        inputs[v] = c.data.values;
        return `${v} = bs_graph_cell(${v}, ${w}, ${adjust}, ${log})`;
      }
      inputs[`${v}_mean`] = [c.data.mean];
      inputs[`${v}_sd`] = [c.data.sd];
      inputs[`${v}_n`] = [c.data.n];
      return `${v} = bs_describe_summary(${v}_mean, ${v}_sd, ${v}_n)`;
    });
    return { code: `${code}\nlist(${calls.join(', ')})`, inputs, packages: [] };
  },

  parse(value: Plain, request, warnings) {
    // The descriptive part reads exactly as descriptive statistics do.
    const described = descriptive.parse(
      value,
      { groups: request.cells.map((c) => ({ id: c.id, title: c.title, data: c.data })) },
      warnings,
    );
    const all = object(value, 'graph summary');
    const cells = described.groups.map((g, i): SummaryCell => {
      const r = object(all[`g${String(i + 1)}`] ?? null, 'cell');
      const w = r['whiskers'];
      const whiskers =
        w !== null && w !== undefined && typeof w === 'object' && !Array.isArray(w)
          ? {
              low: need(w['low'], 'whisker'),
              high: need(w['high'], 'whisker'),
              beyond: numbers(w['beyond']),
            }
          : null;
      return { ...g, whiskers, kde: kde(r['kde']) };
    });
    return { cells, warnings: [...warnings] };
  },
};
