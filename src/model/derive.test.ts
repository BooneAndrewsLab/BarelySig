import { describe, expect, it } from 'vitest';

import { applyEdit, EditError } from './edits';
import {
  createNormalized,
  normalizeNote,
  replicateRangeNote,
  REPLICATE_RANGE_NOTE,
  syncDerived,
} from './derive';
import { dependentsOf } from './deps';
import { asId, newId } from './ids';
import { createProject, GRAPH_DEFAULTS } from './project';
import { type NormalizeOptions, type Table, createColumnTable } from './table';
import { validateProject } from './validate';

function setup() {
  const base = createColumnTable({ title: 'Expt', groups: ['ctrl', 'drug'], rows: 3 });
  const source: Table = {
    ...base,
    dataSets: base.dataSets.map((d, i) => ({
      ...d,
      subcolumns: [
        [
          [2, 4, 5],
          [1, 6, 10],
        ][i] ?? [],
      ],
    })),
  };
  const ctrl = source.dataSets[0]?.id;
  if (!ctrl) throw new Error('unreachable');
  const options: NormalizeOptions = {
    by: 'row',
    zero: { kind: 'value', value: 0 },
    full: { kind: 'dataSet', dataSet: ctrl },
    unit: 'percent',
  };
  let p = applyEdit(createProject('p'), { op: 'addTable', table: source });
  const derived = createNormalized(source, options, newId('t'), 'Expt (normalized)');
  p = applyEdit(p, { op: 'addTable', table: derived });
  return { p, source, derived, options };
}

