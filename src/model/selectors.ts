/**
 * From table to analysis input (item 02). Analyses never read subcolumns
 * directly; these turn data sets into what a test needs, and enforce the
 * domain rules on the way:
 *
 * - Empty cells (null) and excluded values are dropped, and counted, so
 *   the results can say what was left out. A zero is a value.
 * - Summary data comes out as mean, SD and n whatever was entered: SEM
 *   and CV are converted to SD here, as Prism does, so every analysis
 *   sees one form. SEM without n cannot be converted.
 * - Paired data pairs by row, and drops a row when either side is empty
 *   or excluded.
 * - Means are never handed to something expecting replicates: raw and
 *   summary are different kinds of `GroupData`.
 */
import type { Id } from './ids';
import type { Cell } from './missing';
import {
  type ColumnTable,
  type DataSet,
  type GroupedTable,
  type NestedTable,
  type SummaryStats,
  type Table,
  cellKey,
  subcolumnCount,
  summarySubcolumns,
} from './table';

export interface Dropped {
  /** Empty cells within the data (not the blank tail of a short column). */
  readonly empty: number;
  /** Values the user excluded. */
  readonly excluded: number;
}

export type GroupData =
  | { readonly kind: 'raw'; readonly values: readonly number[]; readonly dropped: Dropped }
  | {
      readonly kind: 'summary';
      /** null: the cell is empty or excluded. */
      readonly mean: number | null;
      /** Converted from SEM or CV when that was entered; null when it cannot be. */
      readonly sd: number | null;
      /** null when empty, excluded, or the format has no n. */
      readonly n: number | null;
      /** The limits entered with `mean-lower-upper` (graphs only); null for other formats. */
      readonly interval: { readonly lower: number | null; readonly upper: number | null } | null;
      /** What the user entered, so results can say so. */
      readonly entered: SummaryStats;
    };

export class DataError extends Error {
  override readonly name = 'DataError';
}

export interface Labelled<T> {
  readonly id: Id;
  readonly title: string;
  readonly data: T;
}

function requireDataSet(table: Table, id: Id): DataSet {
  const d = table.dataSets.find((x) => x.id === id);
  if (!d) throw new DataError(`Data set ${id} is not in table "${table.title}".`);
  return d;
}

/** The cell's value, or null when it is empty or excluded. */
function usable(table: Table, ds: DataSet, subcolumn: number, r: number): Cell {
  const row = table.rows[r];
  const v = ds.subcolumns[subcolumn]?.[r] ?? null;
  if (v === null || row === undefined) return null;
  return ds.excluded.has(cellKey(subcolumn, row.id)) ? null : v;
}

/** Values of some cells, with what was dropped. `ragged`: blanks after the last value don't count. */
function collect(
  table: Table,
  ds: DataSet,
  cells: readonly (readonly [number, number])[],
  ragged: boolean,
): GroupData {
  const values: number[] = [];
  let empty = 0;
  let excluded = 0;
  let pendingEmpty = 0;
  for (const [s, r] of cells) {
    const v = ds.subcolumns[s]?.[r] ?? null;
    const row = table.rows[r];
    if (v === null || row === undefined) {
      pendingEmpty += 1;
      continue;
    }
    // A value (kept or excluded) makes the blanks before it interior.
    empty += pendingEmpty;
    pendingEmpty = 0;
    if (ds.excluded.has(cellKey(s, row.id))) excluded += 1;
    else values.push(v);
  }
  if (!ragged) empty += pendingEmpty;
  return { kind: 'raw', values, dropped: { empty, excluded } };
}

/** Summary data of one row: mean, SD (converted) and n. CV is a percentage of the mean. */
function summaryAt(table: Table, ds: DataSet, stats: SummaryStats, r: number): GroupData {
  const cols = summarySubcolumns(stats);
  const get = (name: string): Cell => {
    const s = cols.indexOf(name as (typeof cols)[number]);
    return s < 0 ? null : usable(table, ds, s, r);
  };
  const mean = get('mean');
  const n = get('n');
  if (stats === 'mean-lower-upper') {
    return {
      kind: 'summary',
      mean,
      sd: null,
      n: null,
      interval: { lower: get('lower'), upper: get('upper') },
      entered: stats,
    };
  }
  let sd: number | null;
  const spread = cols[1];
  if (spread === 'sd') sd = get('sd');
  else if (spread === 'sem') {
    const sem = get('sem');
    sd = sem === null || n === null ? null : sem * Math.sqrt(n);
  } else {
    const cv = get('cv');
    sd = cv === null || mean === null ? null : (cv * Math.abs(mean)) / 100;
  }
  return { kind: 'summary', mean, sd, n, interval: null, entered: stats };
}

