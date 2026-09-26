/**
 * Spreadsheet files through SheetJS (item 10, decision 4). Loaded only
 * inside the reader worker, so the library is never in the app shell.
 * Values only: formulas are not evaluated (their cached values are read)
 * and macros never run.
 */
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import { type CellObject, type WorkSheet, read, set_cptable, utils } from 'xlsx';

import { MAX_COLUMNS, MAX_ROWS, type SourceBook, type SourceCell, clip } from './sheets';

// Code pages for old .xls files that aren't Unicode.
set_cptable(cptable);

/** A readable message for a file SheetJS can't read. */
export class WorkbookError extends Error {}

/** Whether a number format shows a percentage (a `%` outside quotes and brackets). */
export function isPercentFormat(format: string | undefined): boolean {
  if (!format) return false;
  const bare = format.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  return bare.includes('%');
}

function cellValue(cell: CellObject | undefined): SourceCell {
  if (!cell) return '';
  switch (cell.t) {
    case 'n': {
      const v = cell.v as number;
      if (!Number.isFinite(v)) return cell.w ?? '';
      // Shown as a percentage: the percentage, to Excel's 15 digits (0.85 × 100 is 85.00000000000001).
      if (isPercentFormat(typeof cell.z === 'string' ? cell.z : undefined)) {
        return { percent: Number((v * 100).toPrecision(15)) };
      }
      return v === 0 ? 0 : v;
    }
    case 's':
      return typeof cell.v === 'string' ? cell.v : String(cell.v ?? '');
    case 'e':
      return cell.w ?? '#N/A';
    case 'b':
    case 'd':
      return cell.w ?? String(cell.v ?? '');
    case 'z':
      return '';
  }
}

const isText = (c: SourceCell): c is string => typeof c === 'string' && c.trim() !== '';

function sheetCells(ws: WorkSheet): { cells: SourceCell[][]; truncated: boolean } {
  const ref = ws['!ref'];
  if (!ref) return { cells: [], truncated: false };
  const range = utils.decode_range(ref);
  const dense = (ws as { '!data'?: (CellObject | undefined)[][] })['!data'];
  const rows: SourceCell[][] = [];
  const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS);
  const lastCol = Math.min(range.e.c, range.s.c + MAX_COLUMNS);
  // Rows and columns before the range's start are empty; keep them so
  // "skip rows" counts rows as the spreadsheet numbers them.
  for (let r = 0; r <= lastRow; r += 1) {
    const row: SourceCell[] = [];
    for (let c = 0; c <= lastCol; c += 1) row.push(cellValue(dense?.[r]?.[c]));
    rows.push(row);
  }
  // A merged cell holding text reads as that text in every cell it covers
  // (a group title over its replicates); a merged number is not copied.
  for (const m of ws['!merges'] ?? []) {
    const top = rows[m.s.r]?.[m.s.c];
    if (top === undefined || !isText(top)) continue;
    for (let r = m.s.r; r <= Math.min(m.e.r, lastRow); r += 1) {
      for (let c = m.s.c; c <= Math.min(m.e.c, lastCol); c += 1) {
        const row = rows[r];
        if (row && (row[c] === undefined || row[c] === '')) row[c] = top;
      }
    }
  }
  const out = clip(rows);
  return {
    cells: out.cells,
    truncated: out.truncated || range.e.r > lastRow || range.e.c > lastCol,
  };
}

/** Every visible sheet of a workbook (hidden ones only when nothing else has data). */
export function readWorkbook(bytes: Uint8Array): SourceBook {
  let wb;
  try {
    wb = read(bytes, {
      type: 'array',
      dense: true,
      cellDates: true,
      cellNF: true,
      cellText: true,
      cellFormula: false,
      cellHTML: false,
      sheetRows: MAX_ROWS + 1,
      WTF: false,
    });
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : String(e);
    if (/password|encrypt/i.test(reason)) {
      throw new WorkbookError('it is password-protected. Save a copy without a password.');
    }
    throw new WorkbookError(
      'it couldn’t be read as a spreadsheet. Save it as .xlsx or .csv and open that.',
    );
  }
  const hidden = new Set(
    (wb.Workbook?.Sheets ?? []).flatMap((s, i) => (s.Hidden ? [wb.SheetNames[i]] : [])),
  );
  const sheets = wb.SheetNames.flatMap((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    const { cells, truncated } = sheetCells(ws);
    return [{ name, cells, truncated, hidden: hidden.has(name) }];
  });
  const hasData = (s: { cells: SourceCell[][] }) =>
    s.cells.some((r) => r.some((c) => c !== '' && !(typeof c === 'string' && c.trim() === '')));
  const visible = sheets.filter((s) => !s.hidden && hasData(s));
  const chosen = visible.length > 0 ? visible : sheets.filter(hasData);
  return {
    kind: 'workbook',
    sheets: chosen.map(({ name, cells, truncated }) => ({ name, cells, truncated })),
  };
}
