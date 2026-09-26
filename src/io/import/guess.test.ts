import fc from 'fast-check';

import type { Cell } from '@/model/missing';
import { type Table, createColumnTable, createGroupedTable } from '@/model/table';
import { validateTable } from '@/model/validate';
import { cellArb } from '@/test/modelArbitraries';
import { copyText } from '@/ui/grid/clipboard';
import { makeLayout } from '@/ui/grid/layout';

import { parseDelimited } from './delimited';
import {
  type ImportChoice,
  type ImportResult,
  buildTable,
  guessLayout,
  guessSkip,
  markKey,
  splitStat,
  splitUnit,
  statOf,
} from './guess';
import type { SourceCell, SourceSheet } from './sheets';

const sheet = (cells: readonly (readonly SourceCell[])[], name = 'Sheet1'): SourceSheet => {
  const width = Math.max(0, ...cells.map((r) => r.length));
  return {
    name,
    cells: cells.map((r) => [...r, ...Array<string>(width - r.length).fill('')]),
    truncated: false,
  };
};

/** A sheet from CSV text (comma-separated, one row per line). */
const csv = (text: string): SourceSheet => sheet(parseDelimited(text.trim(), ','));

function build(s: SourceSheet, change: Partial<ImportChoice> = {}): ImportResult {
  const g = guessLayout(s, '.');
  const r = buildTable(s, { ...g.choice, ...change }, 'Data');
  if (!r) throw new Error('no table');
  expect(validateTable(r.table)).toEqual([]);
  return r;
}

const values = (r: ImportResult) =>
  r.table.dataSets.map((d) => ({ title: d.title, subcolumns: d.subcolumns }));

describe('words in headers', () => {
  it('recognises statistics', () => {
    expect(statOf('Mean')).toBe('mean');
    expect(statOf('St. Dev.')).toBe('sd');
    expect(statOf('S.E.M.')).toBe('sem');
    expect(statOf('%CV')).toBe('cv');
    expect(statOf('N')).toBe('n');
    expect(statOf('WT')).toBeNull();
    expect(statOf('Mouse')).toBeNull();
  });

  it('splits a group from its statistic', () => {
    expect(splitStat('WT mean')).toEqual({ group: 'WT', stat: 'mean' });
    expect(splitStat('KO_SD')).toEqual({ group: 'KO', stat: 'sd' });
    expect(splitStat('Drug A (SEM)')).toEqual({ group: 'Drug A', stat: 'sem' });
    expect(splitStat('Mean of Control')).toEqual({ group: 'Control', stat: 'mean' });
    expect(splitStat('Mouse')).toBeNull();
    expect(splitStat('Drugs')).toBeNull();
  });

  it('splits a unit off a title, but not a count', () => {
    expect(splitUnit('Weight (g)')).toEqual({ name: 'Weight', unit: 'g' });
    expect(splitUnit('Area [mm²]')).toEqual({ name: 'Area', unit: 'mm²' });
    expect(splitUnit('WT (n=5)')).toEqual({ name: 'WT (n=5)', unit: null });
    expect(splitUnit('WT')).toEqual({ name: 'WT', unit: null });
  });
});

