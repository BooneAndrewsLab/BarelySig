/**
 * Typed data tables (item 02). Every table type has the same shape, the
 * one Prism's `.pzfx` uses: ordered rows, and data sets that each hold one
 * or more subcolumns of cells, one cell per row. A table-wide format says
 * what the subcolumns mean.
 *
 * Values are immutable: edits (`edits.ts`) return new tables that share
 * what did not change.
 */
import { type Id, newId } from './ids';
import type { Cell } from './missing';

export type { Cell } from './missing';

export interface Row {
  readonly id: Id;
  /** Row-factor level in a Grouped table; unused (null) in a Column table. */
  readonly title: string | null;
}

/** Names one cell of a data set: `${subcolumn}:${rowId}`. */
export type CellKey = `${number}:${string}`;

export const cellKey = (subcolumn: number, row: Id): CellKey => `${subcolumn}:${row}`;

export function parseCellKey(key: CellKey): { readonly subcolumn: number; readonly row: Id } {
  const at = key.indexOf(':');
  return { subcolumn: Number(key.slice(0, at)), row: key.slice(at + 1) as Id };
}

export interface DataSet {
  readonly id: Id;
  readonly title: string;
  /** Column-major: `subcolumns[s][r]` is row r of subcolumn s; each has `rows.length` cells. */
  readonly subcolumns: readonly (readonly Cell[])[];
  /**
   * Values kept in the table, shown struck through and left out of every
   * analysis and graph (Prism's "exclude"). Only cells holding a value can
   * be excluded; writing a cell clears its exclusion.
   */
  readonly excluded: ReadonlySet<CellKey>;
  /** Identity colour across all graphs; graphs may override. Unset = theme palette. */
  readonly color?: string;
  /** Digits shown in the grid; the stored value is never rounded. */
  readonly decimals?: number;
}

/**
 * Summary data entered instead of replicates. Without n, no test can run.
 * `mean-lower-upper` is a mean with the limits of an interval (e.g. a 95%
 * CI), as Prism's "Mean with upper/lower limits": for graphs only, since an
 * SD can't be recovered from it without guessing (note 03).
 */
export type SummaryStats =
  | 'mean-sd-n'
  | 'mean-sem-n'
  | 'mean-cv-n'
  | 'mean-sd'
  | 'mean-sem'
  | 'mean-cv'
  | 'mean-lower-upper';

export const SUMMARY_STATS: readonly SummaryStats[] = [
  'mean-sd-n',
  'mean-sem-n',
  'mean-cv-n',
  'mean-sd',
  'mean-sem',
  'mean-cv',
  'mean-lower-upper',
];

/** What the subcolumns of every data set in a table hold. */
export type EntryFormat =
  | { readonly kind: 'replicates'; readonly count: number }
  | { readonly kind: 'summary'; readonly stats: SummaryStats };

export type SummarySubcolumn = 'mean' | 'sd' | 'sem' | 'cv' | 'n' | 'lower' | 'upper';

const SUBCOLUMNS: Readonly<Record<SummaryStats, readonly SummarySubcolumn[]>> = {
  'mean-sd-n': ['mean', 'sd', 'n'],
  'mean-sem-n': ['mean', 'sem', 'n'],
  'mean-cv-n': ['mean', 'cv', 'n'],
  'mean-sd': ['mean', 'sd'],
  'mean-sem': ['mean', 'sem'],
  'mean-cv': ['mean', 'cv'],
  'mean-lower-upper': ['mean', 'lower', 'upper'],
};

/** The subcolumns of a summary format, in order. CV is a percentage. */
export const summarySubcolumns = (stats: SummaryStats): readonly SummarySubcolumn[] =>
  SUBCOLUMNS[stats];

