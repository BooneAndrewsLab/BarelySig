/**
 * Paste and copy (item 03, note 03 "Paste and copy"). Pure: a clipboard
 * (every MIME type it offered) and a place in the grid go in, one edit and
 * a plain-language account of what happened come out.
 *
 * Excel, Google Sheets and LibreOffice all put TSV on `text/plain`, with
 * Excel's quoting; `text/html` is read only when there is no plain text.
 */
import { parseDelimited } from '@/io/import/delimited';
import type { Edit } from '@/model/edits';
import type { Cell } from '@/model/missing';
import { type Table, subcolumnCount } from '@/model/table';

import { type Entry, writeEntries } from './commands';
import { type GridLayout, cellValue, makeLayout, spanOf } from './layout';
import { type DecimalSeparator, parseCell } from './numbers';
import type { Pos, Range } from './selection';

/** What the clipboard offered, by MIME type. */
export type ClipboardContents = Readonly<Record<string, string>>;

/**
 * TSV as spreadsheets write it: tab between cells, CRLF/LF/CR between
 * rows, a cell holding a tab, newline or quote wrapped in quotes with
 * quotes doubled. One trailing newline does not make an empty last row.
 * Rows come back padded to the same length.
 */
export function parseTsv(text: string): string[][] {
  return parseDelimited(text, '\t');
}

/** Cells of the first `<table>` in HTML, or null. Needs a DOM parser (browser, jsdom). */
export function parseHtmlTable(html: string): string[][] | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const rows = [...table.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('td, th')].flatMap((td) => {
      const span = Math.max(1, Number(td.getAttribute('colspan') ?? '1') || 1);
      const text = td.textContent.replace(/\u00a0/g, ' ').trim();
      return [text, ...Array<string>(span - 1).fill('')];
    }),
  );
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);
}

/** The block of text cells a clipboard holds. */
export function clipboardCells(clip: ClipboardContents): string[][] {
  const text = clip['text/plain'];
  if (text !== undefined && text !== '') return parseTsv(text);
  const html = clip['text/html'];
  return html ? (parseHtmlTable(html) ?? []) : [];
}

/**
 * The decimal separator a block uses: whichever reads more of its cells
 * as numbers. `1,5` settles it for a comma; `1,234` alone is ambiguous and
 * falls back to the browser's language.
 */
export function detectDecimal(
  cells: readonly (readonly string[])[],
  fallback: DecimalSeparator,
): DecimalSeparator {
  let point = 0;
  let comma = 0;
  for (const row of cells) {
    for (const c of row) {
      if (c.trim() === '') continue;
      const p = parseCell(c, '.');
      const k = parseCell(c, ',');
      if (p.kind === 'number' && k.kind !== 'number') point += 1;
      if (k.kind === 'number' && p.kind !== 'number') comma += 1;
      // Cells both read (e.g. "1,234", or "12") are no evidence either way.
    }
  }
  if (point === comma) return fallback;
  return point > comma ? '.' : ',';
}

export interface PasteNotes {
  /** Cells holding spreadsheet errors or missing markers, by marker. */
  readonly missing: ReadonlyMap<string, number>;
  /** Cells of other text that aren't numbers (up to three examples). */
  readonly text: { readonly count: number; readonly examples: readonly string[] };
  readonly percent: number;
  readonly headerRow: boolean;
  readonly rowTitleColumn: boolean;
  /** Rows that don't fit (a Column table of summary data has one). */
  readonly droppedRows: number;
  readonly decimal: DecimalSeparator;
  readonly values: number;
}

export interface PasteResult {
  readonly edit: Edit | null;
  readonly notes: PasteNotes;
  /** Where the pasted block ended up, to select it. */
  readonly range: Range | null;
}

const isText = (s: string, dec: DecimalSeparator) => parseCell(s, dec).kind === 'text';
const isNumber = (s: string, dec: DecimalSeparator) => parseCell(s, dec).kind === 'number';