describe('each column a group', () => {
  it('reads titles and ragged columns, empty as null', () => {
    const r = build(csv('WT,KO,Het\n1.5,2,3\n1.7,,3.5\n1.6'));
    expect(r.table.type).toBe('column');
    expect(values(r)).toEqual([
      { title: 'WT', subcolumns: [[1.5, 1.7, 1.6]] },
      { title: 'KO', subcolumns: [[2, null, null]] },
      { title: 'Het', subcolumns: [[3, 3.5, null]] },
    ]);
    expect(r.notes.values).toBe(6);
  });

  it('names groups when there are no titles', () => {
    const r = build(csv('1,2\n3,4'));
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['Group A', 'Group B']);
    expect(r.table.dataSets[0]?.subcolumns).toEqual([[1, 3]]);
  });

  it('reads titles that are numbers when told the first row holds titles', () => {
    const s = csv('0,10,100\n1,2,3\n4,5,6');
    expect(guessLayout(s, '.').choice.header).toBe(false);
    const r = build(s, { header: true });
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['0', '10', '100']);
  });

  it('marks text and counts missing markers, never 0', () => {
    const r = build(csv('WT,KO\n1,NA\nbad well,#DIV/0!\n3,4'));
    expect(r.table.dataSets[0]?.subcolumns[0]).toEqual([1, null, 3]);
    expect(r.table.dataSets[1]?.subcolumns[0]).toEqual([null, null, 4]);
    expect(r.marks.get(markKey(0, 0, 1))).toBe('bad well');
    expect(r.marks.size).toBe(1);
    expect(r.notes.text).toEqual({ count: 1, examples: ['bad well'] });
    expect(r.notes.missing).toEqual(
      new Map([
        ['NA', 1],
        ['#DIV/0!', 1],
      ]),
    );
  });

  it('leaves out a column of text and a replicate counter', () => {
    const r = build(csv('Rep,WT,KO,Notes\n1,5,6,ok\n2,5.5,6.5,\n3,5.2,6.1,redo'));
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['WT', 'KO']);
    expect(r.notes.leftOut).toEqual(['Rep', 'Notes']);
  });

  it('moves a unit every title shares to the table', () => {
    const r = build(csv('WT (mg),KO (mg)\n1,2'));
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['WT', 'KO']);
    expect(r.table.unit).toBe('mg');
    expect(r.notes.unit).toBe('mg');
    const mixed = build(csv('Drug (1 µM),Drug (10 µM)\n1,2'));
    expect(mixed.table.dataSets.map((d) => d.title)).toEqual(['Drug (1 µM)', 'Drug (10 µM)']);
    expect(mixed.table.unit).toBeUndefined();
  });

  it('reads a decimal comma, decided for the whole sheet', () => {
    const s = sheet(parseDelimited('WT;KO\n1,5;2,25\n1,234;3', ';'));
    const g = guessLayout(s, '.');
    expect(g.choice.decimal).toBe(',');
    const r = build(s);
    expect(r.table.dataSets[0]?.subcolumns[0]).toEqual([1.5, 1.234]);
    expect(r.notes.decimal).toBe(',');
  });

  it('keeps spreadsheet numbers as they are, whatever the decimal mark', () => {
    const r = build(
      sheet([
        ['WT', 'KO'],
        [0.1 + 0.2, '1,5'],
        [{ percent: 85 }, 2],
      ]),
    );
    expect(r.table.dataSets[0]?.subcolumns[0]).toEqual([0.1 + 0.2, 85]);
    expect(r.table.dataSets[1]?.subcolumns[0]).toEqual([1.5, 2]);
    expect(r.notes.percent).toBe(1);
  });
});

describe('rows above the table', () => {
  it('skips a title and a preamble', () => {
    const s = csv('Plate reader export\nSoftware,3.08\n\nWT,KO,Het\n1,2,3\n4,5,6\n7,8,9');
    expect(guessSkip(s)).toBe(3);
    const r = build(s);
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['WT', 'KO', 'Het']);
    expect(r.notes.skipped).toBe(3);
  });

  it('keeps the top row of a two-row header', () => {
    expect(guessSkip(csv(',WT,,,KO,,\n,1,2,3,1,2,3\nA,1,2,3,4,5,6\nB,1,2,3,4,5,6'))).toBe(0);
  });

  it('skips a title right above the table', () => {
    expect(guessSkip(csv('Experiment 3\nWT,KO,Het\n1,2,3\n4,5,6'))).toBe(1);
  });

  it('keeps sparse first rows of the table', () => {
    expect(guessSkip(csv('Genotype,WT,,,KO,,\nA,1,,,,,\nB,1,2,3,4,5,6\nC,1,2,3,4,5,6'))).toBe(0);
  });

  it('skips nothing when the table starts at the top', () => {
    expect(guessSkip(csv('WT\n1\n2'))).toBe(0);
    expect(guessSkip(sheet(parseDelimited('\n\nWT,KO\n1,2', ',')))).toBe(2);
  });
});