describe('calculated tables', () => {
  it('are made from the source, with a plain axis title', () => {
    const { p, derived } = setup();
    const t = p.tables.get(derived.id);
    expect(t?.dataSets[1]?.subcolumns[0]).toEqual([50, 150, 200]);
    expect(t?.valueTitle).toBe('% of control');
    expect(validateProject(p)).toEqual([]);
  });

  it('follow edits to the source, and undo is just the earlier project', () => {
    const { p, source, derived } = setup();
    const ds = source.dataSets[1];
    if (!ds) throw new Error('unreachable');
    const q = applyEdit(p, {
      op: 'setCells',
      table: source.id,
      cells: [{ dataSet: ds.id, subcolumn: 0, row: source.rows[0]?.id ?? ds.id, value: 4 }],
    });
    expect(q.tables.get(derived.id)?.dataSets[1]?.subcolumns[0]?.[0]).toBe(200);
    expect(p.tables.get(derived.id)?.dataSets[1]?.subcolumns[0]?.[0]).toBe(50);
  });

  it('keep their identity when nothing they read changed', () => {
    const { p, derived } = setup();
    const q = applyEdit(p, { op: 'renameProject', name: 'again' });
    expect(q.tables.get(derived.id)).toBe(p.tables.get(derived.id));
    expect(syncDerived(p)).toBe(p);
  });

  it('keep user colours, titles and notes across a recalculation', () => {
    const { p, source, derived } = setup();
    const dsId = p.tables.get(derived.id)?.dataSets[1]?.id;
    if (!dsId) throw new Error('unreachable');
    let q = applyEdit(p, { op: 'setDataSet', table: derived.id, dataSet: dsId, color: '#ff0000' });
    q = applyEdit(q, { op: 'setTableInfo', table: derived.id, title: 'Mine' });
    const ds = source.dataSets[1];
    q = applyEdit(q, {
      op: 'setCells',
      table: source.id,
      cells: [{ dataSet: ds?.id ?? dsId, subcolumn: 0, row: source.rows[1]?.id ?? dsId, value: 8 }],
    });
    expect(q.tables.get(derived.id)?.title).toBe('Mine');
    expect(q.tables.get(derived.id)?.dataSets[1]?.color).toBe('#ff0000');
  });

  it('refuse typing, in words', () => {
    const { p, derived } = setup();
    const ds = derived.dataSets[0];
    expect(() =>
      applyEdit(p, {
        op: 'setCells',
        table: derived.id,
        cells: [
          {
            dataSet: ds?.id ?? derived.id,
            subcolumn: 0,
            row: derived.rows[0]?.id ?? derived.id,
            value: 1,
          },
        ],
      }),
    ).toThrow(/calculated from "Expt"/);
  });

  it('show the problem and recover when the source is fixed', () => {
    const { p, source, derived } = setup();
    const c = source.dataSets[0];
    const write = (v: number | null) =>
      applyEdit(p, {
        op: 'setCells',
        table: source.id,
        cells: [
          {
            dataSet: c?.id ?? derived.id,
            subcolumn: 0,
            row: source.rows[1]?.id ?? derived.id,
            value: v,
          },
        ],
      });
    const bad = write(0);
    expect(bad.tables.get(derived.id)?.derived?.problem).toMatch(/row 2/);
    expect(bad.tables.get(derived.id)?.dataSets[1]?.subcolumns[0]).toEqual([null, null, null]);
    // a missing control is not a problem: that row is just empty
    const missing = write(null);
    expect(missing.tables.get(derived.id)?.derived?.problem).toBeNull();
    expect(missing.tables.get(derived.id)?.dataSets[1]?.subcolumns[0]).toEqual([50, null, 200]);
  });

  it('refuse a result too large to hold, in words, never an infinite cell', () => {
    const { p, source, derived, options } = setup();
    const drug = source.dataSets[1];
    // 1e308 against a control of 4 is 2.5e309 percent: past the largest double
    const huge = applyEdit(p, {
      op: 'setCells',
      table: source.id,
      cells: [
        {
          dataSet: drug?.id ?? derived.id,
          subcolumn: 0,
          row: source.rows[1]?.id ?? derived.id,
          value: 1e308,
        },
      ],
    });
    expect(huge.tables.get(derived.id)?.derived?.problem).toMatch(/too large/);
    expect(huge.tables.get(derived.id)?.dataSets[1]?.subcolumns[0]).toEqual([null, null, null]);
    expect(validateProject(huge)).toEqual([]);
    const fresh = huge.tables.get(source.id);
    if (!fresh) throw new Error('unreachable');
    expect(() =>
      applyEdit(huge, {
        op: 'addTable',
        table: createNormalized(fresh, options, newId('t'), 'again'),
      }),
    ).toThrow(/too large/);
  });

  it('refuse a setting that cannot be calculated', () => {
    const { p, derived, options } = setup();
    expect(() =>
      applyEdit(p, {
        op: 'setNormalize',
        table: derived.id,
        options: { ...options, zero: { kind: 'min' } },
      }),
    ).toThrow(EditError);
    const q = applyEdit(p, {
      op: 'setNormalize',
      table: derived.id,
      options: { ...options, unit: 'fraction' },
    });
    expect(q.tables.get(derived.id)?.dataSets[1]?.subcolumns[0]).toEqual([0.5, 1.5, 2]);
  });

  it('lose a data set with their source, and what read it stops reading it', () => {
    const { p, source, derived } = setup();
    const t = p.tables.get(derived.id);
    const drug = t?.dataSets[1]?.id;
    const ctrl = t?.dataSets[0]?.id;
    if (!drug || !ctrl) throw new Error('unreachable');
    let q = applyEdit(p, {
      op: 'addAnalysis',
      analysis: {
        id: asId('a_1'),
        title: 'A',
        kind: 'descriptive',
        options: {},
        input: { kind: 'table', table: derived.id, dataSets: [ctrl, drug] },
      },
    });
    q = applyEdit(q, {
      op: 'addGraph',
      graph: {
        id: asId('g_1'),
        title: 'G',
        ...GRAPH_DEFAULTS,
        source: { kind: 'table', table: derived.id },
        dataSets: [ctrl, drug],
        analyses: [],
      },
    });
    const r = applyEdit(q, {
      op: 'removeDataSet',
      table: source.id,
      dataSet: source.dataSets[1]?.id ?? source.id,
    });
    expect(r.graphs.get(asId('g_1'))?.dataSets).toEqual([ctrl]);
    const a = r.analyses.get(asId('a_1'));
    expect(a?.input.kind === 'table' && a.input.dataSets).toEqual([ctrl]);
    expect(validateProject(r)).toEqual([]);
    // an edit that drops nothing keeps every object as it was (graphs are cached by identity)
    const s = applyEdit(q, { op: 'renameProject', name: 'again' });
    expect(s.graphs).toBe(q.graphs);
    expect(s.analyses).toBe(q.analyses);
  });

  it('are deleted with their source, and are a step downstream of it', () => {
    const { p, source, derived } = setup();
    expect(dependentsOf(p, source.id)).toEqual([derived.id]);
    const q = applyEdit(p, { op: 'removeTable', table: source.id });
    expect(q.tables.size).toBe(0);
    expect(q.order.tables).toEqual([]);
  });

  it('can be detached into a plain table, and a duplicate is plain too', () => {
    const { p, source, derived } = setup();
    const q = applyEdit(p, { op: 'detachDerived', table: derived.id });
    expect(q.tables.get(derived.id)?.derived).toBeUndefined();
    const ds = q.tables.get(derived.id)?.dataSets[0];
    const r = applyEdit(q, {
      op: 'setCells',
      table: derived.id,
      cells: [
        {
          dataSet: ds?.id ?? derived.id,
          subcolumn: 0,
          row: derived.rows[0]?.id ?? derived.id,
          value: 7,
        },
      ],
    });
    expect(r.tables.get(derived.id)?.dataSets[0]?.subcolumns[0]?.[0]).toBe(7);
    expect(source.derived).toBeUndefined();
  });

  it('say what was done', () => {
    const { source, derived } = setup();
    expect(normalizeNote(source, derived.derived ?? ({} as never))).toBe(
      'Normalized from "Expt": divided by the mean of "ctrl", as percent; each row against its own control.',
    );
  });

  it('warns that replicates can leave 0 to 100 only on a 0-100 scale with replicates', () => {
    const { source, derived, options } = setup();
    const d = derived.derived ?? ({} as never);
    expect(replicateRangeNote(source, d)).toBeNull(); // divide-by-control mode
    const range = {
      ...d,
      options: { ...options, zero: { kind: 'min' as const }, full: { kind: 'max' as const } },
    };
    expect(replicateRangeNote(source, range)).toBeNull(); // one value per cell
    const triple = { ...source, format: { kind: 'replicates' as const, count: 3 } };
    expect(replicateRangeNote(triple, range)).toBe(REPLICATE_RANGE_NOTE);
  });
});