export interface TableBase {
  readonly id: Id;
  readonly title: string;
  readonly rows: readonly Row[];
  readonly dataSets: readonly DataSet[];
  /** Default axis title for graphs of this table, e.g. "Expression"; graphs may override. */
  readonly valueTitle?: string;
  readonly unit?: string;
  readonly notes?: string;
}

/** Each data set a group, rows its replicates. Summary: one row. */
export interface ColumnTable extends TableBase {
  readonly type: 'column';
  readonly format: EntryFormat;
}

/** Rows the row-factor levels, data sets the column-factor levels, subcolumns the replicates. */
export interface GroupedTable extends TableBase {
  readonly type: 'grouped';
  readonly format: EntryFormat;
}

export type Table = ColumnTable | GroupedTable;
export type TableType = Table['type'];

/** How many subcolumns each data set has under a format. */
export function subcolumnCount(format: EntryFormat): number {
  return format.kind === 'replicates' ? format.count : summarySubcolumns(format.stats).length;
}

/** Column tables take one replicate subcolumn; replicates go down the rows. */
export const COLUMN_RAW: EntryFormat = { kind: 'replicates', count: 1 };

export const emptyColumn = (rows: number): Cell[] => Array.from({ length: rows }, () => null);

export function emptyDataSet(id: Id, title: string, rows: number, format: EntryFormat): DataSet {
  return {
    id,
    title,
    subcolumns: Array.from({ length: subcolumnCount(format) }, () => emptyColumn(rows)),
    excluded: new Set(),
  };
}

export const newRows = (n: number, titles?: readonly (string | null)[]): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: newId('r'), title: titles?.[i] ?? null }));

export interface NewColumnTable {
  readonly title: string;
  readonly groups: readonly string[];
  /** Replicate rows to start with (raw); ignored for summary data, which has one row. */
  readonly rows?: number;
  readonly format?: EntryFormat;
}

export function createColumnTable(spec: NewColumnTable): ColumnTable {
  const format = spec.format ?? COLUMN_RAW;
  const rows = newRows(format.kind === 'summary' ? 1 : (spec.rows ?? 0));
  return {
    id: newId('t'),
    type: 'column',
    title: spec.title,
    format,
    rows,
    dataSets: spec.groups.map((g) => emptyDataSet(newId('ds'), g, rows.length, format)),
  };
}

export interface NewGroupedTable {
  readonly title: string;
  /** Row-factor levels, e.g. genotypes. */
  readonly rowTitles: readonly string[];
  /** Column-factor levels, e.g. treatments. */
  readonly groups: readonly string[];
  readonly format: EntryFormat;
}

export function createGroupedTable(spec: NewGroupedTable): GroupedTable {
  const rows = newRows(spec.rowTitles.length, spec.rowTitles);
  return {
    id: newId('t'),
    type: 'grouped',
    title: spec.title,
    format: spec.format,
    rows,
    dataSets: spec.groups.map((g) => emptyDataSet(newId('ds'), g, rows.length, spec.format)),
  };
}

export const findDataSet = (table: Table, id: Id): DataSet | undefined =>
  table.dataSets.find((d) => d.id === id);

export const rowIndex = (table: Table, id: Id): number => table.rows.findIndex((r) => r.id === id);

/** A copy of a table with fresh ids throughout (its exclusions follow the new row ids). */
export function duplicateTable(table: Table, title: string): Table {
  const rowIds = new Map(table.rows.map((r) => [r.id, newId('r')]));
  const rows = table.rows.map((r) => ({ ...r, id: rowIds.get(r.id) ?? newId('r') }));
  const dataSets = table.dataSets.map((d) => ({
    ...d,
    id: newId('ds'),
    subcolumns: d.subcolumns.map((c) => c.slice()),
    excluded: new Set(
      [...d.excluded].map((k) => {
        const { subcolumn, row } = parseCellKey(k);
        return cellKey(subcolumn, rowIds.get(row) ?? row);
      }),
    ),
  }));
  return { ...table, id: newId('t'), title, rows, dataSets };
}
