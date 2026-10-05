/**
 * Normalize (item 43), checked against the R oracle's plain arithmetic
 * (CLAUDE.md, Correctness), plus the rules the fixtures can't express:
 * refusals, exclusions, XY tables and calculated tables staying current.
 * The calculation is TypeScript, so no engine runs here.
 */
import { describe, expect, it } from 'vitest';

import type { Plain } from '@/engine/convert';
import { calculateNormalize } from '@/model/derive';
import { type Id, asId } from '@/model/ids';
import {
  type NormalizeOptions,
  type NormalizeRef,
  type Table,
  cellKey,
  createColumnTable,
  createGroupedTable,
  createXyTable,
} from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';

type Cells = readonly (number | null)[];

/** The fixture's columns as a table: replicates and summary subcolumns follow the options. */
function tableOf(f: Fixture): Table {
  const replicates = Number(f.options?.['replicates'] ?? 1);
  const summary = f.options?.['summary'];
  const names = Object.keys(f.input);
  const rows = f.input[names[0] ?? '']?.length ?? 0;
  const groups: string[] = [];
  const subs = new Map<string, Cells[]>();
  for (const name of names) {
    const at = name.lastIndexOf('_');
    const group = replicates > 1 || summary !== undefined ? name.slice(0, at) : name;
    if (!subs.has(group)) {
      groups.push(group);
      subs.set(group, []);
    }
    subs.get(group)?.push(f.input[name] ?? []);
  }
  const base =
    summary !== undefined
      ? createColumnTable({
          title: 't',
          groups,
          format: { kind: 'summary', stats: 'mean-sd-n' },
        })
      : replicates > 1
        ? createGroupedTable({
            title: 't',
            groups,
            rowTitles: Array.from({ length: rows }, (_, i) => `r${String(i)}`),
            format: { kind: 'replicates', count: replicates },
          })
        : createColumnTable({ title: 't', groups, rows });
  return {
    ...base,
    dataSets: base.dataSets.map((d) => ({
      ...d,
      subcolumns: (subs.get(d.title) ?? []).map((c) => [...c]),
    })),
  };
}

function ref(table: Table, r: Plain): NormalizeRef {
  const o = r as { kind: string; value?: number; dataSet?: string };
  if (o.kind === 'value') return { kind: 'value', value: o.value ?? 0 };
  if (o.kind === 'dataSet') {
    const d = table.dataSets.find((x) => x.title === o.dataSet);
    if (!d) throw new Error(`no data set ${String(o.dataSet)}`);
    return { kind: 'dataSet', dataSet: d.id };
  }
  return { kind: o.kind as 'min' | 'max' | 'sum' | 'first' | 'last' };
}

function optionsOf(table: Table, f: Fixture): NormalizeOptions {
  const o = f.options ?? {};
  return {
    by: o['by'] as 'whole' | 'row',
    zero: ref(table, o['zero'] ?? null),
    full: ref(table, o['full'] ?? null),
    unit: o['unit'] as 'fraction' | 'percent',
  };
}

describe('normalize, against the R oracle', () => {
  const fixtures = loadFixtures('normalize');

  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s', (_id, f) => {
    const table = tableOf(f);
    const { cells, problem } = calculateNormalize(table, optionsOf(table, f));
    expect(problem).toBeNull();
    const replicates = Number(f.options?.['replicates'] ?? 1);
    const summary = f.options?.['summary'] !== undefined;
    const actual: Record<string, Plain> = {};
    table.dataSets.forEach((d, i) => {
      (cells[i] ?? []).forEach((col, s) => {
        const key = summary
          ? `${d.title}_${['mean', 'sd', 'n'][s] ?? ''}`
          : replicates > 1
            ? `${d.title}_${String(s + 1)}`
            : d.title;
        // Summary data has one row; the oracle writes its numbers unboxed.
        actual[key] = (summary ? (col[0] ?? null) : col) as Plain;
      });
    });
    expect(mismatches(actual, f.expected, f.tolerance)).toEqual([]);
    if (summary) {
      // n is carried over unchanged.
      expect(cells[0]?.[2]).toEqual(f.input['a_n']);
    }
  });
});