describe('rows × columns', () => {
  it('reads repeated titles as replicates', () => {
    const s = csv('Genotype,WT,WT,KO,KO\nControl,1,2,3,4\nDrug,5,6,7,');
    const g = guessLayout(s, '.');
    expect(g.choice.layout).toBe('grouped');
    const r = build(s);
    expect(r.table.type).toBe('grouped');
    expect(r.table.format).toEqual({ kind: 'replicates', count: 2 });
    expect(r.table.rows.map((x) => x.title)).toEqual(['Control', 'Drug']);
    expect(values(r)).toEqual([
      {
        title: 'WT',
        subcolumns: [
          [1, 5],
          [2, 6],
        ],
      },
      {
        title: 'KO',
        subcolumns: [
          [3, 7],
          [4, null],
        ],
      },
    ]);
  });

  it('reads a merged or blank-continued title over a row of replicate numbers', () => {
    const r = build(csv(',WT,,,KO,,\n,1,2,3,1,2,3\nA,1,2,3,4,5,6\nB,7,8,9,10,11,12'));
    expect(r.table.format).toEqual({ kind: 'replicates', count: 3 });
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['WT', 'KO']);
    expect(r.table.dataSets[1]?.subcolumns).toEqual([
      [4, 10],
      [5, 11],
      [6, 12],
    ]);
    expect(r.table.rows.map((x) => x.title)).toEqual(['A', 'B']);
  });

  it('reads distinct titles as one replicate each', () => {
    const r = build(csv('Time,Control,Drug\n0 h,1,2\n24 h,3,4'));
    expect(r.table.type).toBe('grouped');
    expect(r.table.format).toEqual({ kind: 'replicates', count: 1 });
  });

  it('reads replicate labels beside distinct titles as a Column table', () => {
    const s = csv('Mouse,WT,KO\nMouse 1,1,2\nMouse 2,3,4\nMouse 3,5,6');
    expect(guessLayout(s, '.').choice.layout).toBe('columns');
    const r = build(s);
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['WT', 'KO']);
    expect(r.notes.leftOut).toEqual(['Mouse']);
  });

  it('swaps the factors on request', () => {
    const r = build(csv('Genotype,WT,WT,KO,KO\nControl,1,2,3,4\nDrug,5,6,7,8'), { swap: true });
    expect(r.table.dataSets.map((d) => d.title)).toEqual(['Control', 'Drug']);
    expect(r.table.rows.map((x) => x.title)).toEqual(['WT', 'KO']);
    expect(r.table.dataSets[1]?.subcolumns).toEqual([
      [5, 7],
      [6, 8],
    ]);
  });
});

describe('summary data', () => {
  it('reads one row per group with a column per statistic', () => {
    const s = csv('Group,Mean,SD,N\nWT,5.5,1.25,4\nKO,3.25,0.5,5');
    const g = guessLayout(s, '.');
    expect(g.choice.layout).toBe('summary');
    const r = build(s);
    expect(r.table.type).toBe('column');
    expect(r.table.format).toEqual({ kind: 'summary', stats: 'mean-sd-n' });
    expect(values(r)).toEqual([
      { title: 'WT', subcolumns: [[5.5], [1.25], [4]] },
      { title: 'KO', subcolumns: [[3.25], [0.5], [5]] },
    ]);
  });

  it('reads groups across with the statistic in the title, in format order', () => {
    const r = build(csv('WT n,WT mean,WT SEM,KO n,KO mean,KO SEM\n4,5.5,0.6,5,3.25,0.2'));
    expect(r.table.type).toBe('column');
    expect(r.table.format).toEqual({ kind: 'summary', stats: 'mean-sem-n' });
    expect(values(r)).toEqual([
      { title: 'WT', subcolumns: [[5.5], [0.6], [4]] },
      { title: 'KO', subcolumns: [[3.25], [0.2], [5]] },
    ]);
  });

  it('reads group titles over a row of statistics, with row titles', () => {
    const r = build(
      csv(',WT,,,KO,,\n,Mean,SD,N,Mean,SD,N\nControl,1,0.1,3,2,0.2,3\nDrug,3,0.3,3,4,0.4,3'),
    );
    expect(r.table.type).toBe('grouped');
    expect(r.table.format).toEqual({ kind: 'summary', stats: 'mean-sd-n' });
    expect(r.table.rows.map((x) => x.title)).toEqual(['Control', 'Drug']);
    expect(r.table.dataSets[1]?.subcolumns).toEqual([
      [2, 4],
      [0.2, 0.4],
      [3, 3],
    ]);
  });

  it('uses SD when SEM is there too, and says so', () => {
    const r = build(csv('Group,Mean,SD,SEM,N\nWT,5,1,0.5,4'));
    expect(r.table.format).toEqual({ kind: 'summary', stats: 'mean-sd-n' });
    expect(r.notes.unusedStats).toEqual(['SEM']);
  });

  it('reads two label columns as two factors', () => {
    const r = build(
      csv('Genotype,Treatment,Mean,SD\nWT,Control,1,0.1\nWT,Drug,2,0.2\nKO,Control,3,0.3'),
    );
    expect(r.table.type).toBe('grouped');
    expect(r.table.format).toEqual({ kind: 'summary', stats: 'mean-sd' });
    expect(r.table.rows.map((x) => x.title)).toEqual(['WT', 'KO']);
    expect(values(r)).toEqual([
      {
        title: 'Control',
        subcolumns: [
          [1, 3],
          [0.1, 0.3],
        ],
      },
      {
        title: 'Drug',
        subcolumns: [
          [2, null],
          [0.2, null],
        ],
      },
    ]);
  });

  it('needs a mean and a spread', () => {
    const g = guessLayout(csv('Group,Mean\nWT,5\nKO,6'), '.');
    expect(g.possible).not.toContain('summary');
  });
});

