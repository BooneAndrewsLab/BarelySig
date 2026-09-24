/**
 * The app's t tests, run in the app's WebR on every fixture the R oracle
 * wrote (CLAUDE.md, Correctness), and their plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine, EngineError } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import { type Analysis, type Project, type TTestOptions, createProject } from '@/model/project';
import { type EntryFormat, createColumnTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { ttest } from '.';
import type { TTestData, TTestRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => f.input[k] ?? [];
const present = (xs: readonly (number | null)[]) => xs.filter((v): v is number => v !== null);
const one = (f: Fixture, k: string) => col(f, k)[0] ?? null;

function requestFor(f: Fixture): TTestRequest {
  const o = f.options ?? {};
  const options: TTestOptions = {
    paired: o['paired'] === true,
    welch: o['welch'] === true,
    tails: 'two',
  };
  let data: TTestData;
  if (o['from'] === 'summary') {
    data = {
      kind: 'summary',
      a: { mean: one(f, 'mean_a'), sd: one(f, 'sd_a'), n: one(f, 'n_a') },
      b: { mean: one(f, 'mean_b'), sd: one(f, 'sd_b'), n: one(f, 'n_b') },
    };
  } else if (options.paired) {
    const a = col(f, 'a');
    const b = col(f, 'b');
    const rows = a
      .map((v, i) => [v, b[i] ?? null] as const)
      .filter(([x, y]) => x !== null && y !== null);
    data = { kind: 'paired', a: rows.map(([x]) => x ?? 0), b: rows.map(([, y]) => y ?? 0) };
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

describe('t tests, against the R oracle', () => {
  const fixtures = loadFixtures('ttest');

  it('covers unpaired, Welch, paired and summary data', () => {
    const names = fixtures.map((f) => f.id);
    for (const kind of ['unpaired-', 'welch-', 'paired-', 'summary-']) {
      expect(names.filter((n) => n.includes(`/${kind}`)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(ttest.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      // The typed result carries exactly what R computed.
      const r = ttest.parse(out.value, request, out.warnings);
      const raw = out.value as Record<string, number | null>;
      expect(r.pTwo).toBe(raw['p_two']);
      expect(r.pOne).toBe((raw['p_two'] ?? 0) / 2);
      expect([r.t, r.df, r.difference, r.ciLower, r.ciUpper]).toEqual([
        raw['t'],
        raw['df'],
        raw['difference'],
        raw['ci_lower'],
        raw['ci_upper'],
      ]);
      expect(r.test).toBe(
        request.options.paired ? 'paired' : request.options.welch ? 'welch' : 'unpaired',
      );
      if (!request.options.paired) expect(r.fTest?.f ?? null).toBe(raw['f']);
    },
    60_000,
  );
});

describe('what R refuses, in plain words', () => {
  async function refusal(data: TTestData, welch = false): Promise<string> {
    const req: TTestRequest = {
      a: { id: 'a', title: 'A' },
      b: { id: 'b', title: 'B' },
      options: { paired: data.kind === 'paired', welch, tails: 'two' },
      data,
      dropped: { a: null, b: null, rows: null },
    };
    try {
      await engine.run(ttest.job(req));
    } catch (e: unknown) {
      if (e instanceof EngineError && e.kind === 'analysis') return e.message;
      throw e;
    }
    throw new Error('expected a refusal');
  }

  it('explains why there is nothing to test', async () => {
    expect(await refusal({ kind: 'unpaired', a: [5, 5, 5], b: [7, 7] })).toMatch(
      /^Every value within each group is the same/,
    );
    expect(await refusal({ kind: 'paired', a: [1, 2, 3], b: [2, 3, 4] })).toMatch(
      /^Every pair differs by exactly the same amount/,
    );
    expect(await refusal({ kind: 'unpaired', a: [1], b: [2, 3] })).toBe(
      'Each group needs at least two values for a t test.',
    );
    expect(
      await refusal({ kind: 'summary', a: { mean: 1, sd: 0, n: 3 }, b: { mean: 2, sd: 0, n: 3 } }),
    ).toMatch(/^Both SDs are 0/);
    expect(
      await refusal({
        kind: 'summary',
        a: { mean: 1, sd: 1, n: 2.5 },
        b: { mean: 2, sd: 1, n: 3 },
      }),
    ).toBe('n must be a whole number.');
    expect(
      await refusal({ kind: 'summary', a: { mean: 1, sd: -1, n: 3 }, b: { mean: 2, sd: 1, n: 3 } }),
    ).toBe("An SD can't be negative.");
  }, 60_000);
});

describe('prepare', () => {
  type TTest = Extract<Analysis, { kind: 't-test' }>;

  function setup(values: readonly (readonly Cell[])[], format?: EntryFormat) {
    const titles = values.map((_, i) => `G${String(i)}`);
    const table = createColumnTable({
      title: 'T',
      groups: titles,
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
    const analysis = (options: Partial<TTestOptions> = {}, n = 2): TTest => ({
      id: asId('a_1'),
      title: 't',
      kind: 't-test',
      options: { paired: false, welch: false, tails: 'two', ...options },
      input: {
        kind: 'table',
        table: table.id,
        dataSets: table.dataSets.slice(0, n).map((d) => d.id),
      },
    });
    return { p, analysis };
  }

  it('needs exactly two groups', () => {
    const s = setup([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(ttest.prepare(s.analysis({}, 3), s.p)).toEqual({
      ok: false,
      reason: 'A t test compares two groups; this one has 3. Choose two, or use one-way ANOVA.',
    });
    expect(ttest.prepare(s.analysis({}, 1), s.p)).toMatchObject({
      reason: 'A t test compares two groups; choose two.',
    });
  });

  it('needs two values per group, saying which group is short', () => {
    const s = setup([
      [1, 2, 3],
      [4, null],
    ]);
    expect(ttest.prepare(s.analysis(), s.p)).toMatchObject({
      reason: 'Each group needs at least two values for a t test; G1 has 1 value.',
    });
  });

  it('pairs by row, dropping incomplete rows, and counts them', () => {
    const s = setup([
      [1, 2, null, 4],
      [2, 3, 5, null],
    ]);
    const r = ttest.prepare(s.analysis({ paired: true }), s.p);
    expect(r.ok && [r.request.data, r.request.dropped.rows]).toEqual([
      { kind: 'paired', a: [1, 2], b: [2, 3] },
      2,
    ]);
  });

  it('takes summary data unpaired only, and only with n', () => {
    const withN = setup(
      [
        [10, 2, 5],
        [12, 3, 5],
      ],
      { kind: 'summary', stats: 'mean-sd-n' },
    );
    expect(ttest.prepare(withN.analysis(), withN.p)).toMatchObject({
      ok: true,
      request: { data: { kind: 'summary', a: { mean: 10, sd: 2, n: 5 } } },
    });
    expect(ttest.prepare(withN.analysis({ paired: true }), withN.p)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/paired t test needs the individual values/) as string,
    });
    const noN = setup(
      [
        [10, 2],
        [12, 3],
      ],
      { kind: 'summary', stats: 'mean-sd' },
    );
    expect(ttest.prepare(noN.analysis(), noN.p)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/needs n/) as string,
    });
    const sem = setup(
      [
        [10, 1, 4],
        [12, 1, 9],
      ],
      { kind: 'summary', stats: 'mean-sem-n' },
    );
    const r = ttest.prepare(sem.analysis(), sem.p);
    expect(r.ok && r.request.data).toEqual({
      kind: 'summary',
      a: { mean: 10, sd: 2, n: 4 },
      b: { mean: 12, sd: 3, n: 9 },
    });
  });
});
