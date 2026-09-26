import { describe, expect, it } from 'vitest';

import { type Edit, applyEdit } from '@/model/edits';
import { type Project, createProject } from '@/model/project';
import {
  type Table,
  createColumnTable,
  createGroupedTable,
  createNestedTable,
} from '@/model/table';
import { validateProject } from '@/model/validate';

import {
  clearRange,
  deleteDataSets,
  fillDown,
  insertDataSet,
  insertRows,
  toggleExcluded,
  typeInto,
  writeEntries,
} from './commands';
import { editorExit, gridAction } from './keys';
import { type GridLayout, letters, makeLayout } from './layout';
import { decimalSeparatorOf, editText, formatCell, parseCell } from './numbers';
import { type NavCommand, type NavState, at, jump, navigate, rangeOf } from './selection';

const SIZE = { minRows: 10, minDataSets: 3 };

function setup(table: Table) {
  let project: Project = applyEdit(createProject('P'), { op: 'addTable', table });
  const current = (): Table => {
    const t = project.tables.get(table.id);
    if (!t) throw new Error('table gone');
    return t;
  };
  const layout = (): GridLayout => makeLayout(current(), SIZE);
  const run = (edit: Edit | null) => {
    if (!edit) return;
    project = applyEdit(project, edit);
    expect(validateProject(project)).toEqual([]);
  };
  const type = (row: number, col: number, text: string) => {
    const r = typeInto(layout(), { row, col }, text, '.');
    if (!r.ok) throw new Error(r.message);
    run(r.edit);
  };
  const values = () => current().dataSets.map((d) => d.subcolumns);
  return { current, layout, run, type, values };
}

const column = () => setup(createColumnTable({ title: 'T', groups: [] }));
const nested = () => setup(createNestedTable({ title: 'N', groups: ['ctrl'], replicates: 2 }));

describe('parseCell', () => {
  it.each([
    ['1.5', 1.5],
    ['-2', -2],
    ['+3', 3],
    ['1e-5', 1e-5],
    ['1.2E+10', 1.2e10],
    ['−4.5', -4.5],
    ['  7  ', 7],
    ['1,234.5', 1234.5],
    ["1'234.5", 1234.5],
    ['1 234.5', 1234.5],
    ['.5', 0.5],
    ['5.', 5],
    ['-0', 0],
  ])('reads %s with a decimal point', (text, value) => {
    expect(parseCell(text, '.')).toEqual({ kind: 'number', value, percent: false });
  });

  it.each([
    ['1,5', 1.5],
    ['1.234,5', 1234.5],
    ['1 234,5', 1234.5],
    ['-0,001', -0.001],
  ])('reads %s with a decimal comma', (text, value) => {
    expect(parseCell(text, ',')).toMatchObject({ kind: 'number', value });
  });

  it('keeps a percentage as the number shown', () => {
    expect(parseCell('85%', '.')).toEqual({ kind: 'number', value: 85, percent: true });
  });

  it('reads empty text as an empty cell, never zero', () => {
    expect(parseCell('', '.')).toEqual({ kind: 'empty' });
    expect(parseCell('   ', '.')).toEqual({ kind: 'empty' });
  });

  it.each([
    '#N/A',
    '#DIV/0!',
    '#VALUE!',
    '#REF!',
    '#NUM!',
    '#NAME?',
    '#NULL!',
    'NaN',
    'NA',
    'n/a',
    '-',
    '—',
    'Inf',
  ])('recognises %s as a missing value', (text) => {
    expect(parseCell(text, '.').kind).toBe('missing');
  });

  it.each(['abc', '1,5', '1.2.3', '12abc', '1e', '1,23', '1e999'])(
    'refuses %s with a decimal point',
    (text) => {
      expect(parseCell(text, '.').kind).toBe('text');
    },
  );

  it('knows the decimal separator of a language', () => {
    expect(decimalSeparatorOf('de-DE')).toBe(',');
    expect(decimalSeparatorOf('en-US')).toBe('.');
    expect(decimalSeparatorOf('not a locale!')).toBe('.');
  });

  it('shows values shortly and edits them in full', () => {
    expect(formatCell(0.1 + 0.2, '.')).toBe('0.3');
    expect(editText(0.1 + 0.2, '.')).toBe('0.30000000000000004');
    expect(formatCell(1.5, ',')).toBe('1,5');
    expect(formatCell(2, '.', 3)).toBe('2.000');
    expect(formatCell(1e-7, '.')).toBe('1e-7');
  });
});