describe('one row per measurement', () => {
  it('reshapes one factor into a Column table', () => {
    const s = csv('Mouse,Genotype,Weight (g)\n1,WT,20\n2,KO,18\n3,WT,21\n4,KO,NA\n5,,19');
    const g = guessLayout(s, '.');
    expect(g.choice.layout).toBe('long');
    const r = build(s);
    expect(r.table.type).toBe('column');
    expect(values(r)).toEqual([
      { title: 'WT', subcolumns: [[20, 21]] },
      { title: 'KO', subcolumns: [[18, null]] },
    ]);
    expect(r.table.valueTitle).toBe('Weight');
    expect(r.table.unit).toBe('g');
    expect(r.notes.reshaped).toBe(true);
    expect(r.notes.unlabelled).toBe(1);
    expect(r.notes.missing.get('NA')).toBe(1);
    expect(r.notes.leftOut).toEqual(['Mouse']);
  });

  it('reshapes two factors into a Grouped table', () => {
    const s = csv(
      'Genotype,Treatment,Value\nWT,Ctrl,1\nWT,Ctrl,2\nWT,Drug,3\nKO,Ctrl,4\nKO,Drug,5\nKO,Drug,6',
    );
    const g = guessLayout(s, '.');
    expect(g.choice.factorColumn).toBe(1);
    const r = build(s);
    expect(r.table.type).toBe('grouped');
    expect(r.table.format).toEqual({ kind: 'replicates', count: 2 });
    expect(r.table.rows.map((x) => x.title)).toEqual(['WT', 'KO']);
    expect(values(r)).toEqual([
      {
        title: 'Ctrl',
        subcolumns: [
          [1, 4],
          [2, null],
        ],
      },
      {
        title: 'Drug',
        subcolumns: [
          [3, 5],
          [null, 6],
        ],
      },
    ]);
  });

  it('lets the user pick the columns, and drop the second factor', () => {
    const s = csv('Genotype,Treatment,Value\nWT,Ctrl,1\nWT,Drug,3\nKO,Ctrl,4\nKO,Drug,5');
    const r = build(s, { groupColumn: 1, factorColumn: null });
    expect(r.table.type).toBe('column');
    expect(values(r)).toEqual([
      { title: 'Ctrl', subcolumns: [[1, 4]] },
      { title: 'Drug', subcolumns: [[3, 5]] },
    ]);
  });
});

