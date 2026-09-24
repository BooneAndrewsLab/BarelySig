import { describe, expect, it } from 'vitest';

import { asId } from './ids';
import {
  type Table,
  cellKey,
  createColumnTable,
  createGroupedTable,
  duplicateTable,
} from './table';
import { validateTable } from './validate';

/** Types a hand-broken table as a table. */
const broken = (t: Table): Table => t;

const base = (): Table => createColumnTable({ title: 'T', groups: ['A'], rows: 2 });

function withFirstDataSet(t: Table, patch: object): Table {
  const [d, ...rest] = t.dataSets;
  if (!d) throw new Error('unreachable');
  return { ...t, dataSets: [{ ...d, ...patch }, ...rest] };
}

describe('validateTable', () => {
  it('accepts new tables of every kind', () => {
    expect(validateTable(base())).toEqual([]);
    expect(
      validateTable(
        createColumnTable({
          title: 'S',
          groups: ['A'],
          format: { kind: 'summary', stats: 'mean-sem' },
        }),
      ),
    ).toEqual([]);
    expect(
      validateTable(
        createGroupedTable({
          title: 'G',
          rowTitles: ['a', 'b'],
          groups: ['x'],
          format: { kind: 'replicates', count: 3 },
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'NaN in a cell',
      withFirstDataSet(base(), { subcolumns: [[Number.NaN, null]] }),
      /not a finite number/,
    ],
    ['a short subcolumn', withFirstDataSet(base(), { subcolumns: [[1]] }), /1 cells for 2 rows/],
    [
      'too many subcolumns',
      withFirstDataSet(base(), {
        subcolumns: [
          [1, 2],
          [3, 4],
        ],
      }),
      /format needs 1/,
    ],
    [
      'an excluded empty cell',
      ((t: Table) =>
        withFirstDataSet(t, {
          excluded: new Set([cellKey(0, (t.rows[0] as { id: ReturnType<typeof asId> }).id)]),
        }))(base()),
      /is empty/,
    ],
    [
      'an excluded cell of a missing row',
      withFirstDataSet(base(), { excluded: new Set([cellKey(0, asId('r_gone'))]) }),
      /does not exist/,
    ],
    ['decimals out of range', withFirstDataSet(base(), { decimals: 16 }), /decimals 16/],
    [
      'a Column table with replicate subcolumns',
      broken({ ...base(), format: { kind: 'replicates', count: 2 } }),
      /one replicate subcolumn/,
    ],
    [
      'a Column table of summary data with two rows',
      broken({
        ...createColumnTable({
          title: 'S',
          groups: [],
          format: { kind: 'summary', stats: 'mean-sd-n' },
        }),
        rows: [
          { id: asId('r_1'), title: null },
          { id: asId('r_2'), title: null },
        ],
      }),
      /one row, not 2/,
    ],
    [
      'a repeated row id',
      broken({
        ...base(),
        rows: [
          { id: asId('r_1'), title: null },
          { id: asId('r_1'), title: null },
        ],
      }),
      /repeated/,
    ],
  ])('reports %s', (_, table, message) => {
    expect(validateTable(table).join('\n')).toMatch(message);
  });
});

describe('duplicateTable', () => {
  it('copies values and exclusions under fresh ids', () => {
    const t = createColumnTable({ title: 'T', groups: ['A'], rows: 2 });
    const [d] = t.dataSets;
    const [r0] = t.rows;
    if (!d || !r0) throw new Error('unreachable');
    const filled: Table = {
      ...t,
      dataSets: [{ ...d, subcolumns: [[5, null]], excluded: new Set([cellKey(0, r0.id)]) }],
    };
    const copy = duplicateTable(filled, 'T copy');
    expect(validateTable(copy)).toEqual([]);
    expect(copy.title).toBe('T copy');
    expect(copy.id).not.toBe(t.id);
    expect(copy.rows[0]?.id).not.toBe(r0.id);
    expect(copy.dataSets[0]?.id).not.toBe(d.id);
    expect(copy.dataSets[0]?.subcolumns).toEqual([[5, null]]);
    expect([...(copy.dataSets[0]?.excluded ?? [])]).toEqual([
      cellKey(0, copy.rows[0]?.id ?? asId('')),
    ]);
  });
});
