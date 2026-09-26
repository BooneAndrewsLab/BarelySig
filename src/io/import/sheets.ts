/**
 * What every data-file reader produces (item 10, decision 6): sheets,
 * each a rectangle of cells. Text is parsed later, with the paste
 * parser; a number read from a spreadsheet is kept as the number it
 * holds, never as displayed.
 */
import { type Separator, decodeText, parseDelimited, sniffSeparator } from './delimited';

/** A spreadsheet cell formatted as a percentage: the percentage shown (0.85 → 85). */
export interface Percent {
  readonly percent: number;
}

export type SourceCell = string | number | Percent;

export interface SourceSheet {
  readonly name: string;
  /** Rows of equal length. */
  readonly cells: readonly (readonly SourceCell[])[];
  /** Rows or columns past the limits were left out. */
  readonly truncated: boolean;
}

export interface SourceBook {
  readonly kind: 'text' | 'workbook';
  readonly sheets: readonly SourceSheet[];
  /** A text file's separator, as read (sniffed or chosen). */
  readonly separator?: Separator;
}

/** The most rows and columns read from a sheet (decision 12). */
export const MAX_ROWS = 10_000;
export const MAX_COLUMNS = 500;
/** Files over this are refused before reading. */
export const MAX_BYTES = 50 * 1024 * 1024;

/** A rectangle cut to the limits, rows padded to one length. */
export function clip(rows: readonly (readonly SourceCell[])[]): {
  cells: SourceCell[][];
  truncated: boolean;
} {
  const width = Math.min(MAX_COLUMNS, Math.max(0, ...rows.map((r) => r.length)));
  const kept = rows.slice(0, MAX_ROWS);
  const truncated = rows.length > MAX_ROWS || rows.some((r) => r.length > MAX_COLUMNS);
  return {
    cells: kept.map((r) => {
      const row = r.slice(0, width);
      while (row.length < width) row.push('');
      return row;
    }),
    truncated,
  };
}

/** A text file as one sheet, separated by `separator` or by the one sniffed. */
export function readText(bytes: Uint8Array, name: string, separator?: Separator): SourceBook {
  const text = decodeText(bytes);
  const sep = separator ?? sniffSeparator(text);
  const { cells, truncated } = clip(parseDelimited(text, sep));
  return { kind: 'text', separator: sep, sheets: [{ name, cells, truncated }] };
}

/** How a file is read, from its name; null for files that aren't data. */
export type DataFileKind = 'text' | 'workbook';

const TEXT = ['.csv', '.tsv', '.tab', '.txt', '.dat', '.prn'];
const WORKBOOK = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.ods', '.fods', '.numbers'];
/** Documents that may hold a table but aren't read: the message asks for the spreadsheet. */
const DOCUMENT = ['.docx', '.doc', '.odt', '.rtf', '.pdf', '.pages'];

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
};

export function dataFileKind(name: string): DataFileKind | null {
  const ext = extensionOf(name);
  if (TEXT.includes(ext)) return 'text';
  if (WORKBOOK.includes(ext)) return 'workbook';
  return null;
}

export const isDocument = (name: string): boolean => DOCUMENT.includes(extensionOf(name));

/** The format a file is counted under in analytics: its extension, from a fixed list. */
export function formatLabel(name: string): string {
  const ext = extensionOf(name).slice(1);
  return [...TEXT, ...WORKBOOK].includes(`.${ext}`) ? ext : 'other';
}

/** Every data-file extension, for the file picker's `accept`. */
export const DATA_EXTENSIONS: readonly string[] = [...TEXT, ...WORKBOOK];
