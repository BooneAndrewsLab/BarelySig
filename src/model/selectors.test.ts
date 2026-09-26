import { describe, expect, it } from 'vitest';

import { asId } from './ids';
import type { Cell } from './missing';
import {
  DataError,
  columnGroup,
  columnGroups,
  groupedCells,
  nestedGroups,
  pairedGroups,
} from './selectors';
import {
  type CellKey,
  type ColumnTable,
  type EntryFormat,
  type GroupedTable,
  type NestedTable,
  type SummaryStats,
  cellKey,
} from './table';

/** A test cell: a value, empty, or a value the user excluded. */
type T = number | null | { readonly x: number };

const rowId = (r: number) => asId(`r_${String(r)}`);

function dataSet(name: string, subcolumns: readonly (readonly T[])[]) {
  const excluded = new Set<CellKey>();
  const cols = subcolumns.map((col, s) =>
    col.map((c, r): Cell => {
      if (c !== null && typeof c === 'object') {
        excluded.add(cellKey(s, rowId(r)));
        return c.x;
      }
      return c;
    }),
  );
  return { id: asId(`ds_${name}`), title: name, subcolumns: cols, excluded };
}

function column(
  groups: Readonly<Record<string, readonly T[]>>,
  format: EntryFormat = { kind: 'replicates', count: 1 },
): ColumnTable {
  const n = Math.max(0, ...Object.values(groups).map((g) => g.length));
  return {
    id: asId('t_1'),
    type: 'column',
    title: 'T',
    format,
    rows: Array.from({ length: n }, (_, r) => ({ id: rowId(r), title: null })),
    dataSets: Object.entries(groups).map(([name, cells]) =>
      dataSet(name, [[...cells, ...Array<null>(n - cells.length).fill(null)]]),
    ),
  };
}

/** Summary data: one row, one subcolumn per stat. */
function summary(stats: SummaryStats, groups: Readonly<Record<string, readonly T[]>>): ColumnTable {
  return {
    id: asId('t_1'),
    type: 'column',
    title: 'T',
    format: { kind: 'summary', stats },
    rows: [{ id: rowId(0), title: null }],
    dataSets: Object.entries(groups).map(([name, values]) =>
      dataSet(
        name,
        values.map((v) => [v]),
      ),
    ),
  };
}

/** Nested table: one data set per group, one subcolumn per biological replicate, ragged. */
function nested(
  count: number,
  groups: Readonly<Record<string, readonly (readonly T[])[]>>,
): NestedTable {
  const n = Math.max(0, ...Object.values(groups).flatMap((reps) => reps.map((r) => r.length)));
  return {
    id: asId('t_1'),
    type: 'nested',
    title: 'T',
    format: { kind: 'replicates', count },
    rows: Array.from({ length: n }, (_, r) => ({ id: rowId(r), title: null })),
    dataSets: Object.entries(groups).map(([name, reps]) =>
      dataSet(
        name,
        Array.from({ length: count }, (_, s) => {
          const rep = reps[s] ?? [];
          return [...rep, ...Array<null>(n - rep.length).fill(null)];
        }),
      ),
    ),
  };
}

const ds = (name: string) => asId(`ds_${name}`);

/** Every sequence of `states` of the given length. */
function* sequences<S>(states: readonly S[], length: number): Generator<S[]> {
  if (length === 0) {
    yield [];
    return;
  }
  for (const head of states)
    for (const tail of sequences(states, length - 1)) yield [head, ...tail];
}

const STATES: readonly T[] = [null, 0, 2.5, { x: 7 }];

