/**
 * The app's one-way ANOVA, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine, EngineError } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import {
  type AllPairsTest,
  type Analysis,
  type Comparisons,
  type ControlTest,
  type OneWayOptions,
  type Project,
  createProject,
} from '@/model/project';
import { type EntryFormat, createColumnTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { oneway } from '.';
import type { OneWayRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const present = (xs: readonly (number | null)[]) => xs.filter((v): v is number => v !== null);
const nums = (f: Fixture, k: string) => present(f.input[k] ?? []);

function requestFor(f: Fixture): OneWayRequest {
  const o = f.options ?? {};
  const test = typeof o['test'] === 'string' ? o['test'] : 'tukey';
  const controlIndex = typeof o['control'] === 'number' ? o['control'] - 1 : 0;
  const summary = o['from'] === 'summary';
  const k = summary ? nums(f, 'means').length : Object.keys(f.input).length;
  const groups = Array.from({ length: k }, (_, i) => ({
    id: `g${String(i + 1)}`,
    title: `G${String(i + 1)}`,
  }));
  const comparisons: Comparisons =
    o['comparisons'] === 'none'
      ? { kind: 'none' }
      : o['comparisons'] === 'control'
        ? {
            kind: 'control',
            control: asId(`g${String(controlIndex + 1)}`),
            test: test as ControlTest,
          }
        : { kind: 'all', test: test as AllPairsTest };
  const options: OneWayOptions = { welch: o['welch'] === true, comparisons };
  return {
    groups,
    options,
    control: comparisons.kind === 'control' ? controlIndex : null,
    data: summary
      ? { kind: 'summary', means: nums(f, 'means'), sds: nums(f, 'sds'), ns: nums(f, 'ns') }
      : { kind: 'values', groups: groups.map((g) => nums(f, g.id)) },
    dropped: groups.map(() => null),
  };
}

describe('one-way ANOVA, against the R oracle', () => {
  const fixtures = loadFixtures('oneway');

  it('covers every comparison test, Welch, and summary data', () => {
    const tests = new Set(fixtures.map((f) => f.options?.['test']));
    for (const t of [
      'tukey',
      'dunnett',
      'sidak',
      'bonferroni',
      'games-howell',
      'dunnett-t3',
      'tamhane-t2',
    ])
      expect(tests).toContain(t);
    expect(fixtures.some((f) => f.options?.['from'] === 'summary')).toBe(true);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(oneway.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = oneway.parse(out.value, request, out.warnings);
      const raw = out.value as unknown as { p: number; comparisons: readonly { p: number }[] };
      expect(r.anova.p).toBe(raw.p);
      expect(r.pairs.map((c) => c.p)).toEqual(raw.comparisons.map((c) => c.p));
      expect(r.groups.map((g) => g.id)).toEqual(request.groups.map((g) => g.id));
    },
    120_000,
  );
});

describe('what R refuses, in plain words', () => {
  it('explains ANOVA without scatter, and Welch without an SD', async () => {
    const req = (groups: number[][], welch = false): OneWayRequest => ({
      groups: groups.map((_, i) => ({ id: `g${String(i)}`, title: `G${String(i)}` })),
      options: {
        welch,
        comparisons: { kind: 'all', test: welch ? 'games-howell' : 'tukey' },
      },
      control: null,
      data: { kind: 'values', groups },
      dropped: groups.map(() => null),
    });
    const refusal = async (r: OneWayRequest) => {
      try {
        await engine.run(oneway.job(r));
      } catch (e: unknown) {
        if (e instanceof EngineError && e.kind === 'analysis') return e.message;
        throw e;
      }
      throw new Error('expected a refusal');
    };
    expect(
      await refusal(
        req([
          [1, 1],
          [2, 2],
        ]),
      ),
    ).toMatch(/^Every value within each group is the same/);
    expect(await refusal(req([[1], [2]]))).toMatch(/^One-way ANOVA needs more values than groups/);
    expect(
      await refusal(
        req(
          [
            [1, 2, 3],
            [4, 4, 4],
          ],
          true,
        ),
      ),
    ).toMatch(/^Welch's ANOVA needs at least two values and some scatter/);
  }, 60_000);
});

describe('prepare', () => {
  type OneWay = Extract<Analysis, { kind: 'one-way-anova' }>;

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
    const ids = table.dataSets.map((d) => d.id);
    const analysis = (options: Partial<OneWayOptions> = {}, n = values.length): OneWay => ({
      id: asId('a_1'),
      title: 'anova',
      kind: 'one-way-anova',
      options: { welch: false, comparisons: { kind: 'all', test: 'tukey' }, ...options },
      input: { kind: 'table', table: table.id, dataSets: ids.slice(0, n) },
    });
    return { p, analysis, ids };
  }

  it('needs two groups, each with a value', () => {
    const s = setup([[1, 2], [3, 4], [null]]);
    expect(oneway.prepare(s.analysis({}, 1), s.p)).toMatchObject({
      reason: 'One-way ANOVA compares at least two groups; choose more.',
    });
    expect(oneway.prepare(s.analysis(), s.p)).toMatchObject({
      reason:
        'Every group needs at least one value; G2 has none. Leave it out, or enter its values.',
    });
  });

  it('finds the control among the groups, and refuses a test that doesn’t fit the SDs', () => {
    const s = setup([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    const [, second] = s.ids;
    if (!second) throw new Error('unreachable');
    const ok = oneway.prepare(
      s.analysis({ comparisons: { kind: 'control', control: second, test: 'dunnett' } }),
      s.p,
    );
    expect(ok.ok && ok.request.control).toBe(1);
    expect(
      oneway.prepare(
        s.analysis({ comparisons: { kind: 'control', control: second, test: 'dunnett' } }, 1),
        s.p,
      ),
    ).toMatchObject({ ok: false });
    expect(
      oneway.prepare(s.analysis({ welch: true, comparisons: { kind: 'all', test: 'tukey' } }), s.p),
    ).toMatchObject({
      reason:
        'Tukey’s test assumes the groups have the same SD; after Welch’s ANOVA choose Games-Howell, Dunnett T3 or Tamhane T2.',
    });
  });

  it('takes summary data with n, converting SEM to SD', () => {
    const s = setup(
      [
        [10, 1, 4],
        [12, 1, 9],
      ],
      { kind: 'summary', stats: 'mean-sem-n' },
    );
    const r = oneway.prepare(s.analysis(), s.p);
    expect(r.ok && r.request.data).toEqual({
      kind: 'summary',
      means: [10, 12],
      sds: [2, 3],
      ns: [4, 9],
    });
    const noN = setup(
      [
        [10, 2],
        [12, 3],
      ],
      { kind: 'summary', stats: 'mean-sd' },
    );
    expect(oneway.prepare(noN.analysis(), noN.p)).toMatchObject({
      reason: expect.stringMatching(/needs n for each group/) as string,
    });
  });
});
