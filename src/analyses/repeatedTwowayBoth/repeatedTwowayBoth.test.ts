/**
 * Repeated-measures two-way ANOVA, both factors repeated (item 23, #84),
 * run in the app's WebR on every fixture the R oracle wrote (CLAUDE.md,
 * Correctness), and how it reads a Grouped table.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import { type Analysis, type Project, createProject } from '@/model/project';
import { createGroupedTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { repeatedTwowayBoth } from '.';
import type { RepeatedTwoWayBothRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => (f.input[k] ?? []).map((v) => v ?? 0);

function requestFor(f: Fixture): RepeatedTwoWayBothRequest {
  const y = col(f, 'y');
  const n = col(f, 'n')[0] ?? 0;
  const p = col(f, 'p')[0] ?? 0;
  const q = col(f, 'q')[0] ?? 0;
  const cells = p * q;
  const subjects = Array.from({ length: n }, (_, i) => ({
    values: y.slice(i * cells, (i + 1) * cells),
  }));
  const rows = Array.from({ length: p }, (_, i) => ({
    id: `r${String(i + 1)}`,
    title: `R${String(i + 1)}`,
  }));
  const columns = Array.from({ length: q }, (_, i) => ({
    id: `c${String(i + 1)}`,
    title: `C${String(i + 1)}`,
  }));
  return {
    rows,
    columns,
    options: {},
    subjects,
    droppedSubjects: 0,
  };
}

describe('repeated-measures two-way ANOVA (both factors repeated), against the R oracle', () => {
  const fixtures = loadFixtures('repeatedTwowayBoth');

  it('covers a dropped subject, the fewest subjects, and asymmetric factor sizes', () => {
    expect(fixtures.map((f) => f.id)).toEqual(
      expect.arrayContaining(
        [
          'balanced',
          'dropped-subject',
          'fewest-subjects',
          'asymmetric-levels',
          'larger-balanced',
        ].map((n) => `repeatedTwowayBoth/${n}`),
      ),
    );
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const p = request.rows.length;
      const q = request.columns.length;
      const n = request.subjects.length;
      const out = await engine.run({
        code: `${repeatedTwowayBoth.code}\nbs_repeated_twoway_both(y, n, p, q)`,
        inputs: {
          y: request.subjects.flatMap((s) => s.values),
          n,
          p,
          q,
        },
        packages: [],
      });
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = repeatedTwowayBoth.parse(out.value, request, out.warnings);
      expect(r.row.df).toBeGreaterThan(0);
    },
    120_000,
  );
});

describe('prepare', () => {
  type RTWB = Extract<Analysis, { kind: 'repeated-two-way-anova-both' }>;

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
    const analysis: RTWB = {
      id: asId('a_1'),
      title: 'repeated two-way, both factors',
      kind: 'repeated-two-way-anova-both',
      options: {},
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    };
    return { p, analysis, table };
  }

  it('matches subjects by subcolumn across every row and data set', () => {
    const s = setup([
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ],
    ]);
    const r = repeatedTwowayBoth.prepare(s.analysis, s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.subjects).toEqual([{ values: [1, 3, 5, 7] }, { values: [2, 4, 6, 8] }]);
    expect(r.request.droppedSubjects).toBe(0);
  });

  it('drops a subject missing a value at any cell', () => {
    const s = setup([
      [
        [1, 2, null],
        [3, 4, 5],
      ],
      [
        [6, 7, 8],
        [9, 10, 11],
      ],
    ]);
    const r = repeatedTwowayBoth.prepare(s.analysis, s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.subjects).toEqual([{ values: [1, 3, 6, 9] }, { values: [2, 4, 7, 10] }]);
    expect(r.request.droppedSubjects).toBe(1);
  });

  it('refuses summary data', () => {
    const table = createGroupedTable({
      title: 'T',
      rowTitles: ['A', 'B'],
      groups: ['D0', 'D1'],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const p: Project = applyEdit(createProject('P'), { op: 'addTable', table });
    const r = repeatedTwowayBoth.prepare(
      {
        id: asId('a_1'),
        title: 'repeated two-way, both factors',
        kind: 'repeated-two-way-anova-both',
        options: {},
        input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
      },
      p,
    );
    expect(r).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/individual values/) as string,
    });
  });

  it('refuses too few complete subjects', () => {
    const s = setup([
      [[1], [3]],
      [[5], [7]],
    ]);
    const r = repeatedTwowayBoth.prepare(s.analysis, s.p);
    expect(r).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/at least two complete subjects/) as string,
    });
  });
});
