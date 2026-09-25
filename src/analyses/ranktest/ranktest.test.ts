/**
 * The app's Mann-Whitney and Wilcoxon tests, run in the app's WebR on
 * every fixture the R oracle wrote (CLAUDE.md, Correctness), and their
 * plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine, EngineError } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import { type Analysis, type Project, type RankTestOptions, createProject } from '@/model/project';
import { type EntryFormat, createColumnTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { ranktest } from '.';
import type { RankTestData, RankTestRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => f.input[k] ?? [];
const present = (xs: readonly (number | null)[]) => xs.filter((v): v is number => v !== null);

function requestFor(f: Fixture): RankTestRequest {
  const o = f.options ?? {};
  const options: RankTestOptions = {
    paired: o['paired'] === true,
    tails: 'two',
    zeros: o['zeros'] === 'pratt' ? 'pratt' : 'wilcoxon',
  };
  let data: RankTestData;
  if (options.paired) {
    const a = col(f, 'a');
    const b = col(f, 'b');
    const rows = a.flatMap((x, i) => {
      const y = b[i] ?? null;
      return x !== null && y !== null ? [[x, y] as const] : [];
    });
    data = { kind: 'paired', a: rows.map(([x]) => x), b: rows.map(([, y]) => y) };
  } else {
    data = { kind: 'unpaired', a: present(col(f, 'a')), b: present(col(f, 'b')) };
  }
  return {
    a: { id: 'a', title: 'A' },
    b: { id: 'b', title: 'B' },
    options,
    data,
    dropped: { a: null, b: null, rows: null },
  };
}

const BASE: RankTestRequest = {
  a: { id: 'a', title: 'A' },
  b: { id: 'b', title: 'B' },
  options: { paired: false, tails: 'two', zeros: 'wilcoxon' },
  data: { kind: 'unpaired', a: [1], b: [2] },
  dropped: { a: null, b: null, rows: null },
};

describe('rank tests, against the R oracle', () => {
  const fixtures = loadFixtures('ranktest');

  it('covers Mann-Whitney and Wilcoxon, exact and approximate', () => {
    const names = fixtures.map((f) => f.id);
    for (const kind of ['/mw-', '/wx-']) {
      expect(names.filter((n) => n.includes(kind)).length).toBeGreaterThanOrEqual(8);
    }
    expect(fixtures.some((f) => !(f.expected as { exact: boolean }).exact)).toBe(true);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(ranktest.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = ranktest.parse(out.value, request, out.warnings);
      const raw = out.value as Record<string, number | boolean | null>;
      expect([r.pTwo, r.pOne, r.exact, r.hodgesLehmann, r.ci.lower, r.ci.upper]).toEqual([
        raw['p_two'],
        raw['p_one'],
        raw['exact'],
        raw['hodges_lehmann'],
        raw['ci_lower'],
        raw['ci_upper'],
      ]);
      expect(r.test).toBe(request.options.paired ? 'wilcoxon' : 'mann-whitney');
    },
    60_000,
  );

  it('counts exactly with ties up to 100 against 100, and says when it approximates', async () => {
    const tied = (n: number, shift: number) =>
      Array.from({ length: n }, (_, i) => Math.round((i % 17) + shift));
    const job = (a: readonly number[], b: readonly number[]) =>
      engine.run(
        ranktest.job({
          ...BASE,
          data: { kind: 'unpaired', a, b },
        }),
      );
    const exact = await job(tied(100, 0), tied(100, 1));
    expect((exact.value as { exact: boolean }).exact).toBe(true);
    const over = await job(tied(101, 0), tied(120, 1));
    expect((over.value as { exact: boolean }).exact).toBe(false);
  }, 120_000);
});

describe('what R refuses, in plain words', () => {
  it('explains a Wilcoxon test with no differences', async () => {
    const req: RankTestRequest = {
      ...BASE,
      options: { paired: true, tails: 'two', zeros: 'wilcoxon' },
      data: { kind: 'paired', a: [1, 2, 3], b: [1, 2, 3] },
    };
    await expect(engine.run(ranktest.job(req))).rejects.toThrow(
      new EngineError(
        'analysis',
        'Every pair has the same value in both groups, so there is no difference to test.',
      ),
    );
  }, 60_000);
});

describe('prepare', () => {
  type RankTest = Extract<Analysis, { kind: 'rank-test' }>;

  function setup(values: readonly (readonly Cell[])[], format?: EntryFormat) {
    const table = createColumnTable({
      title: 'T',
      groups: values.map((_, i) => `G${String(i)}`),
      rows: Math.max(1, ...values.map((v) => v.length)),
      ...(format ? { format } : {}),
    });
    const cells = table.dataSets.flatMap((d, i) =>
      (values[i] ?? []).map((value, r) => ({
        dataSet: d.id,
        subcolumn: format?.kind === 'summary' ? r : 0,
        row: table.rows[format?.kind === 'summary' ? 0 : r]?.id ?? d.id,
        value,
      })),
    );
    const p: Project = applyEdit(applyEdit(createProject('P'), { op: 'addTable', table }), {
      op: 'setCells',
      table: table.id,
      cells,
    });
    const analysis = (options: Partial<RankTestOptions> = {}, n = 2): RankTest => ({
      id: asId('a_1'),
      title: 'r',
      kind: 'rank-test',
      options: { paired: false, tails: 'two', zeros: 'wilcoxon', ...options },
      input: {
        kind: 'table',
        table: table.id,
        dataSets: table.dataSets.slice(0, n).map((d) => d.id),
      },
    });
    return { p, analysis };
  }

  it('needs exactly two groups, pointing to Kruskal-Wallis for more', () => {
    const s = setup([[1], [2], [3]]);
    expect(ranktest.prepare(s.analysis({}, 3), s.p)).toMatchObject({
      reason:
        'A Mann-Whitney test compares two groups; this one has 3. Choose two, or use the Kruskal-Wallis test.',
    });
  });

  it('pairs by row for Wilcoxon, dropping incomplete rows', () => {
    const s = setup([
      [1, 2, null, 4],
      [2, 3, 5, null],
    ]);
    const r = ranktest.prepare(s.analysis({ paired: true }), s.p);
    expect(r.ok && [r.request.data, r.request.dropped.rows]).toEqual([
      { kind: 'paired', a: [1, 2], b: [2, 3] },
      2,
    ]);
  });

  it('refuses summary data and empty groups', () => {
    const sum = setup(
      [
        [10, 2, 5],
        [12, 3, 5],
      ],
      { kind: 'summary', stats: 'mean-sd-n' },
    );
    expect(ranktest.prepare(sum.analysis(), sum.p)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/can't be computed from summary data/) as string,
    });
    const empty = setup([[1, 2], [null]]);
    expect(ranktest.prepare(empty.analysis(), empty.p)).toMatchObject({
      reason: 'Each group needs at least one value for a Mann-Whitney test; G1 has none.',
    });
  });
});
