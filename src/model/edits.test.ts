import { describe, expect, it } from 'vitest';

import { analysisOrder, dependentsOf, downstreamOf, wouldCycle } from './deps';
import { type Edit, EditError, applyEdit, describeEdit } from './edits';
import { type Id, asId, newId } from './ids';
import { type Analysis, type Project, createProject, GRAPH_DEFAULTS } from './project';
import { type Table, cellKey, createColumnTable, createGroupedTable } from './table';
import { validateProject } from './validate';

function apply(p: Project, ...edits: Edit[]): Project {
  const out = edits.reduce(applyEdit, p);
  expect(validateProject(out)).toEqual([]);
  return out;
}

function withColumn(rows = 3) {
  const table = createColumnTable({ title: 'T', groups: ['A', 'B'], rows });
  const project = apply(createProject('P'), { op: 'addTable', table });
  const [a, b] = table.dataSets;
  if (!a || !b) throw new Error('unreachable');
  return { project, table, a: a.id, b: b.id, row: (i: number) => (table.rows[i] as { id: Id }).id };
}

function need<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('unreachable');
  return x;
}

const tableOf = (p: Project, id: Id): Table => need(p.tables.get(id));

const descriptive = (id: string, input: Analysis['input']): Analysis => ({
  id: asId(id),
  title: id,
  kind: 'descriptive',
  options: {},
  input,
});

describe('cells', () => {
  it('writes values and empties, leaving the old project as it was', () => {
    const { project, table, a, row } = withColumn();
    const next = apply(project, {
      op: 'setCells',
      table: table.id,
      cells: [
        { dataSet: a, subcolumn: 0, row: row(0), value: 0 },
        { dataSet: a, subcolumn: 0, row: row(2), value: -1.5 },
      ],
    });
    expect(tableOf(next, table.id).dataSets[0]?.subcolumns).toEqual([[0, null, -1.5]]);
    expect(tableOf(project, table.id).dataSets[0]?.subcolumns).toEqual([[null, null, null]]);
    // Unchanged data sets are shared, not copied.
    expect(tableOf(next, table.id).dataSets[1]).toBe(table.dataSets[1]);
  });

  it('refuses NaN and infinities: an empty cell is null', () => {
    const { project, table, a, row } = withColumn();
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(() =>
        applyEdit(project, {
          op: 'setCells',
          table: table.id,
          cells: [{ dataSet: a, subcolumn: 0, row: row(0), value }],
        }),
      ).toThrow(EditError);
    }
  });

  it('stores -0 as 0', () => {
    const { project, table, a, row } = withColumn();
    const next = apply(project, {
      op: 'setCells',
      table: table.id,
      cells: [{ dataSet: a, subcolumn: 0, row: row(0), value: -0 }],
    });
    expect(Object.is(tableOf(next, table.id).dataSets[0]?.subcolumns[0]?.[0], 0)).toBe(true);
  });

  it('refuses unknown rows, data sets and subcolumns', () => {
    const { project, table, a, row } = withColumn();
    const bad = [
      { dataSet: a, subcolumn: 0, row: asId('r_nope'), value: 1 },
      { dataSet: asId('ds_nope'), subcolumn: 0, row: row(0), value: 1 },
      { dataSet: a, subcolumn: 1, row: row(0), value: 1 },
    ];
    for (const c of bad)
      expect(() => applyEdit(project, { op: 'setCells', table: table.id, cells: [c] })).toThrow(
        EditError,
      );
  });
});

describe('exclusion', () => {
  it('excludes values, skips empty cells, and a new value clears it', () => {
    const { project, table, a, row } = withColumn();
    let p = apply(project, {
      op: 'setCells',
      table: table.id,
      cells: [{ dataSet: a, subcolumn: 0, row: row(0), value: 5 }],
    });
    p = apply(p, {
      op: 'setExcluded',
      table: table.id,
      dataSet: a,
      cells: [
        { subcolumn: 0, row: row(0) },
        { subcolumn: 0, row: row(1) },
      ],
      excluded: true,
    });
    expect([...(tableOf(p, table.id).dataSets[0]?.excluded ?? [])]).toEqual([cellKey(0, row(0))]);
    p = apply(p, {
      op: 'setCells',
      table: table.id,
      cells: [{ dataSet: a, subcolumn: 0, row: row(0), value: 6 }],
    });
    expect(tableOf(p, table.id).dataSets[0]?.excluded.size).toBe(0);
  });

  it('goes with a deleted row', () => {
    const { project, table, a, row } = withColumn();
    let p = apply(project, {
      op: 'setCells',
      table: table.id,
      cells: [{ dataSet: a, subcolumn: 0, row: row(1), value: 5 }],
    });
    p = apply(p, {
      op: 'setExcluded',
      table: table.id,
      dataSet: a,
      cells: [{ subcolumn: 0, row: row(1) }],
      excluded: true,
    });
    p = apply(p, { op: 'deleteRows', table: table.id, rows: [row(1)] });
    expect(tableOf(p, table.id).dataSets[0]).toMatchObject({
      subcolumns: [[null, null]],
      excluded: new Set(),
    });
  });
});

