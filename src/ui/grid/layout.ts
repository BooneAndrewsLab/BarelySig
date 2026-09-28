/**
 * How a table is laid out as a grid (item 03). Columns are the subcolumns
 * of each data set in order, then those of spare data sets ("Add group");
 * rows are the table's rows, then spare blank rows. Typing into a spare
 * cell creates what it needs (`commands.ts`), so the model only holds what
 * was entered.
 *
 * Grid coordinates: row -1 is the title row, column -1 the row-title
 * column of a Grouped table. Everything else is 0-based.
 */
import type { Id } from '@/model/ids';
import {
  type SummarySubcolumn,
  type Table,
  subcolumnCount,
  summarySubcolumns,
} from '@/model/table';

export interface GridColumn {
  /** Index into `table.dataSets`; spare data sets continue past its end. */
  readonly dataSetIndex: number;
  /** The data set's id, or null for a spare one. */
  readonly dataSet: Id | null;
  readonly subcolumn: number;
  /** Subcolumn label under the title ("Y1", "Mean"), empty when a data set has one subcolumn. */
  readonly label: string;
}

export interface DataSetSpan {
  readonly dataSetIndex: number;
  readonly dataSet: Id | null;
  /** The title, or the placeholder a spare data set shows. */
  readonly title: string;
  readonly spare: boolean;
  readonly start: number;
  readonly count: number;
}

export interface GridLayout {
  readonly table: Table;
  /** Grouped tables have a row-title column (-1). */
  readonly rowTitles: boolean;
  readonly columns: readonly GridColumn[];
  readonly spans: readonly DataSetSpan[];
  /** Rows the table holds; rows at or past this index are spare. */
  readonly modelRows: number;
  readonly rowCount: number;
  /** Whether rows can be added: not in a Column table of summary data (one row). */
  readonly growsRows: boolean;
  /** Whether any data set has more than one subcolumn, so headers have a second line. */
  readonly subHeaders: boolean;
}

export interface LayoutSize {
  /** Rows to show at least (the view's height plus a margin). */
  readonly minRows: number;
  /** Data sets to show at least, spare ones included. */
  readonly minDataSets: number;
}

/** Spreadsheet-style letters: 0 → A, 25 → Z, 26 → AA. */
export function letters(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** The title a data set gets when it is created from the spare column at this index. */
export const defaultTitle = (dataSetIndex: number): string => `Group ${letters(dataSetIndex)}`;

const SPARE_ROWS = 20;

/** Header labels of summary subcolumns; typed by kind, so a new kind can't go unlabelled. */
const SUBCOLUMN_LABELS: Readonly<Record<SummarySubcolumn, string>> = {
  mean: 'Mean',
  sd: 'SD',
  sem: 'SEM',
  cv: '%CV',
  n: 'N',
  lower: 'Lower',
  upper: 'Upper',
};

export function subcolumnLabels(table: Table): readonly string[] {
  const { format } = table;
  if (format.kind === 'summary') {
    return summarySubcolumns(format.stats).map((s) => SUBCOLUMN_LABELS[s]);
  }
  if (table.type === 'nested') {
    if (format.count === 1) return [''];
    const titles = table.replicateTitles;
    return Array.from(
      { length: format.count },
      (_, i) => titles?.[i] ?? `Replicate ${String(i + 1)}`,
    );
  }
  return format.count === 1
    ? ['']
    : Array.from({ length: format.count }, (_, i) => `Y${String(i + 1)}`);
}

export function makeLayout(table: Table, size: LayoutSize): GridLayout {
  const labels = subcolumnLabels(table);
  const perSet = subcolumnCount(table.format);
  const sets = Math.max(table.dataSets.length + 1, size.minDataSets);
  const columns: GridColumn[] = [];
  const spans: DataSetSpan[] = [];
  for (let d = 0; d < sets; d += 1) {
    const ds = table.dataSets[d];
    spans.push({
      dataSetIndex: d,
      dataSet: ds?.id ?? null,
      title: ds ? ds.title : defaultTitle(d),
      spare: !ds,
      start: columns.length,
      count: perSet,
    });
    for (let s = 0; s < perSet; s += 1) {
      columns.push({
        dataSetIndex: d,
        dataSet: ds?.id ?? null,
        subcolumn: s,
        label: labels[s] ?? '',
      });
    }
  }
  const growsRows = !(table.type === 'column' && table.format.kind === 'summary');
  const modelRows = table.rows.length;
  return {
    table,
    rowTitles: table.type === 'grouped' || table.type === 'contingency',
    columns,
    spans,
    modelRows,
    rowCount: growsRows ? Math.max(modelRows + SPARE_ROWS, size.minRows) : Math.max(modelRows, 1),
    growsRows,
    subHeaders: perSet > 1,
  };
}

export const firstColumn = (layout: GridLayout): number => (layout.rowTitles ? -1 : 0);

/** The span a column belongs to. */
export function spanOf(layout: GridLayout, col: number): DataSetSpan | undefined {
  const c = layout.columns[col];
  return c ? layout.spans[c.dataSetIndex] : undefined;
}

/** The value in a grid cell (null when empty or spare). Title row and row titles are not values. */
export function cellValue(layout: GridLayout, row: number, col: number): number | null {
  const c = layout.columns[col];
  if (!c || row < 0) return null;
  const ds = layout.table.dataSets[c.dataSetIndex];
  return ds?.subcolumns[c.subcolumn]?.[row] ?? null;
}

/** Whether a grid cell holds anything, for Ctrl+arrow jumps and "last filled cell". */
export function isFilled(layout: GridLayout, row: number, col: number): boolean {
  if (row === -1) {
    const span = spanOf(layout, col);
    return span !== undefined && !span.spare;
  }
  if (col === -1) return (layout.table.rows[row]?.title ?? null) !== null;
  return cellValue(layout, row, col) !== null;
}

/** The last row and column holding data, or (-1, -1) for an empty table. */
export function lastFilled(layout: GridLayout): { readonly row: number; readonly col: number } {
  let row = -1;
  let col = -1;
  layout.table.dataSets.forEach((d, i) => {
    d.subcolumns.forEach((cells, s) => {
      cells.forEach((v, r) => {
        if (v === null) return;
        row = Math.max(row, r);
        col = Math.max(col, (layout.spans[i]?.start ?? 0) + s);
      });
    });
  });
  return { row, col };
}
