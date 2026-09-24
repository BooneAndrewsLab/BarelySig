// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import type { Cell } from '@/model/missing';
import { createProject } from '@/model/project';
import { type Table, createColumnTable, createGroupedTable } from '@/model/table';
import { validateProject } from '@/model/validate';
import { cellArb } from '@/test/modelArbitraries';

import {
  type ClipboardContents,
  copyText,
  describePaste,
  detectDecimal,
  parseTsv,
  pasteInto,
} from './clipboard';
import { writeEntries } from './commands';
import { makeLayout } from './layout';
import type { Pos, Range } from './selection';

interface Fixture {
  readonly source: string;
  readonly recorded: boolean;
  readonly note: string;
  readonly clipboard: ClipboardContents;
}

const FIXTURES = join(import.meta.dirname, 'fixtures');

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Fixture;
}

/** Pastes into a table and returns the table afterwards, with the paste's notes. */
function paste(
  table: Table,
  at: Pos,
  clip: ClipboardContents,
  fallback: '.' | ',' = '.',
  selection?: Range,
) {
  let project = applyEdit(createProject('P'), { op: 'addTable', table });
  const result = pasteInto(table, at, clip, fallback, selection);
  if (result.edit) project = applyEdit(project, result.edit);
  expect(validateProject(project)).toEqual([]);
  const after = project.tables.get(table.id);
  if (!after) throw new Error('table gone');
  return { after, result, said: describePaste(result.notes) };
}

function need<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('unreachable');
  return x;
}

const emptyColumn = () => createColumnTable({ title: 'T', groups: [] });
const titles = (t: Table) => t.dataSets.map((d) => d.title);
const values = (t: Table) => t.dataSets.map((d) => d.subcolumns);

describe('parseTsv', () => {
  it('splits rows and cells, with any line ending, ignoring one trailing newline', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseTsv('a\nb\rc')).toEqual([['a'], ['b'], ['c']]);
    expect(parseTsv('1\t\t3\n')).toEqual([['1', '', '3']]);
  });

  it('pads ragged rows with empty cells', () => {
    expect(parseTsv('1\t2\t3\n4\n')).toEqual([
      ['1', '2', '3'],
      ['4', '', ''],
    ]);
  });

  it('reads quoted cells holding tabs, newlines and quotes', () => {
    expect(parseTsv('"a\tb"\t"line\nnext"\t"say ""hi"""\n')).toEqual([
      ['a\tb', 'line\nnext', 'say "hi"'],
    ]);
  });

  it('keeps a stray quote as text', () => {
    expect(parseTsv('5" tall\t3\n')).toEqual([['5" tall', '3']]);
    expect(parseTsv('"open\t3\n')).toEqual([['"open', '3']]);
  });

  it('keeps blank lines inside a block as empty rows', () => {
    expect(parseTsv('1\n\n3\n')).toEqual([['1'], [''], ['3']]);
  });
});

describe('detectDecimal', () => {
  it('lets unambiguous cells decide, and the language break ties', () => {
    expect(detectDecimal([['1,5', '2']], '.')).toBe(',');
    expect(detectDecimal([['1.5', '1,234']], ',')).toBe('.');
    expect(detectDecimal([['1,234']], ',')).toBe(',');
    expect(detectDecimal([['1,234']], '.')).toBe('.');
    expect(detectDecimal([['12', '7']], ',')).toBe(',');
  });
});