describe('rows and data sets', () => {
  it('inserts empty rows at a position in every data set', () => {
    const { project, table, a, row } = withColumn(2);
    let p = apply(project, {
      op: 'setCells',
      table: table.id,
      cells: [{ dataSet: a, subcolumn: 0, row: row(1), value: 9 }],
    });
    const r = newId('r');
    p = apply(p, { op: 'insertRows', table: table.id, at: 1, rows: [{ id: r, title: null }] });
    const t = tableOf(p, table.id);
    expect(t.rows.map((x) => x.id)).toEqual([row(0), r, row(1)]);
    expect(t.dataSets.map((d) => d.subcolumns)).toEqual([[[null, null, 9]], [[null, null, null]]]);
  });

  it('refuses a row id that is already used anywhere', () => {
    const { project, table } = withColumn();
    expect(() =>
      applyEdit(project, {
        op: 'insertRows',
        table: table.id,
        at: 0,
        rows: [{ id: table.id, title: null }],
      }),
    ).toThrow(/already in use/);
  });

  it('removing a data set stops analyses reading it', () => {
    const { project, table, a, b } = withColumn();
    let p = apply(project, {
      op: 'addAnalysis',
      analysis: descriptive('a_1', { kind: 'table', table: table.id, dataSets: [a, b] }),
    });
    p = apply(p, { op: 'removeDataSet', table: table.id, dataSet: a });
    expect(p.analyses.get(asId('a_1'))?.input).toEqual({
      kind: 'table',
      table: table.id,
      dataSets: [b],
    });
  });

  it('moves a data set and clears a colour', () => {
    const { project, table, a, b } = withColumn();
    let p = apply(project, {
      op: 'setDataSet',
      table: table.id,
      dataSet: a,
      color: '#0173b2',
      decimals: 2,
    });
    expect(tableOf(p, table.id).dataSets[0]).toMatchObject({ color: '#0173b2', decimals: 2 });
    p = apply(p, { op: 'setDataSet', table: table.id, dataSet: a, color: null });
    expect('color' in (tableOf(p, table.id).dataSets[0] ?? {})).toBe(false);
    p = apply(p, { op: 'moveDataSet', table: table.id, dataSet: a, to: 1 });
    expect(tableOf(p, table.id).dataSets.map((d) => d.id)).toEqual([b, a]);
  });

  it('refuses rows on a Column table of summary data', () => {
    const table = createColumnTable({
      title: 'S',
      groups: ['A'],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const p = apply(createProject('P'), { op: 'addTable', table });
    expect(() =>
      applyEdit(p, {
        op: 'insertRows',
        table: table.id,
        at: 0,
        rows: [{ id: newId('r'), title: null }],
      }),
    ).toThrow(/one row/);
  });
});

describe('setFormat', () => {
  it('keeps replicates when only their count changes', () => {
    const table = createGroupedTable({
      title: 'G',
      rowTitles: ['WT'],
      groups: ['c'],
      format: { kind: 'replicates', count: 3 },
    });
    const [d] = table.dataSets;
    const [r] = table.rows;
    if (!d || !r) throw new Error('unreachable');
    let p = apply(createProject('P'), { op: 'addTable', table });
    p = apply(p, {
      op: 'setCells',
      table: table.id,
      cells: [0, 1, 2].map((s) => ({ dataSet: d.id, subcolumn: s, row: r.id, value: s + 1 })),
    });
    p = apply(p, {
      op: 'setExcluded',
      table: table.id,
      dataSet: d.id,
      cells: [{ subcolumn: 2, row: r.id }],
      excluded: true,
    });
    const fewer = apply(p, {
      op: 'setFormat',
      table: table.id,
      format: { kind: 'replicates', count: 2 },
    });
    expect(tableOf(fewer, table.id).dataSets[0]).toMatchObject({
      subcolumns: [[1], [2]],
      excluded: new Set(),
    });
    const more = apply(p, {
      op: 'setFormat',
      table: table.id,
      format: { kind: 'replicates', count: 4 },
    });
    expect(tableOf(more, table.id).dataSets[0]).toMatchObject({
      subcolumns: [[1], [2], [3], [null]],
      excluded: new Set([cellKey(2, r.id)]),
    });
  });

  it('keeps mean, n and a matching spread between summary formats', () => {
    const table = createColumnTable({
      title: 'S',
      groups: ['A'],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const [d] = table.dataSets;
    const [r] = table.rows;
    if (!d || !r) throw new Error('unreachable');
    let p = apply(createProject('P'), { op: 'addTable', table });
    p = apply(p, {
      op: 'setCells',
      table: table.id,
      cells: [10, 2, 5].map((value, s) => ({ dataSet: d.id, subcolumn: s, row: r.id, value })),
    });
    const sem = apply(p, {
      op: 'setFormat',
      table: table.id,
      format: { kind: 'summary', stats: 'mean-sem-n' },
    });
    expect(tableOf(sem, table.id).dataSets[0]?.subcolumns).toEqual([[10], [null], [5]]);
    const noN = apply(p, {
      op: 'setFormat',
      table: table.id,
      format: { kind: 'summary', stats: 'mean-sd' },
    });
    expect(tableOf(noN, table.id).dataSets[0]?.subcolumns).toEqual([[10], [2]]);
  });

  it('turns a Column table of replicates into one summary row, and refuses replicate subcolumns', () => {
    const { project, table } = withColumn(4);
    const p = apply(project, {
      op: 'setFormat',
      table: table.id,
      format: { kind: 'summary', stats: 'mean-sem-n' },
    });
    expect(tableOf(p, table.id).rows).toHaveLength(1);
    expect(() =>
      applyEdit(project, {
        op: 'setFormat',
        table: table.id,
        format: { kind: 'replicates', count: 2 },
      }),
    ).toThrow(EditError);
  });
});

describe('analyses and the dependency graph', () => {
  function chain() {
    const { project, table, a } = withColumn();
    const input = { kind: 'table' as const, table: table.id, dataSets: [a] };
    const p = apply(
      project,
      { op: 'addAnalysis', analysis: descriptive('a_1', input) },
      {
        op: 'addAnalysis',
        analysis: descriptive('a_2', { kind: 'analysis', analysis: asId('a_1') }),
      },
      {
        op: 'addAnalysis',
        analysis: descriptive('a_3', { kind: 'analysis', analysis: asId('a_2') }),
      },
      {
        op: 'addGraph',
        graph: {
          id: asId('g_1'),
          title: 'G',
          ...GRAPH_DEFAULTS,
          source: { kind: 'table', table: table.id },
          analyses: [asId('a_2')],
        },
      },
    );
    return { p, table };
  }

  it('derives dependents and everything downstream', () => {
    const { p, table } = chain();
    expect(dependentsOf(p, table.id)).toEqual([asId('a_1'), asId('g_1')]);
    expect([...downstreamOf(p, asId('a_1'))].sort()).toEqual(['a_2', 'a_3', 'g_1']);
  });

  it('refuses a reference that would close a cycle', () => {
    const { p } = chain();
    const a1 = need(p.analyses.get(asId('a_1')));
    expect(wouldCycle(p, a1.id, { kind: 'analysis', analysis: asId('a_3') })).toBe(true);
    expect(() =>
      applyEdit(p, {
        op: 'setAnalysis',
        analysis: { ...a1, input: { kind: 'analysis', analysis: asId('a_3') } },
      }),
    ).toThrow(/cannot read its own results/);
    expect(() =>
      applyEdit(p, {
        op: 'setAnalysis',
        analysis: { ...a1, input: { kind: 'analysis', analysis: a1.id } },
      }),
    ).toThrow(EditError);
  });

  it('orders analyses after what they read, whatever the navigator order', () => {
    const { p } = chain();
    const shuffled = {
      ...p,
      order: { ...p.order, analyses: [asId('a_3'), asId('a_1'), asId('a_2')] },
    };
    expect(analysisOrder(shuffled)).toEqual(['a_1', 'a_2', 'a_3']);
  });

  it('deleting a table takes its analyses and graphs with it', () => {
    const { p, table } = chain();
    const next = apply(p, { op: 'removeTable', table: table.id });
    expect(next.analyses.size).toBe(0);
    expect(next.graphs.size).toBe(0);
    expect(next.order).toEqual({ tables: [], analyses: [], graphs: [], layouts: [] });
  });

  it('deleting an analysis takes chained ones; a graph only loses the brackets it drew', () => {
    const { p } = chain();
    const next = apply(p, { op: 'removeAnalysis', analysis: asId('a_2') });
    expect([...next.analyses.keys()]).toEqual(['a_1']);
    expect(next.graphs.get(asId('g_1'))?.analyses).toEqual([]);
  });

  it('refuses references to things that do not exist', () => {
    const { project } = withColumn();
    expect(() =>
      applyEdit(project, {
        op: 'addAnalysis',
        analysis: descriptive('a_x', { kind: 'analysis', analysis: asId('a_nope') }),
      }),
    ).toThrow(EditError);
    expect(() =>
      applyEdit(project, {
        op: 'addGraph',
        graph: {
          id: asId('g_x'),
          title: 'G',
          ...GRAPH_DEFAULTS,
          source: { kind: 'table', table: asId('t_nope') },
          analyses: [],
        },
      }),
    ).toThrow(EditError);
  });
});

describe('batch', () => {
  it('is all or nothing, and names itself for undo', () => {
    const { project, table, a, row } = withColumn();
    const edit: Edit = {
      op: 'batch',
      label: 'Paste',
      edits: [
        {
          op: 'setCells',
          table: table.id,
          cells: [{ dataSet: a, subcolumn: 0, row: row(0), value: 1 }],
        },
        { op: 'removeTable', table: asId('t_nope') },
      ],
    };
    expect(() => applyEdit(project, edit)).toThrow(EditError);
    expect(tableOf(project, table.id).dataSets[0]?.subcolumns).toEqual([[null, null, null]]);
    expect(describeEdit(edit)).toBe('Paste');
    expect(describeEdit({ op: 'setCells', table: table.id, cells: [] })).toBe('Edit cells');
  });
});
