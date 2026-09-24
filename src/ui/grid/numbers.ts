/**
 * Reading and showing cell values (item 03). One parser for typing and
 * pasting, so a value means the same however it got in.
 *
 * Empty text is an empty cell (null), never 0. Spreadsheet errors and
 * missing-value markers are recognised as such, so a paste can say what
 * it left out. The decimal separator is given by the caller: the
 * browser's language for typing, or what a pasted block settles on.
 */

export type DecimalSeparator = '.' | ',';

export type Parsed =
  | { readonly kind: 'number'; readonly value: number; readonly percent: boolean }
  | { readonly kind: 'empty' }
  /** An error or missing marker from a spreadsheet: `#N/A`, `#DIV/0!`, `NaN`, `NA`, `-`, … */
  | { readonly kind: 'missing'; readonly marker: string }
  | { readonly kind: 'text'; readonly text: string };

const MISSING = new Set([
  'nan',
  'na',
  'n/a',
  '#n/a',
  '-',
  '–',
  '—',
  '.',
  'null',
  'none',
  'missing',
  'inf',
  '-inf',
  '+inf',
  'infinity',
  '-infinity',
]);

/** Spreadsheet formula errors: `#DIV/0!`, `#VALUE!`, `#REF!`, `#NUM!`, `#NAME?`, `#NULL!`, `#N/A`, `#SPILL!`, … */
const SPREADSHEET_ERROR = /^#[A-Z0-9/]+[!?]?$/i;

/** Spaces used as thousands separators (normal, no-break, narrow no-break, thin). */
const SPACES = /[ \u00a0\u202f\u2009]/g;

export function isSpreadsheetError(text: string): boolean {
  return SPREADSHEET_ERROR.test(text.trim());
}

/** A number as a spreadsheet user writes it, with this decimal separator. */
function numberPattern(dec: DecimalSeparator): RegExp {
  // Groups of three after the first 1-3 digits, separated by the other
  // punctuation mark, an apostrophe or a space (normalised to ' ' first).
  const group = dec === '.' ? "[,' ]" : "[.' ]";
  const d = dec === '.' ? '\\.' : ',';
  return new RegExp(`^[+-]?(?:\\d{1,3}(?:${group}\\d{3})+|\\d+)?(?:${d}\\d*)?(?:[eE][+-]?\\d+)?$`);
}

const PATTERNS: Readonly<Record<DecimalSeparator, RegExp>> = {
  '.': numberPattern('.'),
  ',': numberPattern(','),
};

export function parseCell(raw: string, dec: DecimalSeparator): Parsed {
  let s = raw.trim();
  if (s === '') return { kind: 'empty' };
  if (MISSING.has(s.toLowerCase()) || isSpreadsheetError(s)) return { kind: 'missing', marker: s };
  s = s.replace(/−/g, '-').replace(SPACES, ' ');
  let percent = false;
  if (s.endsWith('%')) {
    percent = true;
    s = s.slice(0, -1).trimEnd();
  }
  if (!/\d/.test(s) || !PATTERNS[dec].test(s)) return { kind: 'text', text: raw.trim() };
  const normal = dec === '.' ? s.replace(/[,' ]/g, '') : s.replace(/[.' ]/g, '').replace(',', '.');
  const value = Number(normal);
  if (!Number.isFinite(value)) return { kind: 'text', text: raw.trim() };
  return { kind: 'number', value: value === 0 ? 0 : value, percent };
}

/** The decimal separator of a language, e.g. ',' for de-DE. */
export function decimalSeparatorOf(locale: string | undefined): DecimalSeparator {
  try {
    const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal');
    return part?.value === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}

export const browserDecimalSeparator = (): DecimalSeparator =>
  decimalSeparatorOf(typeof navigator === 'undefined' ? undefined : navigator.language);

const SHOWN_DIGITS = 10;

/** A value as the grid shows it: `decimals` digits if set, else its shortest form up to 10 significant digits. */
export function formatCell(value: number, dec: DecimalSeparator, decimals?: number): string {
  const s =
    decimals === undefined
      ? String(Number(value.toPrecision(SHOWN_DIGITS)))
      : value.toFixed(decimals);
  return dec === ',' ? s.replace('.', ',') : s;
}

/** A value as the editor shows it: every digit, so editing never rounds. */
export function editText(value: number, dec: DecimalSeparator): string {
  const s = String(value);
  return dec === ',' ? s.replace('.', ',') : s;
}