describe('layout', () => {
  it('names spare columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(letters)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'ZZ',
      'AAA',
    ]);
  });

  it('adds spare rows and data sets, and labels subcolumns', () => {
    const g = createGroupedTable({
      title: 'G',
      rowTitles: ['WT'],
      groups: ['c'],
      format: { kind: 'replicates', count: 3 },
    });
    const l = makeLayout(g, SIZE);
    expect(l.rowTitles).toBe(true);
    expect(l.columns.map((c) => c.label).slice(0, 4)).toEqual(['Y1', 'Y2', 'Y3', 'Y1']);
    expect(l.spans.map((s) => [s.title, s.spare])).toEqual([
      ['c', false],
      ['Group B', true],
      ['Group C', true],
    ]);
    expect(l.rowCount).toBe(21);
    expect(l.subHeaders).toBe(true);
  });

  it('labels a Nested table by replicate, with no row-title column', () => {
    const n = createNestedTable({ title: 'N', groups: ['ctrl', 'treated'], replicates: 3 });
    const l = makeLayout(n, SIZE);
    expect(l.rowTitles).toBe(false);
    expect(l.columns.map((c) => c.label).slice(0, 3)).toEqual([
      'Replicate 1',
      'Replicate 2',
      'Replicate 3',
    ]);
    expect(l.growsRows).toBe(true);
    expect(l.subHeaders).toBe(true);
  });

  it('uses a Nested table’s own replicate titles when given', () => {
    const n = createNestedTable({
      title: 'N',
      groups: ['ctrl'],
      replicates: 3,
      replicateTitles: ['Dish 1', null, 'Dish 3'],
    });
    const l = makeLayout(n, SIZE);
    expect(l.columns.map((c) => c.label).slice(0, 3)).toEqual(['Dish 1', 'Replicate 2', 'Dish 3']);
  });

  it('gives a Column table of summary data exactly one row', () => {
    const t = createColumnTable({
      title: 'S',
      groups: ['a'],
      format: { kind: 'summary', stats: 'mean-sem-n' },
    });
    const l = makeLayout(t, SIZE);
    expect(l.rowCount).toBe(1);
    expect(l.growsRows).toBe(false);
    expect(l.columns.slice(0, 3).map((c) => c.label)).toEqual(['Mean', 'SEM', 'N']);
  });
});

describe('typing into the grid', () => {
  it('creates the rows and group it writes into, with a default title', () => {
    const g = column();
    g.type(2, 0, '4.5');
    expect(g.current().rows).toHaveLength(3);
    expect(g.current().dataSets.map((d) => d.title)).toEqual(['Group A']);
    expect(g.values()).toEqual([[[null, null, 4.5]]]);
  });

  it('creates the groups in between when typing further right, empty', () => {
    const g = column();
    g.type(0, 2, '1');
    expect(g.current().dataSets.map((d) => d.title)).toEqual(['Group A', 'Group B', 'Group C']);
  });

  it('names a new group from its title cell', () => {
    const g = column();
    g.type(-1, 0, 'Wild type');
    expect(g.current().dataSets.map((d) => d.title)).toEqual(['Wild type']);
    expect(g.current().rows).toHaveLength(0);
    g.type(-1, 0, 'WT');
    expect(g.current().dataSets.map((d) => d.title)).toEqual(['WT']);
  });

  it('writes into a Nested table’s replicate subcolumns like any other', () => {
    const n = nested();
    n.type(0, 0, '1.2');
    n.type(1, 0, '1.4');
    n.type(0, 1, '3.1');
    expect(n.current().rows).toHaveLength(2);
    expect(n.values()).toEqual([
      [
        [1.2, 1.4],
        [3.1, null],
      ],
    ]);
  });

  it('creates a new group typed past a Nested table’s last replicate column', () => {
    const n = nested();
    n.type(0, 2, '5');
    expect(n.current().dataSets.map((d) => d.title)).toEqual(['ctrl', 'Group B']);
  });

  it('writes nothing for an empty entry in a spare cell', () => {
    const g = column();
    expect(typeInto(g.layout(), { row: 5, col: 0 }, '', '.')).toEqual({ ok: true, edit: null });
  });

  it('refuses text, explaining in plain words', () => {
    const g = column();
    const r = typeInto(g.layout(), { row: 0, col: 0 }, 'abc', '.');
    expect(r).toEqual({
      ok: false,
      message: "“abc” isn't a number. Type a number, or clear the cell with Delete.",
    });
    const message = (text: string) => {
      const res = typeInto(g.layout(), { row: 0, col: 0 }, text, '.');
      return res.ok ? '' : res.message;
    };
    expect(message('1,5')).toMatch(/decimal separator/);
    expect(message('#N/A')).toMatch(/missing value/);
  });

  it('writes row titles of a Grouped table, creating the row', () => {
    const g = setup(
      createGroupedTable({
        title: 'G',
        rowTitles: [],
        groups: [],
        format: { kind: 'replicates', count: 2 },
      }),
    );
    g.type(1, -1, 'Knockout');
    expect(g.current().rows.map((r) => r.title)).toEqual([null, 'Knockout']);
    expect(g.current().dataSets).toHaveLength(0);
    g.type(0, 3, '7');
    expect(g.current().dataSets.map((d) => d.subcolumns)).toEqual([
      [
        [null, null],
        [null, null],
      ],
      [
        [null, null],
        [7, null],
      ],
    ]);
  });

  it('never adds rows to a Column table of summary data', () => {
    const g = setup(
      createColumnTable({
        title: 'S',
        groups: [],
        format: { kind: 'summary', stats: 'mean-sd-n' },
      }),
    );
    g.type(0, 1, '2');
    expect(g.current().rows).toHaveLength(1);
    expect(writeEntries(g.layout(), [{ pos: { row: 3, col: 0 }, value: 1 }])).toBeNull();
  });
});

