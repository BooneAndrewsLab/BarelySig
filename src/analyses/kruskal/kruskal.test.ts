/**
 * The app's Kruskal-Wallis test, run in the app's WebR on every fixture the
 * R oracle wrote (CLAUDE.md, Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import {
  type Analysis,
  type KruskalWallisOptions,
  type Project,
  createProject,
} from '@/model/project';
import { type EntryFormat, createColumnTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { kruskal } from '.';
import type { KruskalWallisRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const present = (xs: readonly (number | null)[]) => xs.filter((v): v is number => v !== null);

function requestFor(f: Fixture): KruskalWallisRequest {
  const o = f.options ?? {};
  const keys = Object.keys(f.input);
  const groups = keys.map((k) => ({ id: k, title: k.toUpperCase() }));
  const control = typeof o['control'] === 'number' ? o['control'] - 1 : 0;
  const comparisons: KruskalWallisOptions['comparisons'] =
    o['comparisons'] === 'none'
      ? { kind: 'none' }
      : o['comparisons'] === 'control'
        ? { kind: 'control', control: asId(keys[control] ?? '') }
        : { kind: 'all' };
  return {
    groups,
    options: { comparisons, corrected: o['corrected'] !== false },
    values: keys.map((k) => present(f.input[k] ?? [])),
    control: comparisons.kind === 'control' ? control : null,
    dropped: keys.map(() => null),
  };
}

describe('Kruskal-Wallis, against the R oracle', () => {
  const fixtures = loadFixtures('kruskal');

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(kruskal.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = kruskal.parse(out.value, request, out.warnings);
      const raw = out.value as unknown as { p: number; comparisons: readonly { p: number }[] };
      expect(r.p).toBe(raw.p);
      expect(r.pairs.map((c) => c.p)).toEqual(raw.comparisons.map((c) => c.p));
    },
    60_000,
  );

  it('refuses when every value is the same', async () => {
    await expect(
      engine.run(
        kruskal.job({
          groups: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
          ],
          options: { comparisons: { kind: 'all' }, corrected: true },
          values: [
            [3, 3],
            [3, 3, 3],
          ],
          control: null,
          dropped: [null, null],
        }),
      ),
    ).rejects.toThrow(/^Every value is the same, so there are no ranks to compare/);
  }, 60_000);
});

describe('prepare', () => {
  type KW = Extract<Analysis, { kind: 'kruskal-wallis' }>;

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
    const analysis = (options: Partial<KruskalWallisOptions> = {}): KW => ({
      id: asId('a_1'),
      title: 'kw',
      kind: 'kruskal-wallis',
      options: { comparisons: { kind: 'all' }, corrected: true, ...options },
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    });
    return { p, analysis, ids: table.dataSets.map((d) => d.id) };
  }

  it('needs values, not summary data, and a value in every group', () => {
    const sum = setup(
      [
        [10, 2, 5],
        [12, 3, 5],
      ],
      { kind: 'summary', stats: 'mean-sd-n' },
    );
    expect(kruskal.prepare(sum.analysis(), sum.p)).toMatchObject({
      reason: expect.stringMatching(/can’t be computed from summary data/) as string,
    });
    const empty = setup([[1, 2], [null], [3]]);
    expect(kruskal.prepare(empty.analysis(), empty.p)).toMatchObject({
      reason:
        'Every group needs at least one value; G1 has none. Leave it out, or enter its values.',
    });
  });

  it('finds the control among the groups', () => {
    const s = setup([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    const [, , third] = s.ids;
    if (!third) throw new Error('unreachable');
    const r = kruskal.prepare(
      s.analysis({ comparisons: { kind: 'control', control: third } }),
      s.p,
    );
    expect(r.ok && r.request.control).toBe(2);
  });
});
