/** What the notebook's buttons do (item 08), kept out of the components. */
import { gives } from '@/analyses/pairwise';
import { newId } from '@/model/ids';
import {
  GRAPH_DEFAULTS,
  GROUPED_DEFAULT,
  NESTED_DEFAULT,
  type Project,
  XY_DEFAULT,
} from '@/model/project';
import type { Table } from '@/model/table';

import { analytics } from '../analytics';
import { ROW_H } from '../grid/DataGrid';
import { store } from '../state/store';

/** Rows the grid's box shows: those entered and a few spare, within bounds (item 08). */
export function gridRows(table: Table): number {
  return Math.min(16, Math.max(8, table.rows.length + 3));
}

/** The grid box's height in px: two header rows, the rows, a scrollbar. */
export const gridHeight = (table: Table): number => 56 + gridRows(table) * ROW_H + 14;

/** Adds a graph of the table, with the brackets of its comparisons, and shows it. */
export function addGraph(project: Project, table: Table): void {
  const id = newId('g');
  // Brackets of the table's comparisons come along (notes 05, 06).
  const tests = [...project.analyses.values()]
    .filter((a) => gives(a) && a.input.kind === 'table' && a.input.table === table.id)
    .map((a) => a.id);
  store.edit(
    {
      op: 'addGraph',
      graph: {
        id,
        title: table.title,
        source: { kind: 'table', table: table.id },
        analyses: tests,
        ...GRAPH_DEFAULTS,
        ...(table.type === 'grouped'
          ? { plot: GROUPED_DEFAULT }
          : table.type === 'nested'
            ? { plot: NESTED_DEFAULT }
            : table.type === 'xy'
              ? { plot: XY_DEFAULT }
              : {}),
      },
    },
    { show: { kind: 'graph', id } },
  );
  analytics.trackOnce(
    'graph',
    table.type === 'grouped'
      ? 'new-grouped'
      : table.type === 'nested'
        ? 'new-nested'
        : table.type === 'xy'
          ? 'new-xy'
          : 'new-column',
  );
}