/** One group of a Column table: its replicates, or its summary data. */
export function columnGroup(table: ColumnTable, dataSet: Id): GroupData {
  const ds = requireDataSet(table, dataSet);
  if (table.format.kind === 'summary') return summaryAt(table, ds, table.format.stats, 0);
  return collect(
    table,
    ds,
    table.rows.map((_, r) => [0, r] as const),
    true,
  );
}

export function columnGroups(table: ColumnTable, dataSets: readonly Id[]): Labelled<GroupData>[] {
  return dataSets.map((id) => ({
    id,
    title: requireDataSet(table, id).title,
    data: columnGroup(table, id),
  }));
}

export interface Pair {
  readonly row: Id;
  readonly a: number;
  readonly b: number;
}

export interface PairedData {
  readonly pairs: readonly Pair[];
  /** Rows with a value on one side only (or excluded), left out of the pairing. */
  readonly droppedRows: number;
}

/** Two groups of a Column table paired by row, for paired tests. Needs replicates. */
export function pairedGroups(table: ColumnTable, a: Id, b: Id): PairedData {
  if (table.format.kind === 'summary') {
    throw new DataError(
      'A paired test needs the individual values, not summary data (mean, SD, n).',
    );
  }
  const da = requireDataSet(table, a);
  const db = requireDataSet(table, b);
  const pairs: Pair[] = [];
  let droppedRows = 0;
  table.rows.forEach((row, r) => {
    const va = usable(table, da, 0, r);
    const vb = usable(table, db, 0, r);
    if (va !== null && vb !== null) pairs.push({ row: row.id, a: va, b: vb });
    else if (da.subcolumns[0]?.[r] != null || db.subcolumns[0]?.[r] != null) droppedRows += 1;
  });
  return { pairs, droppedRows };
}

export interface GroupedData {
  /** Row-factor levels. */
  readonly rows: readonly { readonly id: Id; readonly title: string | null }[];
  /** Column-factor levels. */
  readonly dataSets: readonly { readonly id: Id; readonly title: string }[];
  /** `cells[r][d]`: the replicates (or summary) of row level r, column level d. Empty cells stay as structure. */
  readonly cells: readonly (readonly GroupData[])[];
}

/** The row × column cell structure of a Grouped table, for two-way ANOVA and grouped graphs. */
export function groupedCells(
  table: GroupedTable,
  dataSets: readonly Id[] = table.dataSets.map((d) => d.id),
): GroupedData {
  const sets = dataSets.map((id) => requireDataSet(table, id));
  const { format } = table;
  return {
    rows: table.rows.map((r) => ({ id: r.id, title: r.title })),
    dataSets: sets.map((d) => ({ id: d.id, title: d.title })),
    cells: table.rows.map((_, r) =>
      sets.map((ds) =>
        format.kind === 'summary'
          ? summaryAt(table, ds, format.stats, r)
          : collect(
              table,
              ds,
              Array.from({ length: format.count }, (_, s) => [s, r] as const),
              false,
            ),
      ),
    ),
  };
}

export interface NestedGroup {
  readonly id: Id;
  readonly title: string;
  /** One per biological replicate; a replicate with no usable value is kept (and counted) as empty. */
  readonly replicates: readonly GroupData[];
}

/** A Nested table's groups, each with its biological replicates' raw values. */
export function nestedGroups(
  table: NestedTable,
  dataSets: readonly Id[] = table.dataSets.map((d) => d.id),
): NestedGroup[] {
  const count = subcolumnCount(table.format);
  return dataSets.map((id) => {
    const ds = requireDataSet(table, id);
    return {
      id,
      title: ds.title,
      replicates: Array.from({ length: count }, (_, s) =>
        collect(
          table,
          ds,
          table.rows.map((_, r) => [s, r] as const),
          true,
        ),
      ),
    };
  });
}