describe('the fixtures', () => {
  it('each say where they came from and whether they were recorded', () => {
    const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const n of names) {
      const f = fixture(n.replace(/\.json$/, ''));
      expect(f.source).not.toBe('');
      expect(typeof f.recorded).toBe('boolean');
      expect(Object.keys(f.clipboard).length).toBeGreaterThan(0);
    }
  });

  it('Excel: header row to titles, empty cells stay empty, zero stays zero', () => {
    const { after, said } = paste(
      emptyColumn(),
      { row: 0, col: 0 },
      fixture('excel-windows-basic').clipboard,
    );
    expect(titles(after)).toEqual(['Control', 'Drug A', 'Drug B']);
    expect(values(after)).toEqual([[[1.2, 2.5, 0]], [[3.4, null, 4]], [[5, 6.1, null]]]);
    expect(said).toEqual({
      text: 'Pasted 7 values. The first row became group titles.',
      warning: false,
    });
  });

  it('Excel errors become empty cells, and the status line says which', () => {
    const { after, said } = paste(
      emptyColumn(),
      { row: 0, col: 0 },
      fixture('excel-errors').clipboard,
    );
    expect(values(after)).toEqual([[[1.5, null, 2]], [[null, 0.25, null]]]);
    expect(said.warning).toBe(true);
    expect(said.text).toContain('3 cells with #DIV/0!, #N/A, #VALUE! were left empty.');
  });

  it('Excel quoted cells keep their newlines and quotes as titles', () => {
    const { after } = paste(emptyColumn(), { row: 0, col: 0 }, fixture('excel-quoted').clipboard);
    expect(titles(after)).toEqual(['Dose\n(µM)', 'He said "hi"']);
    expect(values(after)).toEqual([[[1]], [[2]]]);
  });

  it('thousands separators are read; percentages keep the number shown, with a notice', () => {
    const { after, said } = paste(
      emptyColumn(),
      { row: 0, col: 0 },
      fixture('excel-thousands-percent').clipboard,
    );
    expect(values(after)).toEqual([[[1234, 12500, 987]], [[85, 92.5, 101]]]);
    expect(said.text).toContain('3 percentages were read as the number shown');
  });

  it('Google Sheets: no trailing newline', () => {
    const { after } = paste(emptyColumn(), { row: 0, col: 0 }, fixture('google-sheets').clipboard);
    expect(titles(after)).toEqual(['WT', 'KO']);
    expect(values(after)).toEqual([[[1.5, 3]], [[2.5, 4]]]);
  });

  it('LibreOffice in German: decimal commas and point thousands, whatever the browser language', () => {
    const { after, said } = paste(
      emptyColumn(),
      { row: 0, col: 0 },
      fixture('libreoffice-de').clipboard,
      '.',
    );
    expect(values(after)).toEqual([[[1.5, 3.75, 1234.5]], [[2.25, null, 0.001]]]);
    expect(said.text).toContain('decimal comma');
  });

  it('reads an HTML table when there is no plain text', () => {
    const { after } = paste(emptyColumn(), { row: 0, col: 0 }, fixture('html-only').clipboard);
    expect(titles(after)).toEqual(['A', 'B']);
    expect(values(after)).toEqual([[[1, 7]], [[null, null]]]);
  });

  it('a Grouped block with row titles and replicate headers lands in place', () => {
    const table = createGroupedTable({
      title: 'G',
      rowTitles: [],
      groups: [],
      format: { kind: 'replicates', count: 3 },
    });
    const { after, said } = paste(
      table,
      { row: 0, col: 0 },
      fixture('grouped-with-titles').clipboard,
    );
    expect(titles(after)).toEqual(['Untreated', 'Treated']);
    expect(after.rows.map((r) => r.title)).toEqual(['Wild type', 'Knockout']);
    expect(values(after)).toEqual([
      [
        [12.1, 8.4],
        [11.6, 7.9],
        [12.8, 8.8],
      ],
      [
        [9.3, 3.2],
        [8.7, 2.9],
        [9.9, 3.6],
      ],
    ]);
    expect(said.text).toContain('The first column became row titles.');
  });
});

