/** Helpers behind the table dialogs and the navigator (item 03). */
import { downstreamOf } from '@/model/deps';
import type { Id } from '@/model/ids';
import type { Project } from '@/model/project';
import {
  type EntryFormat,
  type SummaryStats,
  type Table,
  type TableType,
  createColumnTable,
  createGroupedTable,
} from '@/model/table';

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** What deleting a table takes with it, in words: "with 2 analyses and 1 graph". */
export function deletionNote(project: Project, table: Id): string {
  const down = [...downstreamOf(project, table)];
  const analyses = down.filter((id) => project.analyses.has(id)).length;
  const graphs = down.filter((id) => project.graphs.has(id)).length;
  const parts = [
    ...(analyses ? [plural(analyses, 'analysis', 'analyses')] : []),
    ...(graphs ? [plural(graphs, 'graph', 'graphs')] : []),
  ];
  return parts.length ? ` with ${parts.join(' and ')}` : '';
}

export type Entry = 'raw' | SummaryStats;

export function buildTable(
  type: TableType,
  title: string,
  entry: Entry,
  replicates: number,
): Table {
  const format: EntryFormat =
    entry === 'raw'
      ? { kind: 'replicates', count: type === 'column' ? 1 : replicates }
      : { kind: 'summary', stats: entry };
  return type === 'column'
    ? createColumnTable({ title, groups: [], format })
    : createGroupedTable({ title, rowTitles: [], groups: [], format });
}
