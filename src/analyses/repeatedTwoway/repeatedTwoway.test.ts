/**
 * Repeated-measures two-way ANOVA, one factor repeated (item 22, #81),
 * and its comparisons (item 24, #85), run in the app's WebR on every
 * fixture the R oracle wrote (CLAUDE.md, Correctness), and how it reads
 * a Grouped table.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import {
  type Analysis,
  type EQUAL_SD_ALL,
  type EQUAL_SD_CONTROL,
  type NestedComparisons,
  type Project,
  type RepeatedTwoWayFamily,
  type RepeatedTwoWayOptions,
  createProject,
} from '@/model/project';
import { createGroupedTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { repeatedTwoway } from '.';
import type { RepeatedTwoWayRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => (f.input[k] ?? []).map((v) => v ?? 0);

function requestFor(f: Fixture): RepeatedTwoWayRequest {
  const y = col(f, 'y');
  const level = col(f, 'level');
  const n = level.length;
  const p = Math.max(...level);
  const q = y.length / n;
  const subjects = Array.from({ length: n }, (_, i) => ({
    level: (level[i] ?? 1) - 1,
    values: y.slice(i * q, (i + 1) * q),
  }));
  const rows = Array.from({ length: p }, (_, i) => ({
    id: `r${String(i + 1)}`,
    title: `R${String(i + 1)}`,
  }));
  const columns = Array.from({ length: q }, (_, i) => ({
    id: `c${String(i + 1)}`,
    title: `C${String(i + 1)}`,
  }));
  const o = f.options ?? {};
  const repeatedFactor = o['repeatedFactor'] === 'row' ? 'row' : 'column';
  const family = (o['family'] as RepeatedTwoWayFamily | undefined) ?? 'simple';
  const test = typeof o['test'] === 'string' ? o['test'] : 'tukey';
  const controlIndex = typeof o['control'] === 'number' ? o['control'] - 1 : null;
  // Whichever levels the fixture's family compares (see index.ts's own logic).
  const betweenNamed = repeatedFactor === 'column' ? rows : columns;
  const repeatedNamed = repeatedFactor === 'column' ? columns : rows;
  const comparedIds = (family === 'main-repeated' ? repeatedNamed : betweenNamed).map((x) => x.id);
  const comparisons: NestedComparisons =
    o['comparisons'] === 'control'
      ? {
          kind: 'control',
          control: asId(comparedIds[controlIndex ?? 0] ?? comparedIds[0] ?? 'r1'),
          test: test as (typeof EQUAL_SD_CONTROL)[number],
        }
      : o['comparisons'] === 'all'
        ? { kind: 'all', test: test as (typeof EQUAL_SD_ALL)[number] }
        : { kind: 'none' };
  const options: RepeatedTwoWayOptions = { repeatedFactor, family, comparisons };
  return {
    rows,
    columns,
    options,
    subjects,
    droppedSubjects: 0,
    control: comparisons.kind === 'control' ? controlIndex : null,
  };
}

describe('repeated-measures two-way ANOVA, against the R oracle', () => {
  const fixtures = loadFixtures('repeatedTwoway');

  it('covers unequal group sizes, the fewest subjects, q = 2 and both repeated factors', () => {
    expect(fixtures.map((f) => f.id)).toEqual(
      expect.arrayContaining(
        [
          'balanced',
          'unbalanced',
          'dropped-subject',
          'fewest-subjects',
          'two-repeated-levels',
          'row-repeated',
        ].map((n) => `repeatedTwoway/${n}`),
      ),
    );
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(repeatedTwoway.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = repeatedTwoway.parse(out.value, request, out.warnings);
      expect(r.between.f).toBeGreaterThan(0);
      const raw = out.value as Record<string, unknown>;
      expect(r.families.length).toBe((raw['families'] as unknown[]).length);
    },
    120_000,
  );
});

describe('prepare', () => {
  type RTW = Extract<Analysis, { kind: 'repeated-two-way-anova' }>;

  /** values[row][dataSet][subcolumn]: a Grouped table, `count` replicates per cell. */
  function setup(values: readonly (readonly (readonly Cell[])[])[]) {
    const count = Math.max(...values.flatMap((row) => row.map((cell) => cell.length)));
    const table = createGroupedTable({
      title: 'T',
      rowTitles: values.map((_, i) => `Row ${String.fromCharCode(65 + i)}`),
      groups: (values[0] ?? []).map((_, i) => `D${String(i)}`),
      format: { kind: 'replicates', count },
    });
    const cells = values.flatMap((row, r) =>
      row.flatMap((reps, d) =>
        reps.map((value, s) => ({
          dataSet: table.dataSets[d]?.id ?? table.id,
          subcolumn: s,
          row: table.rows[r]?.id ?? table.id,
          value,
        })),
      ),
    );
    const p: Project = applyEdit(applyEdit(createProject('P'), { op: 'addTable', table }), {
      op: 'setCells',
      table: table.id,
      cells,
    });
    const analysis = (options: Partial<RepeatedTwoWayOptions> = {}): RTW => ({
      id: asId('a_1'),
      title: 'repeated two-way',
      kind: 'repeated-two-way-anova',
      options: {
        repeatedFactor: 'column',
        family: 'simple',
        comparisons: { kind: 'none' },
        ...options,
      },
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    });
    return { p, analysis, table };
  }

  it('matches subjects by subcolumn across data sets (column repeated)', () => {
    const s = setup([
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      [
        [7, 8, 9],
        [10, 11, 12],
      ],
    ]);
    const r = repeatedTwoway.prepare(s.analysis(), s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.subjects).toEqual([
      { level: 0, values: [1, 4] },
      { level: 0, values: [2, 5] },
      { level: 0, values: [3, 6] },
      { level: 1, values: [7, 10] },
      { level: 1, values: [8, 11] },
      { level: 1, values: [9, 12] },
    ]);
    expect(r.request.droppedSubjects).toBe(0);
  });

  it('drops a subject missing a value in any repeated level', () => {
    const s = setup([
      [
        [1, 2, null],
        [4, 5, 6],
      ],
      [
        [7, 8, 9],
        [10, 11, 12],
      ],
    ]);
    const r = repeatedTwoway.prepare(s.analysis(), s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.subjects.map((x) => x.values)).toEqual([
      [1, 4],
      [2, 5],
      [7, 10],
      [8, 11],
      [9, 12],
    ]);
    expect(r.request.droppedSubjects).toBe(1);
  });

  it('matches subjects by subcolumn across rows (row repeated)', () => {
    const s = setup([
      [
        [1, 2],
        [7, 8],
      ],
      [
        [4, 5],
        [10, 11],
      ],
    ]);
    const r = repeatedTwoway.prepare(s.analysis({ repeatedFactor: 'row' }), s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.subjects).toEqual([
      { level: 0, values: [1, 4] },
      { level: 0, values: [2, 5] },
      { level: 1, values: [7, 10] },
      { level: 1, values: [8, 11] },
    ]);
  });

  it('refuses summary data', () => {
    const table = createGroupedTable({
      title: 'T',
      rowTitles: ['A', 'B'],
      groups: ['D0', 'D1'],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const p: Project = applyEdit(createProject('P'), { op: 'addTable', table });
    const r = repeatedTwoway.prepare(
      {
        id: asId('a_1'),
        title: 'repeated two-way',
        kind: 'repeated-two-way-anova',
        options: { repeatedFactor: 'column', family: 'simple', comparisons: { kind: 'none' } },
        input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
      },
      p,
    );
    expect(r).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/individual values/) as string,
    });
  });
});
