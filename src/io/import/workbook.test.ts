/**
 * Spreadsheets written by other programs (scripts/make-import-fixtures.py:
 * openpyxl, odfpy, xlwt), read by SheetJS as the reader worker does.
 */
import { readFileSync } from 'node:fs';

import { buildTable, guessLayout } from './guess';
import { WorkbookError, isPercentFormat, readWorkbook } from './workbook';

const read = (name: string) =>
  readWorkbook(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));

describe('an .xlsx from openpyxl', () => {
  const book = read('workbook.xlsx');

  it('lists the visible sheets with data', () => {
    expect(book.kind).toBe('workbook');
    expect(book.sheets.map((s) => s.name)).toEqual(['Viability', 'Percent', 'Grouped']);
  });

  it('reads numbers in full, not as displayed, and other cells as text', () => {
    expect(book.sheets[0]?.cells).toEqual([
      ['WT', 'KO', 'Het'],
      // The file holds 0.3 (openpyxl writes 15 digits); shown as "0.30".
      [0.3, 2.5, 7],
      [1.23456789012345, 'NA', -3],
      [Number('9.999999999999999e-21'), '#DIV/0!', 'TRUE'],
      ['', '2026-09-26', 'bad well'],
      [12, '', ''],
    ]);
  });

  it('reads a percentage as the percentage shown', () => {
    expect(book.sheets[1]?.cells.slice(1)).toEqual([
      [{ percent: 85 }, { percent: 12.5 }],
      [{ percent: 90 }, { percent: 50 }],
    ]);
  });

  it('copies merged text into the cells it covers, but not a merged number', () => {
    expect(book.sheets[2]?.cells[0]).toEqual(['', 'WT', 'WT', 'WT', 'KO', 'KO', 'KO']);
    expect(book.sheets[2]?.cells[4]).toEqual(['Merged', 9, '', '', '', '', '']);
  });

  it('makes the tables they hold', () => {
    const viability = book.sheets[0];
    const grouped = book.sheets[2];
    if (!viability || !grouped) throw new Error('missing sheet');
    const g = guessLayout(viability, '.');
    expect(g.choice.layout).toBe('columns');
    const r = buildTable(viability, g.choice, 'Viability');
    expect(r?.table.dataSets[1]?.subcolumns[0]).toEqual([2.5, null, null, null, null]);
    expect(r?.notes.missing).toEqual(
      new Map([
        ['NA', 1],
        ['#DIV/0!', 1],
      ]),
    );
    expect(r?.notes.text.examples).toEqual(['2026-09-26', 'TRUE', 'bad well']);

    const gg = guessLayout(grouped, '.');
    expect(gg.choice.layout).toBe('grouped');
    const t = buildTable(grouped, gg.choice, 'Grouped')?.table;
    expect(t?.format).toEqual({ kind: 'replicates', count: 3 });
    expect(t?.rows.map((x) => x.title)).toEqual(['Control', 'Drug', 'Merged']);
    expect(t?.dataSets[0]?.subcolumns[2]).toEqual([1.3, null, null]);
  });
});

describe('an .ods from odfpy', () => {
  const book = read('workbook.ods');

  it('reads summary data, merged titles and percentages', () => {
    expect(book.sheets.map((s) => s.name)).toEqual(['Summary', 'Merged']);
    expect(book.sheets[0]?.cells[1]).toEqual(['WT', 5.5, 1.25, 4]);
    expect(book.sheets[1]?.cells[0]).toEqual(['', 'WT', 'WT', 'KO', 'KO']);
    expect(book.sheets[1]?.cells[3]?.[1]).toEqual({ percent: 85 });
  });

  it('guesses summary data', () => {
    const s = book.sheets[0];
    if (!s) throw new Error('missing sheet');
    const g = guessLayout(s, '.');
    expect(g.choice.layout).toBe('summary');
    expect(buildTable(s, g.choice, 'Summary')?.table.format).toEqual({
      kind: 'summary',
      stats: 'mean-sd-n',
    });
  });
});

describe('an .xls from xlwt', () => {
  it('reads a legacy workbook with merged titles and accents', () => {
    const book = read('legacy.xls');
    expect(book.sheets[0]?.cells).toEqual([
      ['', 'Wild type', 'Wild type', 'Mutant ü', 'Mutant ü'],
      ['', 1, 2, 1, 2],
      ['Day 1', 0.5, 0.25, 1.75, 2.125],
      ['Day 2', 10, 20, 30, 40],
    ]);
  });
});

describe('files that are not spreadsheets', () => {
  it('says so in plain words', () => {
    expect(() => readWorkbook(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0]))).toThrow(WorkbookError);
  });
});

describe('isPercentFormat', () => {
  it('finds a % outside quotes and brackets', () => {
    expect(isPercentFormat('0%')).toBe(true);
    expect(isPercentFormat('0.0%')).toBe(true);
    expect(isPercentFormat('0.00')).toBe(false);
    expect(isPercentFormat('0.0"%"')).toBe(false);
    expect(isPercentFormat('0\\%')).toBe(false);
    expect(isPercentFormat(undefined)).toBe(false);
  });
});
