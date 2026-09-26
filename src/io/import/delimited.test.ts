import { decodeText, parseDelimited, sniffSeparator } from './delimited';
import { dataFileKind, formatLabel, isDocument, readText } from './sheets';

describe('parseDelimited', () => {
  it('reads quoted cells with separators, newlines and doubled quotes', () => {
    expect(parseDelimited('a,"b,c","say ""hi"""\r\n"two\nlines",2,3\n', ',')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['two\nlines', '2', '3'],
    ]);
  });

  it('pads ragged rows and keeps empty cells', () => {
    expect(parseDelimited('a;b;c\n1\n;;3', ';')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
      ['', '', '3'],
    ]);
  });

  it('reads a stray quote as text', () => {
    expect(parseDelimited('5" screen,2', ',')).toEqual([['5" screen', '2']]);
    expect(parseDelimited('"open,2', ',')).toEqual([['"open', '2']]);
  });
});

describe('sniffSeparator', () => {
  it('finds the separator that splits rows evenly', () => {
    expect(sniffSeparator('a,b,c\n1,2,3\n4,5,6')).toBe(',');
    expect(sniffSeparator('a\tb\n1\t2')).toBe('\t');
    expect(sniffSeparator('a|b\n1|2')).toBe('|');
  });

  it('prefers the one leaving numbers, for a decimal comma with semicolons', () => {
    expect(sniffSeparator('WT;KO\n1,5;2,5\n1,7;2,25')).toBe(';');
    expect(sniffSeparator('1,5;2,5\n1,7;2,25')).toBe(';');
  });

  it('ignores commas inside quotes', () => {
    expect(sniffSeparator('"a, b"\t"c"\n1\t2')).toBe('\t');
  });

  it('falls back to tab for one column', () => {
    expect(sniffSeparator('WT\n1\n2')).toBe('\t');
  });
});

describe('decodeText', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it('drops a UTF-8 byte-order mark', () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x57, 0x54))).toBe('WT');
  });

  it('reads UTF-16 by its byte-order mark', () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x57, 0, 0x54, 0))).toBe('WT');
    expect(decodeText(bytes(0xfe, 0xff, 0, 0x57, 0, 0x54))).toBe('WT');
  });

  it('falls back to Windows-1252 for bytes that are not UTF-8', () => {
    // "µg" and "°C" as Excel on Windows wrote them.
    expect(decodeText(bytes(0xb5, 0x67, 0x2c, 0xb0, 0x43))).toBe('µg,°C');
  });
});

describe('readText', () => {
  it('reads a file into one sheet with its separator', () => {
    const book = readText(new TextEncoder().encode('WT;KO\n1,5;2\n'), 'data.csv');
    expect(book.separator).toBe(';');
    expect(book.sheets).toEqual([
      {
        name: 'data.csv',
        cells: [
          ['WT', 'KO'],
          ['1,5', '2'],
        ],
        truncated: false,
      },
    ]);
  });

  it('uses a separator the user chose', () => {
    const book = readText(new TextEncoder().encode('a,b;c'), 'x.txt', ';');
    expect(book.sheets[0]?.cells).toEqual([['a,b', 'c']]);
  });
});

describe('file kinds', () => {
  it('tells text, workbooks and documents apart by extension', () => {
    expect(dataFileKind('Data.CSV')).toBe('text');
    expect(dataFileKind('plate.txt')).toBe('text');
    expect(dataFileKind('results.xlsx')).toBe('workbook');
    expect(dataFileKind('old.xls')).toBe('workbook');
    expect(dataFileKind('calc.ods')).toBe('workbook');
    expect(dataFileKind('project.bsig')).toBeNull();
    expect(dataFileKind('figure.svg')).toBeNull();
    expect(isDocument('table.docx')).toBe(true);
    expect(isDocument('table.odt')).toBe(true);
  });

  it('counts a format by a fixed label only', () => {
    expect(formatLabel('My secret data.xlsx')).toBe('xlsx');
    expect(formatLabel('x.weird')).toBe('other');
  });
});