describe('what can be made', () => {
  it('lists every layout that makes a table, the guess first', () => {
    const g = guessLayout(csv('Genotype,WT,WT,KO,KO\nControl,1,2,3,4\nDrug,5,6,7,8'), '.');
    expect(g.possible[0]).toBe('grouped');
    expect(g.possible).toContain('columns');
    expect(g.possible).not.toContain('summary');
  });

  it('finds nothing to make from text alone', () => {
    const g = guessLayout(csv('a,b\nc,d'), '.');
    expect(g.possible).toEqual([]);
    expect(buildTable(csv('a,b\nc,d'), g.choice, 'x')).toBeNull();
  });
});

describe('reading back what the grid copies', () => {
  const name = fc
    .string({ unit: fc.constantFrom('x', 'y', 'Q', 'é', 'k', ' '), minLength: 1, maxLength: 5 })
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const zero = (v: Cell) => (v === 0 ? 0 : v);
  const trimmed = (t: Table) =>
    t.dataSets.map((d) =>
      d.subcolumns.map((c) => {
        const out = c.map(zero);
        if (t.type === 'column') while (out.length && out.at(-1) === null) out.pop();
        return out;
      }),
    );
  // A column with no title and no value isn't in the text at all.
  const hasValue = (t: Table) =>
    t.dataSets.every((d) => d.subcolumns.every((c) => c.some((v) => v !== null)));

  function readBack(table: Table): ImportResult {
    const layout = makeLayout(table, { minRows: 1, minDataSets: 1 });
    const text = copyText(layout, {
      top: -1,
      left: table.type === 'grouped' ? -1 : 0,
      bottom: table.rows.length - 1,
      right: layout.columns.filter((c) => c.dataSet !== null).length - 1,
    });
    const s = sheet(parseDelimited(text, '\t'));
    const g = guessLayout(s, '.');
    expect(g.choice.layout).toBe(table.type === 'column' ? 'columns' : 'grouped');
    const r = buildTable(s, g.choice, 'x');
    if (!r) throw new Error('no table');
    return r;
  }

  it('gives back a Column table', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }).chain((w) =>
          fc.tuple(
            fc.uniqueArray(name, { minLength: w, maxLength: w }),
            fc.array(fc.array(cellArb, { minLength: 1, maxLength: 6 }), {
              minLength: w,
              maxLength: w,
            }),
          ),
        ),
        ([titles, cols]) => {
          const rows = Math.max(...cols.map((c) => c.length));
          const table = createColumnTable({ title: 'x', groups: titles, rows });
          const filled: Table = {
            ...table,
            dataSets: table.dataSets.map((d, i) => ({
              ...d,
              subcolumns: [Array.from({ length: rows }, (_, r) => cols[i]?.[r] ?? null)],
            })),
          };
          fc.pre(hasValue(filled));
          const r = readBack(filled);
          expect(r.table.dataSets.map((d) => d.title)).toEqual(titles);
          expect(trimmed(r.table)).toEqual(trimmed(filled));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('gives back a Grouped table', () => {
    const shape = fc
      .tuple(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
      )
      .chain(([sets, reps, rows]) =>
        fc.record({
          reps: fc.constant(reps),
          titles: fc.uniqueArray(name, { minLength: sets, maxLength: sets }),
          rowTitles: fc.uniqueArray(name, { minLength: rows, maxLength: rows }),
          cells: fc.array(cellArb, {
            minLength: sets * reps * rows,
            maxLength: sets * reps * rows,
          }),
        }),
      );
    fc.assert(
      fc.property(shape, ({ reps, titles, rowTitles, cells }) => {
        const table = createGroupedTable({
          title: 'x',
          rowTitles,
          groups: titles,
          format: { kind: 'replicates', count: reps },
        });
        let next = 0;
        const filled: Table = {
          ...table,
          dataSets: table.dataSets.map((d) => ({
            ...d,
            subcolumns: d.subcolumns.map((c) => c.map(() => cells[next++] ?? null)),
          })),
        };
        fc.pre(hasValue(filled));
        const r = readBack(filled);
        expect(r.table.format).toEqual({ kind: 'replicates', count: reps });
        expect(r.table.dataSets.map((d) => d.title)).toEqual(titles);
        expect(r.table.rows.map((x) => x.title)).toEqual(rowTitles);
        expect(trimmed(r.table)).toEqual(trimmed(filled));
      }),
      { numRuns: 300 },
    );
  });
});