describe('columnGroup, raw replicates', () => {
  it('keeps zeros and drops empty cells', () => {
    expect(columnGroup(column({ a: [1, null, 0, 3] }), ds('a'))).toEqual({
      kind: 'raw',
      values: [1, 0, 3],
      dropped: { empty: 1, excluded: 0 },
    });
  });

  it('does not count the blank tail of a column shorter than the others', () => {
    const t = column({ a: [1, 2], b: [1, 2, 3, 4, 5] });
    expect(columnGroup(t, ds('a'))).toEqual({
      kind: 'raw',
      values: [1, 2],
      dropped: { empty: 0, excluded: 0 },
    });
  });

  it('leaves out excluded values and counts them', () => {
    expect(columnGroup(column({ a: [1, { x: 99 }, 3] }), ds('a'))).toEqual({
      kind: 'raw',
      values: [1, 3],
      dropped: { empty: 0, excluded: 1 },
    });
  });

  it('matches a reference for every column of up to 5 cells', () => {
    for (let n = 0; n <= 5; n += 1) {
      for (const cells of sequences(STATES, n)) {
        const got = columnGroup(column({ a: cells, pad: Array<T>(6).fill(1) }), ds('a'));
        const lastFilled = cells.reduce<number>((last, c, i) => (c === null ? last : i), -1);
        const expected = {
          kind: 'raw',
          values: cells.filter((c): c is number => typeof c === 'number'),
          dropped: {
            empty: cells.slice(0, lastFilled + 1).filter((c) => c === null).length,
            excluded: cells.filter((c) => c !== null && typeof c === 'object').length,
          },
        };
        expect(got, JSON.stringify(cells)).toEqual(expected);
      }
    }
  });

  it('labels groups by title, in the order asked', () => {
    const t = column({ a: [1], b: [2] });
    expect(columnGroups(t, [ds('b'), ds('a')]).map((g) => g.title)).toEqual(['b', 'a']);
  });

  it('refuses a data set that is not in the table', () => {
    expect(() => columnGroup(column({ a: [1] }), ds('zz'))).toThrow(DataError);
  });
});

describe('columnGroup, summary data', () => {
  it('passes mean, SD and n through', () => {
    expect(columnGroup(summary('mean-sd-n', { a: [10, 2, 5] }), ds('a'))).toEqual({
      kind: 'summary',
      mean: 10,
      sd: 2,
      n: 5,
      interval: null,
      entered: 'mean-sd-n',
    });
  });

  it('converts SEM to SD with n', () => {
    const g = columnGroup(summary('mean-sem-n', { a: [10, 2, 4] }), ds('a'));
    expect(g).toMatchObject({ mean: 10, sd: 4, n: 4, entered: 'mean-sem-n' });
  });

  it('converts CV (a percentage) to SD', () => {
    const g = columnGroup(summary('mean-cv-n', { a: [50, 10, 3] }), ds('a'));
    expect(g).toMatchObject({ mean: 50, sd: 5, n: 3 });
  });

  it('takes the size of a negative mean for CV, so SD is not negative', () => {
    expect(columnGroup(summary('mean-cv', { a: [-50, 10] }), ds('a'))).toMatchObject({
      sd: 5,
      n: null,
    });
  });

  it('cannot convert SEM without n', () => {
    expect(columnGroup(summary('mean-sem', { a: [10, 2] }), ds('a'))).toMatchObject({
      mean: 10,
      sd: null,
      n: null,
    });
    expect(columnGroup(summary('mean-sem-n', { a: [10, 2, null] }), ds('a'))).toMatchObject({
      sd: null,
      n: null,
    });
  });

  it('treats an excluded or empty stat as missing, not zero', () => {
    expect(columnGroup(summary('mean-sd-n', { a: [null, 2, { x: 5 }] }), ds('a'))).toMatchObject({
      mean: null,
      sd: 2,
      n: null,
    });
  });

  it('passes an interval through for graphs, with no SD or n', () => {
    expect(columnGroup(summary('mean-lower-upper', { a: [10, 8.5, 11.5] }), ds('a'))).toEqual({
      kind: 'summary',
      mean: 10,
      sd: null,
      n: null,
      interval: { lower: 8.5, upper: 11.5 },
      entered: 'mean-lower-upper',
    });
  });

  it('passes a typed-in nonsense value on for the analysis to report', () => {
    expect(columnGroup(summary('mean-sd-n', { a: [1, -2, 2.5] }), ds('a'))).toMatchObject({
      sd: -2,
      n: 2.5,
    });
  });
});

describe('pairedGroups', () => {
  it('pairs by row and drops a row missing on either side', () => {
    const t = column({ a: [1, 2, null, 4, { x: 5 }], b: [10, null, 30, 40, 50] });
    expect(pairedGroups(t, ds('a'), ds('b'))).toEqual({
      pairs: [
        { row: rowId(0), a: 1, b: 10 },
        { row: rowId(3), a: 4, b: 40 },
      ],
      droppedRows: 3,
    });
  });

  it('matches a reference for every pair of columns of 3 cells', () => {
    for (const a of sequences(STATES, 3)) {
      for (const b of sequences(STATES, 3)) {
        const got = pairedGroups(column({ a, b }), ds('a'), ds('b'));
        const pairs = a.flatMap((va, r) => {
          const vb = b[r] ?? null;
          return typeof va === 'number' && typeof vb === 'number'
            ? [{ row: rowId(r), a: va, b: vb }]
            : [];
        });
        const touched = a.filter((va, r) => va !== null || (b[r] ?? null) !== null).length;
        expect(got, JSON.stringify([a, b])).toEqual({ pairs, droppedRows: touched - pairs.length });
      }
    }
  });

  it('refuses summary data', () => {
    expect(() =>
      pairedGroups(summary('mean-sd-n', { a: [1, 1, 3], b: [2, 1, 3] }), ds('a'), ds('b')),
    ).toThrow(/needs the individual values/);
  });
});

