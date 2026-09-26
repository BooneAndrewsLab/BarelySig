/**
 * The app's nested one-way ANOVA, run in the app's WebR on every fixture
 * the R oracle wrote (CLAUDE.md, Correctness), and its plain-language
 * refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine, EngineError } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId, newId } from '@/model/ids';
import {
  type Analysis,
  type EQUAL_SD_ALL,
  type EQUAL_SD_CONTROL,
  type NestedComparisons,
  createProject,
} from '@/model/project';
import { type NestedTable, emptyDataSet, newRows } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { nestedOneway } from '.';
import type { NestedOneWayGroupData, NestedOneWayRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => (f.input[k] ?? []) as readonly number[];

/** Groups a fixture's flat value/group/replicate columns back into ragged replicates per group. */
function groupsOf(f: Fixture): NestedOneWayGroupData[] {
  const k = col(f, 'k')[0] ?? 0;
  const value = col(f, 'value');
  const groupIdx = col(f, 'group_idx');
  const replicateIdx = col(f, 'replicate_idx');
  return Array.from({ length: k }, (_, gi) => {
    const byReplicate = new Map<number, number[]>();
    value.forEach((v, i) => {
      if ((groupIdx[i] ?? 0) !== gi + 1) return;
      const r = replicateIdx[i] ?? 0;
      (byReplicate.get(r) ?? byReplicate.set(r, []).get(r))?.push(v);
    });
    return { replicates: [...byReplicate.values()] };
  });
}

function requestFor(f: Fixture): NestedOneWayRequest {
  const o = f.options ?? {};
  const test = typeof o['test'] === 'string' ? o['test'] : 'tukey';
  const controlIndex = typeof o['control'] === 'number' ? o['control'] - 1 : null;
  const data = groupsOf(f);
  const groups = data.map((_, i) => ({ id: `g${String(i + 1)}`, title: `G${String(i + 1)}` }));
  const comparisons: NestedComparisons =
    o['comparisons'] === 'none'
      ? { kind: 'none' }
      : o['comparisons'] === 'control'
        ? {
            kind: 'control',
            control: asId(`g${String((controlIndex ?? 0) + 1)}`),
            test: test as (typeof EQUAL_SD_CONTROL)[number],
          }
        : { kind: 'all', test: test as (typeof EQUAL_SD_ALL)[number] };
  return {
    groups,
    comparisons,
    control: comparisons.kind === 'control' ? controlIndex : null,
    data,
    droppedReplicates: data.map(() => 0),
  };
}

describe('nested one-way ANOVA, against the R oracle', () => {
  const fixtures = loadFixtures('nested-oneway');

  it('covers all-pairs and control comparisons, several groups', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(nestedOneway.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = nestedOneway.parse(out.value, request, out.warnings);
      const raw = out.value as Record<string, unknown>;
      expect(r.anova.f).toBe(raw['f']);
      expect(r.anova.dfn).toBe(raw['dfn']);
      expect(r.anova.dfd).toBe(raw['dfd']);
      expect(r.anova.p).toBe(raw['p']);
      expect(r.pairs.length).toBe((raw['comparisons'] as unknown[]).length);
    },
    60_000,
  );
});

describe('what R refuses, in plain words', () => {
  async function refusal(request: NestedOneWayRequest): Promise<string> {
    try {
      await engine.run(nestedOneway.job(request));
    } catch (e: unknown) {
      if (e instanceof EngineError && e.kind === 'analysis') return e.message;
      throw e;
    }
    throw new Error('expected a refusal');
  }

  it('needs at least two replicates per group', async () => {
    const groups = [
      { id: 'g1', title: 'G1' },
      { id: 'g2', title: 'G2' },
      { id: 'g3', title: 'G3' },
    ];
    expect(
      await refusal({
        groups,
        comparisons: { kind: 'none' },
        control: null,
        data: [
          { replicates: [[1, 2]] },
          { replicates: [[3, 4], [5]] },
          { replicates: [[6, 7], [8]] },
        ],
        droppedReplicates: [0, 0, 0],
      }),
    ).toMatch(/^Each group needs at least two replicates/);
  }, 60_000);
});

describe('prepare', () => {
  type NestedOneWay = Extract<Analysis, { kind: 'nested-one-way-anova' }>;

  function setup(groups: readonly (readonly (readonly (number | null)[])[])[]) {
    const replicates = Math.max(1, ...groups.map((g) => g.length));
    const rowCount = Math.max(1, ...groups.flatMap((g) => g.map((r) => r.length)));
    const format = { kind: 'replicates' as const, count: replicates };
    const table: NestedTable = {
      id: newId('t'),
      type: 'nested',
      title: 'N',
      format,
      rows: newRows(rowCount),
      dataSets: groups.map((g, gi) => {
        const d = emptyDataSet(newId('ds'), `G${String(gi)}`, rowCount, format);
        return {
          ...d,
          subcolumns: Array.from({ length: replicates }, (_, s) => {
            const rep = g[s] ?? [];
            return Array.from({ length: rowCount }, (_, r) => rep[r] ?? null);
          }),
        };
      }),
    };
    const p = applyEdit(createProject('P'), { op: 'addTable', table });
    const analysis = (
      comparisons: NestedComparisons = { kind: 'none' },
      n?: number,
    ): NestedOneWay => ({
      id: asId('a_1'),
      title: 'nested anova',
      kind: 'nested-one-way-anova',
      options: { comparisons },
      input: {
        kind: 'table',
        table: table.id,
        dataSets: (n === undefined ? table.dataSets : table.dataSets.slice(0, n)).map((d) => d.id),
      },
    });
    return { p, analysis };
  }

  it('needs at least two groups', () => {
    const s = setup([
      [
        [1, 2],
        [3, 4],
      ],
    ]);
    expect(nestedOneway.prepare(s.analysis(), s.p)).toMatchObject({
      reason: 'Nested one-way ANOVA compares at least two groups; choose more.',
    });
  });

  it('refuses fewer than two usable replicates, saying which group', () => {
    const s = setup([
      [
        [1, 2],
        [3, 4],
      ],
      [[5, 6], []],
      [
        [7, 8],
        [9, 10],
      ],
    ]);
    expect(nestedOneway.prepare(s.analysis(), s.p)).toMatchObject({
      reason: expect.stringMatching(/G1 has 1 replicate/) as string,
    });
  });

  it('refuses an unpicked control group', () => {
    const s = setup([
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ],
      [
        [9, 10],
        [11, 12],
      ],
    ]);
    expect(
      nestedOneway.prepare(
        s.analysis({ kind: 'control', control: asId('nope'), test: 'dunnett' }),
        s.p,
      ),
    ).toMatchObject({
      reason: 'The control group isn’t among the groups analysed. Choose it again.',
    });
  });
});
