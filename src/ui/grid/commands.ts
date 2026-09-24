/**
 * Grid actions as model edits (item 03). Each action is one `batch`, so
 * one undo step, and creates the spare rows and data sets it writes into:
 * typing in row 12 of an empty table adds rows 1–12, typing in the "Add
 * group" column adds that group.
 */
import type { CellWrite, Edit } from '@/model/edits';
import { type Id, newId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import { cellKey } from '@/model/table';

import { type GridLayout, defaultTitle } from './layout';
import { type DecimalSeparator, parseCell } from './numbers';
import type { Pos, Range } from './selection';

/** What to put in a grid cell: a value, or text for the title row and row titles. */
export type Entry =
  | { readonly pos: Pos; readonly value: Cell }
  | { readonly pos: Pos; readonly title: string | null };

interface Made {
  readonly edits: Edit[];
  readonly rowId: (row: number) => Id | undefined;
  readonly dataSetId: (index: number) => Id | undefined;
}

/** Creates spare rows up to `maxRow` and spare data sets up to `maxSet`. */
function materialize(
  layout: GridLayout,
  maxRow: number,
  maxSet: number,
  titles: ReadonlyMap<number, string>,
): Made {
  const { table } = layout;
  const edits: Edit[] = [];
  const newRows: Id[] = [];
  if (maxRow >= layout.modelRows && layout.growsRows) {
    for (let r = layout.modelRows; r <= maxRow; r += 1) newRows.push(newId('r'));
    edits.push({
      op: 'insertRows',
      table: table.id,
      at: layout.modelRows,
      rows: newRows.map((id) => ({ id, title: null })),
    });
  }
  const newSets: Id[] = [];
  for (let d = table.dataSets.length; d <= maxSet; d += 1) {
    const id = newId('ds');
    newSets.push(id);
    edits.push({
      op: 'addDataSet',
      table: table.id,
      at: d,
      id,
      title: titles.get(d) ?? defaultTitle(d),
    });
  }
  return {
    edits,
    rowId: (row) =>
      row < layout.modelRows ? table.rows[row]?.id : newRows[row - layout.modelRows],
    dataSetId: (i) =>
      i < table.dataSets.length ? table.dataSets[i]?.id : newSets[i - table.dataSets.length],
  };
}

/** Puts entries into the grid, as one edit; null when there is nothing to do. */
export function writeEntries(
  layout: GridLayout,
  entries: readonly Entry[],
  label = 'Edit cells',
): Edit | null {
  const { table } = layout;
  let maxRow = -1;
  let maxSet = -1;
  // Titles typed into a spare data set become its title when it is created.
  const spareTitles = new Map<number, string>();
  const usable = entries.filter((e) => {
    const { row, col } = e.pos;
    if (row >= layout.rowCount || col >= layout.columns.length) return false;
    if (row >= layout.modelRows && !layout.growsRows) return false;
    // Writing nothing into a spare cell creates nothing.
    const spareRow = row >= layout.modelRows;
    const spareSet = col >= 0 && (layout.columns[col]?.dataSetIndex ?? 0) >= table.dataSets.length;
    const blank = 'value' in e ? e.value === null : e.title === null || e.title === '';
    if (blank && (spareRow || spareSet)) return false;
    return true;
  });
  for (const e of usable) {
    const { row, col } = e.pos;
    if (row >= 0) maxRow = Math.max(maxRow, row);
    const c = layout.columns[col];
    if (c) maxSet = Math.max(maxSet, c.dataSetIndex);
    if (row === -1 && c && c.dataSetIndex >= table.dataSets.length && 'title' in e && e.title) {
      spareTitles.set(c.dataSetIndex, e.title);
    }
  }
  if (usable.length === 0) return null;
  const made = materialize(layout, maxRow, maxSet, spareTitles);
  const edits = [...made.edits];
  const cells: CellWrite[] = [];
  for (const e of usable) {
    const { row, col } = e.pos;
    if (row === -1) {
      const c = layout.columns[col];
      const id = c ? made.dataSetId(c.dataSetIndex) : undefined;
      if (!id || !('title' in e) || (c && spareTitles.has(c.dataSetIndex))) continue;
      edits.push({ op: 'setDataSet', table: table.id, dataSet: id, title: e.title ?? '' });
    } else if (col === -1) {
      const id = made.rowId(row);
      if (id && 'title' in e)
        edits.push({
          op: 'setRowTitle',
          table: table.id,
          row: id,
          title: e.title === '' ? null : e.title,
        });
    } else if ('value' in e) {
      const c = layout.columns[col];
      const ds = c ? made.dataSetId(c.dataSetIndex) : undefined;
      const r = made.rowId(row);
      if (c && ds && r) cells.push({ dataSet: ds, subcolumn: c.subcolumn, row: r, value: e.value });
    }
  }
  if (cells.length > 0) edits.push({ op: 'setCells', table: table.id, cells });
  return { op: 'batch', label, edits };
}

export type TypedResult =
  | { readonly ok: true; readonly edit: Edit | null }
  | { readonly ok: false; readonly message: string };

/** What typing `text` into a cell does. Text that isn't a number is refused, with a message. */
export function typeInto(
  layout: GridLayout,
  pos: Pos,
  text: string,
  dec: DecimalSeparator,
): TypedResult {
  if (pos.row === -1 || pos.col === -1) {
    const title = text.trim();
    return {
      ok: true,
      edit: writeEntries(
        layout,
        [{ pos, title }],
        pos.row === -1 ? 'Rename group' : 'Edit row title',
      ),
    };
  }
  const parsed = parseCell(text, dec);
  switch (parsed.kind) {
    case 'empty':
      return { ok: true, edit: writeEntries(layout, [{ pos, value: null }]) };
    case 'number':
      return { ok: true, edit: writeEntries(layout, [{ pos, value: parsed.value }]) };
    case 'missing':
      return {
        ok: false,
        message: `“${parsed.marker}” marks a missing value; leave the cell empty instead (Delete clears it).`,
      };
    case 'text': {
      const hint =
        dec === '.' && /^\d+,\d+$/.test(parsed.text)
          ? ' Use a point as the decimal separator.'
          : '';
      return {
        ok: false,
        message: `“${parsed.text}” isn't a number.${hint} Type a number, or clear the cell with Delete.`,
      };
    }
  }
}

function* cellsOf(range: Range): Generator<Pos> {
  for (let row = range.top; row <= range.bottom; row += 1) {
    for (let col = range.left; col <= range.right; col += 1) yield { row, col };
  }
}

/** Delete / Backspace: empties the selection; titles become blank. */
export function clearRange(layout: GridLayout, range: Range): Edit | null {
  const entries: Entry[] = [];
  for (const pos of cellsOf(range)) {
    entries.push(pos.row === -1 || pos.col === -1 ? { pos, title: null } : { pos, value: null });
  }
  return writeEntries(layout, entries, 'Clear cells');
}

/**
 * Ctrl+D: copies the selection's top row into the rows below it; with a
 * one-row selection, copies the row above into it (Excel).
 */
export function fillDown(layout: GridLayout, range: Range): Edit | null {
  const top = Math.max(range.top, 0);
  const source = range.bottom === top ? top - 1 : top;
  if (source < 0) return null;
  const entries: Entry[] = [];
  for (let col = range.left; col <= range.right; col += 1) {
    const src =
      col === -1
        ? { title: layout.table.rows[source]?.title ?? null }
        : { value: cellAt(layout, source, col) };
    for (let row = source + 1; row <= range.bottom; row += 1)
      entries.push({ pos: { row, col }, ...src });
  }
  return writeEntries(layout, entries, 'Fill down');
}

function cellAt(layout: GridLayout, row: number, col: number): Cell {
  const c = layout.columns[col];
  return c ? (layout.table.dataSets[c.dataSetIndex]?.subcolumns[c.subcolumn]?.[row] ?? null) : null;
}

/** Ctrl+E: excludes the selected values, or includes them again when all already are. */
export function toggleExcluded(layout: GridLayout, range: Range): Edit | null {
  const byDataSet = new Map<Id, { subcolumn: number; row: Id }[]>();
  let allExcluded = true;
  for (const { row, col } of cellsOf(range)) {
    const c = layout.columns[col];
    const r = layout.table.rows[row];
    const ds = c ? layout.table.dataSets[c.dataSetIndex] : undefined;
    if (!c || !r || ds?.subcolumns[c.subcolumn]?.[row] == null) continue;
    if (!ds.excluded.has(cellKey(c.subcolumn, r.id))) allExcluded = false;
    const list = byDataSet.get(ds.id) ?? [];
    list.push({ subcolumn: c.subcolumn, row: r.id });
    byDataSet.set(ds.id, list);
  }
  if (byDataSet.size === 0) return null;
  const edits: Edit[] = [...byDataSet].map(([dataSet, cells]) => ({
    op: 'setExcluded',
    table: layout.table.id,
    dataSet,
    cells,
    excluded: !allExcluded,
  }));
  return { op: 'batch', label: allExcluded ? 'Include values' : 'Exclude values', edits };
}

/** Inserts as many blank rows as are selected, above the selection. */
export function insertRows(layout: GridLayout, range: Range): Edit | null {
  const at = Math.max(range.top, 0);
  if (at > layout.modelRows) return null;
  const n = range.bottom - Math.max(range.top, 0) + 1;
  const rows = Array.from({ length: Math.max(n, 1) }, () => ({ id: newId('r'), title: null }));
  return { op: 'insertRows', table: layout.table.id, at, rows };
}

/** Deletes the selected rows that hold data (spare rows are not in the table). */
export function deleteRows(layout: GridLayout, range: Range): Edit | null {
  const rows = layout.table.rows.slice(Math.max(range.top, 0), range.bottom + 1).map((r) => r.id);
  return rows.length === 0 ? null : { op: 'deleteRows', table: layout.table.id, rows };
}

function unusedTitle(layout: GridLayout): string {
  const taken = new Set(layout.table.dataSets.map((d) => d.title));
  for (let i = layout.table.dataSets.length; ; i += 1)
    if (!taken.has(defaultTitle(i))) return defaultTitle(i);
}

/** Inserts a data set before (or after) the one holding `col`. */
export function insertDataSet(layout: GridLayout, col: number, after: boolean): Edit | null {
  const c = layout.columns[col];
  if (!c) return null;
  const at = Math.min(c.dataSetIndex + (after ? 1 : 0), layout.table.dataSets.length);
  return {
    op: 'addDataSet',
    table: layout.table.id,
    at,
    id: newId('ds'),
    title: unusedTitle(layout),
  };
}

/** Deletes the data sets the selection touches. */
export function deleteDataSets(layout: GridLayout, range: Range): Edit | null {
  const ids = new Set<Id>();
  for (let col = Math.max(range.left, 0); col <= range.right; col += 1) {
    const id = layout.columns[col]?.dataSet;
    if (id) ids.add(id);
  }
  if (ids.size === 0) return null;
  const edits: Edit[] = [...ids].map((dataSet) => ({
    op: 'removeDataSet',
    table: layout.table.id,
    dataSet,
  }));
  return { op: 'batch', label: ids.size === 1 ? 'Delete group' : 'Delete groups', edits };
}