describe('groupedCells', () => {
  const grouped = (
    format: EntryFormat,
    cells: Readonly<Record<string, readonly (readonly T[])[]>>,
  ): GroupedTable => ({
    id: asId('t_g'),
    type: 'grouped',
    title: 'G',
    format,
    rows: [
      { id: rowId(0), title: 'WT' },
      { id: rowId(1), title: 'KO' },
    ],
    dataSets: Object.entries(cells).map(([name, subs]) => dataSet(name, subs)),
  });

  it('gives the replicates of each row × column cell, keeping empty cells as structure', () => {
    const t = grouped(
      { kind: 'replicates', count: 3 },
      {
        ctrl: [
          [1, 4],
          [2, null],
          [3, { x: 9 }],
        ],
        drug: [
          [null, null],
          [null, null],
          [null, null],
        ],
      },
    );
    const g = groupedCells(t);
    expect(g.rows.map((r) => r.title)).toEqual(['WT', 'KO']);
    expect(g.dataSets.map((d) => d.title)).toEqual(['ctrl', 'drug']);
    expect(g.cells).toEqual([
      [
        { kind: 'raw', values: [1, 2, 3], dropped: { empty: 0, excluded: 0 } },
        { kind: 'raw', values: [], dropped: { empty: 3, excluded: 0 } },
      ],
      [
        { kind: 'raw', values: [4], dropped: { empty: 1, excluded: 1 } },
        { kind: 'raw', values: [], dropped: { empty: 3, excluded: 0 } },
      ],
    ]);
  });

  it('gives summary data per cell', () => {
    const t = grouped(
      { kind: 'summary', stats: 'mean-sem-n' },
      {
        ctrl: [
          [5, 6],
          [1, 1],
          [4, 9],
        ],
      },
    );
    expect(groupedCells(t).cells).toEqual([
      [{ kind: 'summary', mean: 5, sd: 2, n: 4, interval: null, entered: 'mean-sem-n' }],
      [{ kind: 'summary', mean: 6, sd: 3, n: 9, interval: null, entered: 'mean-sem-n' }],
    ]);
  });
});

describe('nestedGroups', () => {
  it('collects each replicate subcolumn separately, ragged', () => {
    const t = nested(3, {
      a: [[1, 2, 3], [4, 5], [6]],
    });
    expect(nestedGroups(t, [ds('a')])).toEqual([
      {
        id: ds('a'),
        title: 'a',
        replicates: [
          { kind: 'raw', values: [1, 2, 3], dropped: { empty: 0, excluded: 0 } },
          { kind: 'raw', values: [4, 5], dropped: { empty: 0, excluded: 0 } },
          { kind: 'raw', values: [6], dropped: { empty: 0, excluded: 0 } },
        ],
      },
    ]);
  });

  it('keeps an empty replicate, counted, instead of dropping it', () => {
    const t = nested(2, { a: [[1, 2], []] });
    expect(nestedGroups(t, [ds('a')])[0]?.replicates).toEqual([
      { kind: 'raw', values: [1, 2], dropped: { empty: 0, excluded: 0 } },
      { kind: 'raw', values: [], dropped: { empty: 0, excluded: 0 } },
    ]);
  });

  it('leaves out excluded values within a replicate and counts them', () => {
    const t = nested(1, { a: [[1, { x: 2 }, 3]] });
    expect(nestedGroups(t, [ds('a')])[0]?.replicates).toEqual([
      { kind: 'raw', values: [1, 3], dropped: { empty: 0, excluded: 1 } },
    ]);
  });

  it('defaults to every data set in table order', () => {
    const t = nested(1, { a: [[1]], b: [[2]] });
    expect(nestedGroups(t).map((g) => g.title)).toEqual(['a', 'b']);
  });
});