describe('grid commands', () => {
  function filled() {
    const g = column();
    const entries = [
      [1, 10],
      [2, 20],
      [3, null],
    ].flatMap(([a, b], row) => [
      { pos: { row, col: 0 }, value: a ?? null },
      { pos: { row, col: 1 }, value: b ?? null },
    ]);
    g.run(writeEntries(g.layout(), entries));
    return g;
  }

  it('clears a range, titles to blank', () => {
    const g = filled();
    g.run(clearRange(g.layout(), { top: -1, left: 0, bottom: 1, right: 0 }));
    expect(g.values()[0]).toEqual([[null, null, 3]]);
    expect(g.current().dataSets[0]?.title).toBe('');
  });

  it('fills down from the top row, or from the row above a one-row selection', () => {
    const g = filled();
    g.run(fillDown(g.layout(), { top: 0, left: 0, bottom: 2, right: 1 }));
    expect(g.values()).toEqual([[[1, 1, 1]], [[10, 10, 10]]]);
    const h = filled();
    h.run(fillDown(h.layout(), { top: 2, left: 1, bottom: 2, right: 1 }));
    expect(h.values()[1]).toEqual([[10, 20, 20]]);
    expect(fillDown(h.layout(), { top: 0, left: 0, bottom: 0, right: 0 })).toBeNull();
  });

  it('excludes values, then includes them again', () => {
    const g = filled();
    const r = { top: 0, left: 1, bottom: 2, right: 1 };
    g.run(toggleExcluded(g.layout(), r));
    expect(g.current().dataSets[1]?.excluded.size).toBe(2);
    const again = toggleExcluded(g.layout(), r);
    expect(again).toMatchObject({ label: 'Include values' });
    g.run(again);
    expect(g.current().dataSets[1]?.excluded.size).toBe(0);
    expect(toggleExcluded(g.layout(), { top: 5, left: 0, bottom: 6, right: 0 })).toBeNull();
  });

  it('inserts rows above the selection and groups beside it', () => {
    const g = filled();
    g.run(insertRows(g.layout(), { top: 1, left: 0, bottom: 2, right: 0 }));
    expect(g.values()[0]).toEqual([[1, null, null, 2, 3]]);
    g.run(insertDataSet(g.layout(), 0, false));
    expect(g.current().dataSets.map((d) => d.title)).toEqual(['Group C', 'Group A', 'Group B']);
    g.run(deleteDataSets(g.layout(), { top: 0, left: 0, bottom: 0, right: 1 }));
    expect(g.current().dataSets.map((d) => d.title)).toEqual(['Group B']);
  });
});

