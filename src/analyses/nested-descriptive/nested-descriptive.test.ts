/**
 * The app's descriptive statistics of a Nested table, run in the app's
 * WebR on every fixture the R oracle wrote (CLAUDE.md, Correctness), and
 * its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { newId } from '@/model/ids';
import { type Analysis, createProject } from '@/model/project';
import { type NestedTable, emptyDataSet, newRows } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { nestedDescriptive } from '.';
import type { NestedDescriptiveRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

const col = (f: Fixture, k: string) => (f.input[k] ?? []) as readonly number[];

function requestFor(f: Fixture): NestedDescriptiveRequest {
  const k = col(f, 'k')[0] ?? 0;
  const value = col(f, 'value');
  const groupIdx = col(f, 'group_idx');
  const replicateIdx = col(f, 'replicate_idx');
  const meanValue = col(f, 'mean_value');
  const meanGroupIdx = col(f, 'mean_group_idx');
  const groups = Array.from({ length: k }, (_, gi) => {
    const byReplicate = new Map<number, number[]>();
    value.forEach((v, i) => {
      if ((groupIdx[i] ?? 0) !== gi + 1) return;
      const r = replicateIdx[i] ?? 0;
      (byReplicate.get(r) ?? byReplicate.set(r, []).get(r))?.push(v);
    });
    const replicates = [...byReplicate.values()];
    const replicateTitles = [...byReplicate.keys()].map((r) => `Replicate ${String(r)}`);
    const replicateMeans = meanValue.filter((_, i) => (meanGroupIdx[i] ?? 0) === gi + 1);
    return {
      id: `g${String(gi + 1)}`,
      title: `G${String(gi + 1)}`,
      replicates,
      replicateTitles,
      replicateMeans,
      droppedReplicates: 0,
    };
  });
  return { groups };
}

describe('descriptive statistics of a Nested table, against the R oracle', () => {
  const fixtures = loadFixtures('nested-descriptive');

  it('covers one and several groups, ragged and edge-case replicates', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(nestedDescriptive.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = nestedDescriptive.parse(out.value, request, out.warnings);
      expect(r.groups.length).toBe(request.groups.length);
      r.groups.forEach((g, i) => {
        const req = request.groups[i];
        expect(req).toBeDefined();
        expect(g.replicates.length).toBe(req?.replicates.length);
        // The group-level mean is the mean of the replicate means, never
        // the pooled individual values, whenever they'd differ.
        if (req && req.replicateMeans.length > 0) {
          const meanOfMeans =
            req.replicateMeans.reduce((a, b) => a + b, 0) / req.replicateMeans.length;
          expect(g.group.mean).not.toBeNull();
          expect(Math.abs((g.group.mean ?? 0) - meanOfMeans)).toBeLessThan(1e-6);
        }
      });
    },
    60_000,
  );
});

describe('a single value describes cleanly (nothing here is a hard minimum)', () => {
  it('a single replicate with a single value: n is 1, SD is undefined', async () => {
    const request: NestedDescriptiveRequest = {
      groups: [
        {
          id: 'g1',
          title: 'G1',
          replicates: [[1]],
          replicateTitles: ['Replicate 1'],
          replicateMeans: [1],
          droppedReplicates: 0,
        },
      ],
    };
    const out = await engine.run(nestedDescriptive.job(request));
    const r = nestedDescriptive.parse(out.value, request, []);
    expect(r.groups[0]?.group.mean).toBe(1);
    expect(r.groups[0]?.group.sd).toBeNull();
  });
});

describe('prepare', () => {
  type NestedDescriptive = Extract<Analysis, { kind: 'nested-descriptive' }>;

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
    const analysis = (n?: number): NestedDescriptive => ({
      id: newId('a'),
      title: 'descriptive',
      kind: 'nested-descriptive',
      options: {},
      input: {
        kind: 'table',
        table: table.id,
        dataSets: (n === undefined ? table.dataSets : table.dataSets.slice(0, n)).map((d) => d.id),
      },
    });
    return { p, analysis };
  }

  it('refuses a table that no longer exists', () => {
    const s = setup([[[1, 2]]]);
    const missing: NestedDescriptive = {
      ...s.analysis(),
      input: { kind: 'table', table: newId('t'), dataSets: [] },
    };
    expect(nestedDescriptive.prepare(missing, s.p)).toMatchObject({
      reason: 'The table this analysis describes no longer exists.',
    });
  });

  it('refuses no groups chosen', () => {
    const s = setup([[[1, 2]]]);
    const base = s.analysis();
    const noGroups: NestedDescriptive = {
      ...base,
      input: {
        kind: 'table',
        table: base.input.kind === 'table' ? base.input.table : newId('t'),
        dataSets: [],
      },
    };
    expect(nestedDescriptive.prepare(noGroups, s.p)).toMatchObject({
      reason: 'Choose at least one group to describe.',
    });
  });

  it('refuses when there is nothing to describe yet', () => {
    const s = setup([[[]]]);
    expect(nestedDescriptive.prepare(s.analysis(), s.p)).toMatchObject({
      reason: 'There are no values to describe yet.',
    });
  });

  it('counts a fully empty replicate as dropped, not as zero', () => {
    const s = setup([[[1, 2], []]]);
    const prepared = nestedDescriptive.prepare(s.analysis(), s.p);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.request.groups[0]?.replicates.length).toBe(1);
      expect(prepared.request.groups[0]?.droppedReplicates).toBe(1);
    }
  });
});
