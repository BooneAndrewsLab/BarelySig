/** Helpers behind the table dialogs and the navigator (item 03). */
import { downstreamOf } from '@/model/deps';
import type { Id } from '@/model/ids';
import type { AnalysisSpec, Project } from '@/model/project';
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

/** The dialog's choice for a format, and back. */
export function entryOf(format: EntryFormat): {
  readonly entry: Entry;
  readonly replicates: number;
} {
  return format.kind === 'summary'
    ? { entry: format.stats, replicates: 3 }
    : { entry: 'raw', replicates: format.count };
}

export function formatOf(type: TableType, entry: Entry, replicates: number): EntryFormat {
  return entry === 'raw'
    ? { kind: 'replicates', count: type === 'column' ? 1 : replicates }
    : { kind: 'summary', stats: entry };
}

const valuesIn = (table: Table): number =>
  table.dataSets.reduce(
    (n, d) => n + d.subcolumns.reduce((m, c) => m + c.filter((v) => v !== null).length, 0),
    0,
  );

/** How many values a format change would clear (they don't fit the new format). */
export function valuesLost(before: Table, after: Table): number {
  return Math.max(0, valuesIn(before) - valuesIn(after));
}

/** The name an analysis gets: "Unpaired t test of Viability". */
export function analysisTitle(spec: AnalysisSpec, table: string): string {
  if (spec.kind === 'descriptive') return `Descriptive statistics of ${table}`;
  const o = spec.options;
  const name = o.paired ? 'Paired t test' : o.welch ? 'Welch’s t test' : 'Unpaired t test';
  return `${name} of ${table}`;
}
