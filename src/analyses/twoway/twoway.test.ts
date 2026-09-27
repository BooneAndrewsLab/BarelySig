/**
 * The app's two-way ANOVA, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and how it reads a Grouped table.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import {
  type AllPairsTest,
  type Analysis,
  type Comparisons,
  type ControlTest,
  type Project,
  type TwoWayFamily,
  type TwoWayOptions,
  createProject,
} from '@/model/project';
import { type EntryFormat, createGroupedTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { twoway } from '.';
import type { TwoWayRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => f.input[k] ?? [];

function requestFor(f: Fixture): TwoWayRequest {
  const o = f.options ?? {};
  const ri = col(f, 'ri').map((v) => v ?? 0);
  const ci = col(f, 'ci').map((v) => v ?? 0);
  const R = Math.max(...ri);
  const C = Math.max(...ci);
  const rows = Array.from({ length: R }, (_, i) => ({
    id: `r${String(i + 1)}`,
    title: `R${String(i + 1)}`,
  }));
  const columns = Array.from({ length: C }, (_, i) => ({
    id: `c${String(i + 1)}`,
    title: `C${String(i + 1)}`,
  }));
  const family = (typeof o['family'] === 'string' ? o['family'] : 'within-rows') as TwoWayFamily;
  const test = typeof o['test'] === 'string' ? o['test'] : 'tukey';
  const control = typeof o['control'] === 'number' ? o['control'] - 1 : null;
  const comparisons: Comparisons =
    o['comparisons'] === 'all'
      ? { kind: 'all', test: test as AllPairsTest }
      : o['comparisons'] === 'control'
        ? { kind: 'control', control: asId('x'), test: test as ControlTest }
        : { kind: 'none' };
  const options: TwoWayOptions = { family, comparisons };
  if (o['from'] === 'summary') {
    const nums = (k: string) => col(f, k).map((v) => v ?? 0);
    return {
      rows,
      columns,
      options,
      control,
      emptyRows: 0,
      droppedValues: 0,
      data: { kind: 'summary', means: nums('means'), sds: nums('sds'), ns: nums('ns'), ri, ci },
    };
  }
  const y = col(f, 'y');
  const keep = y.map((v) => v !== null);
  return {
    rows,
    columns,
    options,
    control,
    emptyRows: 0,
    droppedValues: 0,
    data: {
      kind: 'values',
      y: y.filter((v): v is number => v !== null),
      ri: ri.filter((_, i) => keep[i]),
      ci: ci.filter((_, i) => keep[i]),
    },
  };
}

describe('two-way ANOVA, against the R oracle', () => {
  const fixtures = loadFixtures('twoway');

  it('covers every family, both reduced models and summary data', () => {
    const families = new Set(fixtures.map((f) => f.options?.['family']));
    for (const fam of ['within-rows', 'within-columns', 'main-columns', 'main-rows', 'all-cells'])
      expect(families).toContain(fam);
    const why = fixtures.map((f) => (f.expected as { why: string | null }).why);
    expect(why).toContain('empty-cell');
    expect(why).toContain('no-replicates');
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(twoway.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = twoway.parse(out.value, request, out.warnings);
      const raw = out.value as unknown as { comparisons: readonly { p: number }[] };
      expect(r.families.flatMap((x) => x.pairs.map((c) => c.p))).toEqual(
        raw.comparisons.map((c) => c.p),
      );
    },
    120_000,
  );
});

describe('prepare', () => {
  type TwoWay = Extract<Analysis, { kind: 'two-way-anova' }>;

  /** values[row][dataSet] = the replicates of that cell. */
  function setup(values: readonly (readonly (readonly Cell[])[])[], format?: EntryFormat) {
    const table = createGroupedTable({
      title: 'T',
      rowTitles: values.map((_, i) => (i === 1 ? '' : `Row ${String.fromCharCode(65 + i)}`)),
      groups: (values[0] ?? []).map((_, i) => `D${String(i)}`),
      format: format ?? { kind: 'replicates', count: 3 },
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
    const analysis = (options: Partial<TwoWayOptions> = {}): TwoWay => ({
      id: asId('a_1'),
      title: 'two-way',
      kind: 'two-way-anova',
      options: { family: 'within-rows', comparisons: { kind: 'all', test: 'tukey' }, ...options },
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    });
    return { p, analysis, table };
  }

  it('reads cells by row and data set, leaving out empty rows and cells', () => {
    const s = setup([
      [
        [1, 2, null],
        [3, 4, 5],
      ],
      [
        [6, null, null],
        [7, 8, 9],
      ],
      [
        [null, null, null],
        [null, null, null],
      ],
    ]);
    const r = twoway.prepare(s.analysis(), s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.data).toEqual({
      kind: 'values',
      y: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ri: [1, 1, 1, 1, 1, 2, 2, 2, 2],
      ci: [1, 1, 2, 2, 2, 1, 2, 2, 2],
    });
    expect(r.request.rows.map((x) => x.title)).toEqual(['Row A', 'Row 2']);
    expect([r.request.emptyRows, r.request.droppedValues]).toEqual([1, 3]);
  });

  it('finds a control among data sets or rows, as the family needs', () => {
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
    const [, d1] = s.table.dataSets;
    const [, r1] = s.table.rows;
    if (!d1 || !r1) throw new Error('unreachable');
    const byColumn = twoway.prepare(
      s.analysis({
        family: 'main-columns',
        comparisons: { kind: 'control', control: d1.id, test: 'dunnett' },
      }),
      s.p,
    );
    expect(byColumn.ok && byColumn.request.control).toBe(1);
    const wrong = twoway.prepare(
      s.analysis({
        family: 'within-columns',
        comparisons: { kind: 'control', control: d1.id, test: 'dunnett' },
      }),
      s.p,
    );
    expect(wrong).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/control row/) as string,
    });
    const row = twoway.prepare(
      s.analysis({
        family: 'within-columns',
        comparisons: { kind: 'control', control: r1.id, test: 'dunnett' },
      }),
      s.p,
    );
    expect(row.ok && row.request.control).toBe(1);
  });

  it('takes summary data whether balanced or not (#51)', () => {
    const balanced = setup(
      [
        [
          [10, 2, 4],
          [12, 3, 4],
        ],
        [
          [11, 2, 4],
          [15, 3, 4],
        ],
      ],
      { kind: 'summary', stats: 'mean-sd-n' },
    );
    expect(twoway.prepare(balanced.analysis(), balanced.p)).toMatchObject({
      ok: true,
      request: { data: { kind: 'summary', ns: [4, 4, 4, 4] } },
    });
    const unbalanced = setup(
      [
        [
          [10, 2, 4],
          [12, 3, 5],
        ],
        [
          [11, 2, 4],
          [15, 3, 4],
        ],
      ],
      { kind: 'summary', stats: 'mean-sd-n' },
    );
    expect(twoway.prepare(unbalanced.analysis(), unbalanced.p)).toMatchObject({
      ok: true,
      request: { data: { kind: 'summary', ns: [4, 5, 4, 4] } },
    });
  });
});