describe('navigation', () => {
  function nav(table: Table, state: NavState, ...cmds: NavCommand[]) {
    const layout = makeLayout(table, SIZE);
    return cmds.reduce((s, c) => navigate(s, c, layout, 5), state);
  }
  const start = (row: number, col: number): NavState => ({ sel: at(row, col), tabStart: null });
  const move = (dir: 'up' | 'down' | 'left' | 'right', extend = false, j = false): NavCommand => ({
    type: 'move',
    dir,
    extend,
    jump: j,
  });

  function table(cols: readonly (readonly (number | null)[])[]): Table {
    const g = column();
    g.run(
      writeEntries(
        g.layout(),
        cols.flatMap((cells, col) => cells.map((value, row) => ({ pos: { row, col }, value }))),
      ),
    );
    return g.current();
  }

  it('moves, stops at edges, and reaches the title row', () => {
    const t = table([[1, 2]]);
    expect(nav(t, start(0, 0), move('up')).sel.focus).toEqual({ row: -1, col: 0 });
    expect(nav(t, start(-1, 0), move('up'), move('left')).sel.focus).toEqual({ row: -1, col: 0 });
    expect(nav(t, start(0, 0), move('down', true), move('right', true)).sel).toEqual({
      anchor: { row: 0, col: 0 },
      focus: { row: 1, col: 1 },
    });
  });

  it('jumps with Ctrl+arrows as Excel', () => {
    const t = table([[1, 2, 3, null, null, 6, 7]]);
    const layout = makeLayout(t, SIZE);
    const b = {
      minRow: -1,
      maxRow: layout.rowCount - 1,
      minCol: 0,
      maxCol: layout.columns.length - 1,
    };
    expect(jump(layout, { row: 0, col: 0 }, 'down', b)).toEqual({ row: 2, col: 0 });
    expect(jump(layout, { row: 2, col: 0 }, 'down', b)).toEqual({ row: 5, col: 0 });
    expect(jump(layout, { row: 5, col: 0 }, 'down', b)).toEqual({ row: 6, col: 0 });
    // Past the last value: the edge of the data, not the end of the spare rows.
    expect(jump(layout, { row: 6, col: 0 }, 'down', b)).toEqual({ row: 6, col: 0 });
    expect(jump(layout, { row: 6, col: 0 }, 'up', b)).toEqual({ row: 5, col: 0 });
  });

  it('returns to the column Tab started in when Enter is pressed', () => {
    const t = table([[1]]);
    const s = nav(
      t,
      start(0, 0),
      { type: 'tab', back: false },
      { type: 'tab', back: false },
      { type: 'enter', back: false },
    );
    expect(s.sel.focus).toEqual({ row: 1, col: 0 });
  });

  it('selects all data with the active cell at the top left', () => {
    const t = table([
      [1, 2],
      [3, null, 5],
    ]);
    const s = nav(t, start(4, 4), { type: 'selectAll' });
    expect(s.sel.focus).toEqual({ row: 0, col: 0 });
    expect(rangeOf(s.sel)).toEqual({ top: 0, left: 0, bottom: 2, right: 1 });
  });

  it('moves by whole data sets along the title row', () => {
    const g = createGroupedTable({
      title: 'G',
      rowTitles: ['a'],
      groups: ['x', 'y'],
      format: { kind: 'replicates', count: 3 },
    });
    expect(nav(g, start(-1, 0), move('right')).sel.focus).toEqual({ row: -1, col: 3 });
    expect(nav(g, start(-1, 4), move('left')).sel.focus).toEqual({ row: -1, col: 0 });
    expect(nav(g, start(0, 0), move('left')).sel.focus).toEqual({ row: 0, col: -1 });
  });
});

describe('keys', () => {
  const k = (key: string, m: Partial<{ ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
    key,
    ctrlKey: m.ctrl ?? false,
    metaKey: false,
    shiftKey: m.shift ?? false,
    altKey: m.alt ?? false,
  });

  it('maps Excel keys', () => {
    expect(gridAction(k('ArrowDown', { shift: true, ctrl: true }))).toEqual({
      type: 'nav',
      cmd: { type: 'move', dir: 'down', extend: true, jump: true },
    });
    expect(gridAction(k('7'))).toEqual({ type: 'type', text: '7' });
    expect(gridAction(k('F2'))).toEqual({ type: 'edit' });
    expect(gridAction(k('Delete'))).toEqual({ type: 'clear' });
    expect(gridAction(k('d', { ctrl: true }))).toEqual({ type: 'fillDown' });
    expect(gridAction(k('e', { ctrl: true }))).toEqual({ type: 'exclude' });
    expect(gridAction(k('+', { ctrl: true, shift: true }))).toEqual({ type: 'insertRows' });
    expect(gridAction(k('-', { ctrl: true }))).toEqual({ type: 'deleteRows' });
    expect(gridAction(k('c', { ctrl: true }))).toBeNull();
    expect(gridAction(k('Shift'))).toBeNull();
  });

  it('lets arrows end an edit only when it was started by typing', () => {
    expect(editorExit(k('ArrowLeft'), true)).toEqual({
      type: 'move',
      dir: 'left',
      extend: false,
      jump: false,
    });
    expect(editorExit(k('ArrowLeft'), false)).toBeNull();
    expect(editorExit(k('Escape'), false)).toBe('cancel');
    expect(editorExit(k('Tab', { shift: true }), false)).toEqual({ type: 'tab', back: true });
  });
});
