/**
 * The app's matched nested one-way ANOVA (note 21, #71): the R oracle's
 * fixtures run through the app's own WebR (`bs_repeated`, shared with
 * repeated-measures ANOVA), and `prepare()`'s replicate matching against
 * a Nested table (note 14's `matchedPairs`, generalized past two groups).
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId, newId } from '@/model/ids';
import { type Analysis, type RepeatedMeasuresOptions, createProject } from '@/model/project';
import { type NestedTable, emptyDataSet, newRows } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { nestedRepeated } from '.';
import type { NestedRepeatedRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): NestedRepeatedRequest {
  const o = f.options ?? {};
  const test = typeof o['test'] === 'string' ? o['test'] : 'tukey';
  const keys = Object.keys(f.input);
  const groups = keys.map((k) => ({ id: k, title: k.toUpperCase() }));
  const controlIndex = typeof o['control'] === 'number' ? o['control'] - 1 : 0;
  const comparisons: RepeatedMeasuresOptions['comparisons'] =
    o['comparisons'] === 'none'
      ? { kind: 'none' }
      : o['comparisons'] === 'control'
        ? {
            kind: 'control',
            control: asId(keys[controlIndex] ?? ''),
            test: test as 'dunnett' | 'bonferroni' | 'sidak',
          }
        : { kind: 'all', test: test as 'tukey' | 'bonferroni' | 'sidak' };
  const columns = keys.map((k) => f.input[k] ?? []);
  const n = Math.max(0, ...columns.map((c) => c.length));
  const rows: number[][] = [];
  for (let r = 0; r < n; r += 1) {
    const values = columns.map((c) => c[r] ?? null);
    if (values.every((v): v is number => v !== null)) rows.push(values);
  }
  return {
    groups,
    options: { comparisons },
    rows,
    control: comparisons.kind === 'control' ? controlIndex : null,
    droppedReplicates: 0,
    unmatched: [],
  };
}

describe('matched nested one-way ANOVA, against the R oracle', () => {
  const fixtures = loadFixtures('nested-repeated');

  it('covers few and minimum replicates, ties, sphericity violation and a control', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    expect(fixtures.some((f) => f.options?.['comparisons'] === 'control')).toBe(true);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(nestedRepeated.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = nestedRepeated.parse(out.value, request, out.warnings);
      const raw = out.value as unknown as { p: number; comparisons: readonly { p: number }[] };
      expect(r.anova.p).toBe(raw.p);
      expect(r.pairs.map((c) => c.p)).toEqual(raw.comparisons.map((c) => c.p));
    },
    60_000,
  );
});

describe('prepare', () => {
  type NestedRepeated = Extract<Analysis, { kind: 'nested-repeated-anova' }>;

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
    const analysis = (
      options: Partial<RepeatedMeasuresOptions> = {},
      n = groups.length,
    ): NestedRepeated => ({
      id: asId('a_1'),
      title: 'matched nested ANOVA',
      kind: 'nested-repeated-anova',
      options: { comparisons: { kind: 'all', test: 'tukey' }, ...options },
      input: {
        kind: 'table',
        table: table.id,
        dataSets: table.dataSets.slice(0, n).map((d) => d.id),
      },
    });
    return { p, analysis };
  }

  it('needs three or more groups', () => {
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
    expect(nestedRepeated.prepare(s.analysis({}, 2), s.p)).toMatchObject({
      reason: expect.stringMatching(/with two, use the matched nested t test/) as string,
    });
    expect(nestedRepeated.prepare(s.analysis({}, 1), s.p)).toMatchObject({
      reason: expect.stringMatching(/choose more/) as string,
    });
  });

  it('matches replicates by position across every group, dropping one missing everywhere', () => {
    const s = setup([
      [[1, 2], [3, 4], [], [9]],
      [[5, 6], [7, 8], [], [10]],
      [[2, 2], [4, 4], [], [11]],
    ]);
    const r = nestedRepeated.prepare(s.analysis(), s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.rows).toEqual([
      [1.5, 5.5, 2],
      [3.5, 7.5, 4],
      [9, 10, 11],
    ]);
    expect(r.request.droppedReplicates).toBe(1);
    expect(r.request.unmatched).toEqual([]);
  });

  it('leaves out, and names, a replicate with values in some groups but not all', () => {
    const s = setup([
      [[1, 2], [3, 4], [9]],
      [[5, 6], [], [10]],
      [[2, 2], [4, 4], [11]],
    ]);
    const r = nestedRepeated.prepare(s.analysis(), s.p);
    if (!r.ok) throw new Error(r.reason);
    expect(r.request.rows).toEqual([
      [1.5, 5.5, 2],
      [9, 10, 11],
    ]);
    expect(r.request.unmatched).toEqual(['Replicate 2']);
    expect(r.request.droppedReplicates).toBe(0);
  });

  it('refuses fewer than two matched replicates, naming the unmatched ones', () => {
    const s = setup([
      [
        [1, 2],
        [3, 4],
      ],
      [[5, 6], []],
      [[2, 2], []],
    ]);
    expect(nestedRepeated.prepare(s.analysis(), s.p)).toMatchObject({
      reason: expect.stringMatching(
        /there is 1 \(Replicate 2 has values in some groups only\)/,
      ) as string,
    });
  });

  it('refuses an unknown control group', () => {
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
        [2, 2],
        [4, 4],
      ],
    ]);
    expect(
      nestedRepeated.prepare(
        s.analysis({ comparisons: { kind: 'control', control: asId('nope'), test: 'dunnett' } }),
        s.p,
      ),
    ).toMatchObject({
      reason: 'The control group isn’t among the groups analysed. Choose it again.',
    });
  });
});
