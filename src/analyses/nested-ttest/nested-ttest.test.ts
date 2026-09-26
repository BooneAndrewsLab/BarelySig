/**
 * The app's nested t test, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine, EngineError } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId, newId } from '@/model/ids';
import { type Analysis, type NestedTTestOptions, createProject } from '@/model/project';
import { type NestedTable, emptyDataSet, newRows } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { nestedTTest } from '.';
import type { NestedTTestRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => (f.input[k] ?? []) as readonly number[];

/** Groups a fixture's flat value/replicate columns back into ragged replicates. */
function group(values: readonly number[], replicate: readonly number[]) {
  const byReplicate = new Map<number, number[]>();
  values.forEach((v, i) => {
    const r = replicate[i] ?? 0;
    (byReplicate.get(r) ?? byReplicate.set(r, []).get(r))?.push(v);
  });
  return { replicates: [...byReplicate.values()] };
}

function requestFor(f: Fixture): NestedTTestRequest {
  const a = group(col(f, 'a_value'), col(f, 'a_replicate'));
  const b = group(col(f, 'b_value'), col(f, 'b_replicate'));
  return {
    a: { id: 'a', title: 'A' },
    b: { id: 'b', title: 'B' },
    options: { tails: 'two' },
    data: { a, b },
    droppedReplicates: { a: 0, b: 0 },
  };
}

describe('nested t test, against the R oracle', () => {
  const fixtures = loadFixtures('nested-ttest');

  it('covers balanced, unbalanced, and edge cases', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(nestedTTest.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = nestedTTest.parse(out.value, request, out.warnings);
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
      expect(r.a.nReplicates).toBe(raw['n_rep_a']);
      expect(r.b.nReplicates).toBe(raw['n_rep_b']);
      expect(r.betweenReplicateSd).toBe(raw['between_replicate_sd']);
      expect(r.withinReplicateSd).toBe(raw['within_replicate_sd']);
    },
    60_000,
  );
});

describe('what R refuses, in plain words', () => {
  async function refusal(request: NestedTTestRequest): Promise<string> {
    try {
      await engine.run(nestedTTest.job(request));
    } catch (e: unknown) {
      if (e instanceof EngineError && e.kind === 'analysis') return e.message;
      throw e;
    }
    throw new Error('expected a refusal');
  }

  it('needs at least two replicates per group', async () => {
    expect(
      await refusal({
        a: { id: 'a', title: 'A' },
        b: { id: 'b', title: 'B' },
        options: { tails: 'two' },
        data: { a: { replicates: [[1, 2]] }, b: { replicates: [[3, 4], [5]] } },
        droppedReplicates: { a: 0, b: 0 },
      }),
    ).toMatch(/^Each group needs at least two replicates/);
  }, 60_000);
});

describe('prepare', () => {
  type NestedTTest = Extract<Analysis, { kind: 'nested-t-test' }>;

  function setup(groups: readonly (readonly (readonly (number | null)[])[])[]) {
    const replicates = Math.max(1, ...groups.map((g) => g.length));
    const rowCount = Math.max(1, ...groups.flatMap((g) => g.map((r) => r.length)));
    const rows = newRows(rowCount);
    const format = { kind: 'replicates' as const, count: replicates };
    const table: NestedTable = {
      id: newId('t'),
      type: 'nested',
      title: 'N',
      format,
      rows,
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
    const analysis = (options: Partial<NestedTTestOptions> = {}, n = 2): NestedTTest => ({
      id: asId('a_1'),
      title: 'nested t',
      kind: 'nested-t-test',
      options: { tails: 'two', ...options },
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
    expect(nestedTTest.prepare(s.analysis({}, 3), s.p)).toMatchObject({
      reason: expect.stringMatching(/this one has 3/) as string,
    });
    expect(nestedTTest.prepare(s.analysis({}, 1), s.p)).toMatchObject({
      reason: 'A nested t test compares two groups; choose two.',
    });
  });

  it('drops an empty replicate and counts it, still needing two usable ones', () => {
    const s = setup([
      [[1, 2], [3, 4], []],
      [
        [5, 6],
        [7, 8],
      ],
    ]);
    const r = nestedTTest.prepare(s.analysis(), s.p);
    expect(r.ok && r.request.data.a.replicates).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(r.ok && r.request.droppedReplicates.a).toBe(1);
  });

  it('refuses fewer than two usable replicates, saying which group', () => {
    const s = setup([
      [[1, 2], []],
      [
        [5, 6],
        [7, 8],
      ],
    ]);
    expect(nestedTTest.prepare(s.analysis(), s.p)).toMatchObject({
      reason: expect.stringMatching(/G0 has 1 replicate/) as string,
    });
  });
});