/** A first row of text over rows that are mostly numbers reads as titles. */
function looksLikeHeader(
  cells: readonly (readonly string[])[],
  dec: DecimalSeparator,
  skipCol: number,
): boolean {
  const [first, ...rest] = cells;
  if (!first || rest.length === 0) return false;
  const head = first.slice(skipCol).filter((c) => c.trim() !== '');
  if (head.length === 0 || !head.every((c) => isText(c, dec))) return false;
  const body = rest.flatMap((r) => r.slice(skipCol)).filter((c) => c.trim() !== '');
  return body.length > 0 && body.filter((c) => isNumber(c, dec)).length * 2 >= body.length;
}

/** A first column of text beside columns that are mostly numbers reads as row titles. */
function looksLikeRowTitles(
  cells: readonly (readonly string[])[],
  dec: DecimalSeparator,
  fromRow: number,
): boolean {
  const rows = cells.slice(fromRow);
  const col = rows.map((r) => r[0] ?? '').filter((c) => c.trim() !== '');
  if (col.length === 0 || !col.every((c) => isText(c, dec))) return false;
  const body = rows.flatMap((r) => r.slice(1)).filter((c) => c.trim() !== '');
  return body.length > 0 && body.filter((c) => isNumber(c, dec)).length * 2 >= body.length;
}

/**
 * Pastes a clipboard at `at`. With a one-cell clipboard and a larger
 * selection, the value fills the selection (Excel).
 */
export function pasteInto(
  table: Table,
  at: Pos,
  clip: ClipboardContents,
  fallback: DecimalSeparator,
  selection?: Range,
): PasteResult {
  let cells = clipboardCells(clip);
  const dec = detectDecimal(cells, fallback);
  const grouped = table.type === 'grouped' || table.type === 'contingency';
  let origin = at;
  let headerRow = false;
  let rowTitleColumn = false;

  if (cells.length === 1 && cells[0]?.length === 1 && selection) {
    const v = cells[0][0] ?? '';
    const h = selection.bottom - selection.top + 1;
    const w = selection.right - selection.left + 1;
    if (h * w > 1) {
      cells = Array.from({ length: h }, () => Array<string>(w).fill(v));
      origin = { row: selection.top, col: selection.left };
    }
  }

  // Titles: explicit when pasting into the title row or the row-title
  // column, detected when pasting at the top or left edge of the data.
  if (origin.row === -1) headerRow = true;
  else if (origin.row === 0 && looksLikeHeader(cells, dec, grouped && origin.col <= 0 ? 1 : 0)) {
    headerRow = true;
    origin = { row: -1, col: origin.col };
  }
  if (grouped) {
    if (origin.col === -1) rowTitleColumn = true;
    else if (origin.col === 0 && looksLikeRowTitles(cells, dec, headerRow ? 1 : 0)) {
      rowTitleColumn = true;
      origin = { row: origin.row, col: -1 };
    }
  }

  const height = cells.length;
  const width = Math.max(0, ...cells.map((r) => r.length));
  const perSet = subcolumnCount(table.format);
  // An XY table's X column (dataSets[0]) is one subcolumn wide regardless of `perSet`,
  // so a plain width/perSet estimate undercounts the data sets a wide paste needs by one.
  const extraSets = table.type === 'xy' ? 2 : 1;
  const layout = makeLayout(table, {
    minRows: origin.row + height + 1,
    minDataSets: Math.ceil((Math.max(origin.col, 0) + width) / perSet) + extraSets,
  });

  const missing = new Map<string, number>();
  const textExamples: string[] = [];
  let textCount = 0;
  let percent = 0;
  let droppedRows = 0;
  let values = 0;
  const entries: Entry[] = [];
  const titled = new Set<number>();

  cells.forEach((row, i) => {
    const r = origin.row + i;
    if (r >= layout.rowCount) {
      if (row.some((c) => c.trim() !== '')) droppedRows += 1;
      return;
    }
    row.forEach((raw, j) => {
      const c = origin.col + j;
      if (c >= layout.columns.length) return;
      const pos = { row: r, col: c };
      if (r === -1) {
        if (c === -1) return;
        // A data set's title comes from the first header cell over it.
        const span = spanOf(layout, c);
        if (!span || raw.trim() === '' || titled.has(span.dataSetIndex)) return;
        titled.add(span.dataSetIndex);
        entries.push({ pos: { row: -1, col: span.start }, title: raw.trim() });
        return;
      }
      if (c === -1) {
        entries.push({ pos, title: raw.trim() === '' ? null : raw.trim() });
        return;
      }
      const p = parseCell(raw, dec);
      let value: Cell = null;
      if (p.kind === 'number') {
        value = p.value;
        values += 1;
        if (p.percent) percent += 1;
      } else if (p.kind === 'missing') missing.set(p.marker, (missing.get(p.marker) ?? 0) + 1);
      else if (p.kind === 'text') {
        textCount += 1;
        if (textExamples.length < 3) textExamples.push(p.text);
      }
      entries.push({ pos, value });
    });
  });

  const edit = writeEntries(layout, entries, 'Paste');
  const lastRow = Math.min(origin.row + height - 1, layout.rowCount - 1);
  const lastCol = Math.min(origin.col + width - 1, layout.columns.length - 1);
  return {
    edit,
    notes: {
      missing,
      text: { count: textCount, examples: textExamples },
      percent,
      headerRow,
      rowTitleColumn,
      droppedRows,
      decimal: dec,
      values,
    },
    range:
      height === 0 || width === 0
        ? null
        : { top: origin.row, left: origin.col, bottom: lastRow, right: lastCol },
  };
}

