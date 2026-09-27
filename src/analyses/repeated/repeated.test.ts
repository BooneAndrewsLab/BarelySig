/**
 * The app's repeated-measures one-way ANOVA, run in the app's WebR on
 * every fixture the R oracle wrote (CLAUDE.md, Correctness), and its
 * plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { asId } from '@/model/ids';
import type { RepeatedMeasuresOptions } from '@/model/project';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { repeatedMeasures } from '.';
import type { RepeatedMeasuresRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): RepeatedMeasuresRequest {
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
  let droppedRows = 0;
  for (let r = 0; r < n; r += 1) {
    const values = columns.map((c) => c[r] ?? null);
    if (values.every((v): v is number => v !== null)) rows.push(values);
    else droppedRows += 1;
  }
  return {
    groups,
    options: { comparisons },
    rows,
    control: comparisons.kind === 'control' ? controlIndex : null,
    droppedRows,
  };
}

describe('repeated-measures one-way ANOVA, against the R oracle', () => {
  const fixtures = loadFixtures('repeated');

  it('covers Tukey, Dunnett, Šidák, Bonferroni and no comparisons', () => {
    const tests = new Set(fixtures.map((f) => f.options?.['test']));
    for (const t of ['tukey', 'dunnett', 'sidak', 'bonferroni']) expect(tests).toContain(t);
    expect(fixtures.some((f) => f.options?.['comparisons'] === 'none')).toBe(true);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(repeatedMeasures.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = repeatedMeasures.parse(out.value, request, out.warnings);
      const raw = out.value as unknown as { p: number; comparisons: readonly { p: number }[] };
      expect(r.anova.p).toBe(raw.p);
      expect(r.pairs.map((c) => c.p)).toEqual(raw.comparisons.map((c) => c.p));
    },
    60_000,
  );

  it('refuses fewer than two groups', async () => {
    await expect(
      engine.run(
        repeatedMeasures.job({
          groups: [{ id: 'a', title: 'A' }],
          options: { comparisons: { kind: 'none' } },
          rows: [[1], [3]],
          control: null,
          droppedRows: 0,
        }),
      ),
    ).rejects.toThrow(/two or more/);
  });

  it('refuses fewer than two complete rows', async () => {
    await expect(
      engine.run(
        repeatedMeasures.job({
          groups: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
            { id: 'c', title: 'C' },
          ],
          options: { comparisons: { kind: 'none' } },
          rows: [[1, 2, 3]],
          control: null,
          droppedRows: 0,
        }),
      ),
    ).rejects.toThrow(/two complete rows/);
  });
});