describe('normalize rules', () => {
  const column = (cols: Record<string, Cells>): Table => {
    const names = Object.keys(cols);
    const base = createColumnTable({
      title: 't',
      groups: names,
      rows: cols[names[0] ?? '']?.length ?? 0,
    });
    return {
      ...base,
      dataSets: base.dataSets.map((d) => ({ ...d, subcolumns: [[...(cols[d.title] ?? [])]] })),
    };
  };
  const idOf = (t: Table, title: string): Id =>
    t.dataSets.find((d) => d.title === title)?.id ?? asId('');
  const foldOf = (t: Table, control: string, by: 'whole' | 'row' = 'whole'): NormalizeOptions => ({
    by,
    zero: { kind: 'value', value: 0 },
    full: { kind: 'dataSet', dataSet: idOf(t, control) },
    unit: 'fraction',
  });

  it('refuses a control of 0, in words', () => {
    const t = column({ c: [0, 0], a: [1, 2] });
    const r = calculateNormalize(t, foldOf(t, 'c'));
    expect(r.problem).toMatch(/"c".*is 0.*relative/);
    expect(r.cells.flat(2).every((v) => v === null)).toBe(true);
  });

  it('refuses a zero control in one row, naming the row', () => {
    const t = column({ c: [1, 0, 2], a: [1, 2, 3] });
    expect(calculateNormalize(t, foldOf(t, 'c', 'row')).problem).toMatch(/row 2/);
  });

  it('refuses equal 0% and 100% references', () => {
    const t = column({ a: [5, 5] });
    const r = calculateNormalize(t, {
      by: 'whole',
      zero: { kind: 'min' },
      full: { kind: 'max' },
      unit: 'percent',
    });
    expect(r.problem).toMatch(/nothing to divide by/);
  });

  it('refuses smallest/largest row by row', () => {
    const t = column({ a: [1, 2] });
    const r = calculateNormalize(t, {
      by: 'row',
      zero: { kind: 'min' },
      full: { kind: 'max' },
      unit: 'percent',
    });
    expect(r.problem).toMatch(/own control/);
  });

  it('refuses summary data row by row and CV formats', () => {
    const t = column({ a: [1] });
    const summary = { ...t, format: { kind: 'summary', stats: 'mean-sd-n' } } as Table;
    expect(calculateNormalize(summary, foldOf(summary, 'a', 'row')).problem).toMatch(/as a whole/);
    const cv = { ...t, format: { kind: 'summary', stats: 'mean-cv' } } as Table;
    expect(calculateNormalize(cv, foldOf(cv, 'a')).problem).toMatch(/CV/);
  });

  it('leaves excluded values out of both the reference and the result', () => {
    const t = column({ c: [2, 100, 4], a: [1, 2, 3] });
    const excluded = new Set([cellKey(0, t.rows[1]?.id ?? asId(''))]);
    const withExclusion: Table = {
      ...t,
      dataSets: t.dataSets.map((d) => (d.title === 'c' ? { ...d, excluded } : d)),
    };
    const r = calculateNormalize(withExclusion, foldOf(withExclusion, 'c'));
    // control mean of 2 and 4 is 3; the excluded cell is empty in the result
    expect(r.cells[1]?.[0]).toEqual([1 / 3, 2 / 3, 1]);
    expect(r.cells[0]?.[0]).toEqual([2 / 3, null, 4 / 3]);
  });

  it('copies X and normalises the Y data sets of an XY table', () => {
    const xy = createXyTable({ title: 'xy', groups: ['ctrl', 'drug'], rows: 3 });
    const t: Table = {
      ...xy,
      dataSets: xy.dataSets.map((d, i) => ({
        ...d,
        subcolumns: [
          [
            [0, 1, 2],
            [2, 4, 8],
            [4, 6, 8],
          ][i] ?? [],
        ],
      })),
    };
    const r = calculateNormalize(t, foldOf(t, 'ctrl', 'row'));
    expect(r.problem).toBeNull();
    expect(r.cells[0]?.[0]).toEqual([0, 1, 2]);
    expect(r.cells[1]?.[0]).toEqual([1, 1, 1]);
    expect(r.cells[2]?.[0]).toEqual([2, 1.5, 1]);
  });

  it('scales the SD but not n, and refuses a flipped scale for summary data', () => {
    const base = createColumnTable({
      title: 's',
      groups: ['a', 'b'],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const t: Table = {
      ...base,
      dataSets: base.dataSets.map((d, i) => ({
        ...d,
        subcolumns: [[[10, 20][i] ?? 0], [[2, 6][i] ?? 0], [[5, 4][i] ?? 0]],
      })),
    };
    const r = calculateNormalize(t, { ...foldOf(t, 'a'), unit: 'percent' });
    expect(r.cells[1]).toEqual([[200], [60], [4]]);
    const flipped = calculateNormalize(t, {
      by: 'whole',
      zero: { kind: 'value', value: 50 },
      full: { kind: 'value', value: 40 },
      unit: 'percent',
    });
    expect(flipped.problem).toMatch(/flip the SD/);
  });
});
