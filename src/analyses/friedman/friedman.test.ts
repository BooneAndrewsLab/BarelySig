/**
 * The app's Friedman test, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { asId } from '@/model/ids';
import type { FriedmanOptions } from '@/model/project';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { friedman } from '.';
import type { FriedmanRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): FriedmanRequest {
  const o = f.options ?? {};
  const keys = Object.keys(f.input);
  const groups = keys.map((k) => ({ id: k, title: k.toUpperCase() }));
  const control = typeof o['control'] === 'number' ? o['control'] - 1 : 0;
  const comparisons: FriedmanOptions['comparisons'] =
    o['comparisons'] === 'none'
      ? { kind: 'none' }
      : o['comparisons'] === 'control'
        ? { kind: 'control', control: asId(keys[control] ?? '') }
        : { kind: 'all' };
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
    options: { comparisons, corrected: o['corrected'] !== false },
    rows,
    control: comparisons.kind === 'control' ? control : null,
    droppedRows,
  };
}

describe('Friedman test, against the R oracle', () => {
  const fixtures = loadFixtures('friedman');

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(friedman.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = friedman.parse(out.value, request, out.warnings);
      const raw = out.value as unknown as { p: number; comparisons: readonly { p: number }[] };
      expect(r.p).toBe(raw.p);
      expect(r.pairs.map((c) => c.p)).toEqual(raw.comparisons.map((c) => c.p));
    },
    60_000,
  );

  it('refuses fewer than three groups', async () => {
    await expect(
      engine.run(
        friedman.job({
          groups: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
          ],
          options: { comparisons: { kind: 'all' }, corrected: true },
          rows: [
            [1, 2],
            [3, 4],
          ],
          control: null,
          droppedRows: 0,
        }),
      ),
    ).rejects.toThrow(/three or more/);
  });

  it('refuses fewer than two complete rows', async () => {
    await expect(
      engine.run(
        friedman.job({
          groups: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
            { id: 'c', title: 'C' },
          ],
          options: { comparisons: { kind: 'all' }, corrected: true },
          rows: [[1, 2, 3]],
          control: null,
          droppedRows: 0,
        }),
      ),
    ).rejects.toThrow(/two complete rows/);
  });
});