const n = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** What a paste did, for the status line; `warning` when anything was left out or reinterpreted. */
export function describePaste(notes: PasteNotes): {
  readonly text: string;
  readonly warning: boolean;
} {
  const parts = [`Pasted ${n(notes.values, 'value', 'values')}.`];
  let warning = false;
  if (notes.headerRow) parts.push('The first row became group titles.');
  if (notes.rowTitleColumn) parts.push('The first column became row titles.');
  const missing = [...notes.missing.values()].reduce((a, b) => a + b, 0);
  if (missing > 0) {
    const markers = [...notes.missing.keys()].slice(0, 3).join(', ');
    parts.push(
      `${n(missing, 'cell', 'cells')} with ${markers} ${missing === 1 ? 'was' : 'were'} left empty.`,
    );
    warning = true;
  }
  if (notes.text.count > 0) {
    const ex = notes.text.examples.map((e) => `“${e}”`).join(', ');
    parts.push(
      `${n(notes.text.count, 'cell', 'cells')} of text (${ex}) ${notes.text.count === 1 ? 'isn’t a number and was' : 'aren’t numbers and were'} left empty.`,
    );
    warning = true;
  }
  if (notes.percent > 0) {
    parts.push(
      `${n(notes.percent, 'percentage was', 'percentages were')} read as the number shown (85% as 85).`,
    );
    warning = true;
  }
  if (notes.droppedRows > 0) {
    parts.push(
      `${n(notes.droppedRows, 'row', 'rows')} didn’t fit: a table of summary data has one row per group.`,
    );
    warning = true;
  }
  if (notes.decimal === ',') parts.push('Read with a decimal comma.');
  return { text: parts.join(' '), warning };
}

/**
 * The selection as TSV: every digit, `.` as the decimal point (what R,
 * Prism and every spreadsheet read), empty cells empty, titles as text.
 */
export function copyText(layout: GridLayout, range: Range): string {
  const lines: string[] = [];
  for (let r = range.top; r <= range.bottom; r += 1) {
    const cells: string[] = [];
    for (let c = range.left; c <= range.right; c += 1) {
      let text: string;
      if (r === -1) {
        const span = spanOf(layout, c);
        text = span && !span.spare && span.start === c ? span.title : '';
      } else if (c === -1) text = layout.table.rows[r]?.title ?? '';
      else {
        const v = cellValue(layout, r, c);
        text = v === null ? '' : String(v);
      }
      cells.push(/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    }
    lines.push(cells.join('\t'));
  }
  return `${lines.join('\r\n')}\r\n`;
}