describe('pasteInto', () => {
  it('grows the table: rows and groups past its end', () => {
    const t = emptyColumn();
    const { after } = paste(t, { row: 3, col: 1 }, { 'text/plain': '1\t2\n3\t4\n' });
    expect(after.rows).toHaveLength(5);
    expect(titles(after)).toEqual(['Group A', 'Group B', 'Group C']);
    expect(values(after)).toEqual([
      [[null, null, null, null, null]],
      [[null, null, null, 1, 3]],
      [[null, null, null, 2, 4]],
    ]);
  });

  it('does not take a numeric first row as titles, or detect titles below the top', () => {
    const numeric = paste(emptyColumn(), { row: 0, col: 0 }, { 'text/plain': '1\t2\n3\t4\n' });
    expect(numeric.after.rows).toHaveLength(2);
    const lower = paste(emptyColumn(), { row: 2, col: 0 }, { 'text/plain': 'a\tb\n3\t4\n' });
    expect(titles(lower.after)).toEqual(['Group A', 'Group B']);
    expect(lower.said.text).toContain(
      '2 cells of text (“a”, “b”) aren’t numbers and were left empty.',
    );
  });

  it('pasting into the title row always sets titles', () => {
    const { after } = paste(emptyColumn(), { row: -1, col: 0 }, { 'text/plain': '5\t6\n' });
    expect(titles(after)).toEqual(['5', '6']);
    expect(after.rows).toHaveLength(0);
  });

  it('fills a selection with a single value', () => {
    const { after } = paste(emptyColumn(), { row: 0, col: 0 }, { 'text/plain': '7\r\n' }, '.', {
      top: 0,
      left: 0,
      bottom: 2,
      right: 1,
    });
    expect(values(after)).toEqual([[[7, 7, 7]], [[7, 7, 7]]]);
  });

  it('keeps summary data to one row and says what did not fit', () => {
    const t = createColumnTable({
      title: 'S',
      groups: [],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const { after, said } = paste(t, { row: 0, col: 0 }, { 'text/plain': '10\t2\t5\n11\t3\t5\n' });
    expect(values(after)).toEqual([[[10], [2], [5]]]);
    expect(said.text).toContain('1 row didn’t fit');
  });

  it('pastes nothing from an empty clipboard', () => {
    expect(pasteInto(emptyColumn(), { row: 0, col: 0 }, {}, '.').edit).toBeNull();
  });
});

describe('copy', () => {
  function tableOf(cols: readonly (readonly Cell[])[], names: readonly string[]) {
    let project = applyEdit(createProject('P'), { op: 'addTable', table: emptyColumn() });
    const t = need([...project.tables.values()][0]);
    const layout = makeLayout(t, { minRows: 1, minDataSets: cols.length });
    const edit = writeEntries(layout, [
      ...names.map((title, col) => ({ pos: { row: -1, col }, title })),
      ...cols.flatMap((cells, col) => cells.map((value, row) => ({ pos: { row, col }, value }))),
    ]);
    if (edit) project = applyEdit(project, edit);
    return need(project.tables.get(t.id));
  }

  it('writes TSV with every digit and a decimal point', () => {
    const t = tableOf(
      [
        [0.1 + 0.2, null],
        [-1e-20, 3],
      ],
      ['a', 'b\tc'],
    );
    const layout = makeLayout(t, { minRows: 1, minDataSets: 1 });
    expect(copyText(layout, { top: -1, left: 0, bottom: 1, right: 1 })).toBe(
      'a\t"b\tc"\r\n0.30000000000000004\t-1e-20\r\n\t3\r\n',
    );
  });

  it('round-trips through paste exactly: copy a table, paste it into an empty one', () => {
    // Titles made of what TSV must quote: quotes, tabs, newlines.
    const title = fc
      .string({
        unit: fc.constantFrom('a', 'B', '"', '\t', '\n', ' ', 'µ', ','),
        minLength: 1,
        maxLength: 8,
      })
      .filter((s) => s.trim() === s && s !== '');
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }).chain((w) =>
          fc.tuple(
            fc.array(fc.array(cellArb, { minLength: 1, maxLength: 6 }), {
              minLength: w,
              maxLength: w,
            }),
            fc.uniqueArray(title, { minLength: w, maxLength: w }),
          ),
        ),
        ([cols, names]) => {
          const source = tableOf(cols, names);
          const layout = makeLayout(source, { minRows: 1, minDataSets: 1 });
          const range = {
            top: -1,
            left: 0,
            bottom: source.rows.length - 1,
            right: cols.length - 1,
          };
          const text = copyText(layout, range);
          const { after } = paste(emptyColumn(), { row: -1, col: 0 }, { 'text/plain': text });
          expect(titles(after)).toEqual(titles(source));
          // Trailing empty rows don't survive a copy (they are blank lines), which is fine.
          const trim = (t: Table) =>
            t.dataSets.map((d) => {
              const c = [...(d.subcolumns[0] ?? [])];
              while (c.length && c.at(-1) === null) c.pop();
              return c;
            });
          expect(trim(after)).toEqual(trim(source));
        },
      ),
      { numRuns: 200 },
    );
  });
});
