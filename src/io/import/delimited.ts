/**
 * Delimited text files (item 10): CSV, TSV, semicolon- or pipe-separated.
 * The same reading as a paste (note 03), with the separator a parameter,
 * so a file and the same block pasted from a spreadsheet agree cell for
 * cell.
 */

export type Separator = '\t' | ',' | ';' | '|';

export const SEPARATORS: readonly Separator[] = ['\t', ',', ';', '|'];

/**
 * Cells separated by `sep`, rows by CRLF/LF/CR, a cell holding the
 * separator, a newline or a quote wrapped in quotes with quotes doubled.
 * One trailing newline does not make an empty last row. Rows come back
 * padded to the same length.
 */
export function parseDelimited(text: string, sep: Separator): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let atCellStart = true;
  const endCell = () => {
    row.push(cell);
    cell = '';
    atCellStart = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (atCellStart && ch === '"') {
      // Quoted cell: runs to a quote followed by a separator or the end.
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < text.length) {
        const c = text[j];
        if (c === '"') {
          if (text[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          const after = text[j + 1];
          if (after === undefined || after === sep || after === '\n' || after === '\r') {
            closed = true;
            j += 1;
            break;
          }
        }
        value += c ?? '';
        j += 1;
      }
      if (closed) {
        cell = value;
        i = j;
        atCellStart = false;
        continue;
      }
      // Not a well-formed quoted cell: read the quote as text.
    }
    atCellStart = false;
    if (ch === sep) endCell();
    else if (ch === '\r' || ch === '\n') {
      endRow();
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      atCellStart = true;
    } else cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length > 0) endRow();
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);
}

const NUMBERISH = /^\s*[-+−]?[\d.,' ]*\d[\d.,' ]*%?\s*$/;

/**
 * The separator a text file uses: the one that splits its lines into the
 * same number of cells (two or more) most consistently; between equally
 * consistent ones, the one leaving more cells that look like numbers
 * (`1,5;2,5` splits evenly on both, but only `;` leaves numbers). Tab
 * when nothing splits.
 */
export function sniffSeparator(text: string): Separator {
  const sample = text.slice(0, 64 * 1024);
  let best: Separator = '\t';
  let bestScore = -1;
  for (const sep of SEPARATORS) {
    const rows = parseDelimited(sample, sep)
      .slice(0, 200)
      .map((r) => {
        let end = r.length;
        while (end > 0 && (r[end - 1] ?? '').trim() === '') end -= 1;
        return r.slice(0, end);
      })
      .filter((r) => r.length > 0);
    if (rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let mode = 1;
    let modeRows = 0;
    for (const [n, k] of counts) {
      if (k > modeRows || (k === modeRows && n > mode)) {
        mode = n;
        modeRows = k;
      }
    }
    if (mode < 2) continue;
    const cells = rows.flat().filter((c) => c.trim() !== '');
    const numeric = cells.filter((c) => NUMBERISH.test(c)).length / Math.max(1, cells.length);
    // Consistency first; numbers break ties and near-ties.
    const score = modeRows / rows.length + 0.5 * numeric;
    if (score > bestScore + 1e-9) {
      best = sep;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Text from a file's bytes: UTF-16 by its byte-order mark, else UTF-8
 * (its BOM dropped), else Windows-1252, what Excel on Windows long wrote
 * as "CSV".
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
