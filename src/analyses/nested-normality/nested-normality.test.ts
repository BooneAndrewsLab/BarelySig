/**
 * The app's normality check of a Nested table's replicate means, run in
 * the app's WebR on every fixture the R oracle wrote (CLAUDE.md,
 * Correctness), and its plain-language refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { newId } from '@/model/ids';
import { type Analysis, createProject } from '@/model/project';
import { type NestedTable, emptyDataSet, newRows } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { nestedNormality } from '.';
import type { NestedNormalityRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): NestedNormalityRequest {
  const keys = Object.keys(f.input);
  return {
    groups: keys.map((k) => ({
      id: k,
      title: k,
      replicateMeans: (f.input[k] ?? []).filter((v): v is number => v !== null),
      droppedReplicates: 0,
    })),
  };
}

describe('normality of a Nested table’s replicate means, against the R oracle', () => {
  const fixtures = loadFixtures('nested-normality');

  it('covers the typical few-replicate case, the Shapiro-Wilk minimum, unequal counts, and a real signal', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(nestedNormality.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = nestedNormality.parse(out.value, request, out.warnings);
      expect(r.groups.map((g) => g.id)).toEqual(Object.keys(f.input));
    },
    60_000,
  );

  it('says why a test didn’t run', async () => {
    const request: NestedNormalityRequest = {
      groups: [
        { id: 'a', title: 'A', replicateMeans: [1, 2], droppedReplicates: 0 },
        { id: 'b', title: 'B', replicateMeans: [3, 3, 3, 3, 3, 3, 3, 3], droppedReplicates: 0 },
      ],
    };
    const out = await engine.run(nestedNormality.job(request));
    const [a, b] = nestedNormality.parse(out.value, request, []).groups;
    expect([a?.shapiroWilk, a?.dagostino]).toEqual([
      { ran: false, why: 'few', limit: 3 },
      { ran: false, why: 'few', limit: 8 },
    ]);
    expect(b?.shapiroWilk).toEqual({ ran: false, why: 'same', limit: null });
  }, 60_000);
});

describe('prepare', () => {
  type NestedNormality = Extract<Analysis, { kind: 'nested-normality' }>;

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
    const analysis = (n?: number): NestedNormality => ({
      id: newId('a'),
      title: 'normality',
      kind: 'nested-normality',
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
    const missing: NestedNormality = {
      ...s.analysis(),
      input: { kind: 'table', table: newId('t'), dataSets: [] },
    };
    expect(nestedNormality.prepare(missing, s.p)).toMatchObject({
      reason: 'The table this analysis reads no longer exists.',
    });
  });

  it('refuses no groups chosen', () => {
    const s = setup([[[1, 2]]]);
    const base = s.analysis();
    const noGroups: NestedNormality = {
      ...base,
      input: {
        kind: 'table',
        table: base.input.kind === 'table' ? base.input.table : newId('t'),
        dataSets: [],
      },
    };
    expect(nestedNormality.prepare(noGroups, s.p)).toMatchObject({
      reason: 'Choose a group to test.',
    });
  });

  it('refuses when there are no replicate means to test yet', () => {
    const s = setup([[[]]]);
    expect(nestedNormality.prepare(s.analysis(), s.p)).toMatchObject({
      reason: 'There are no replicate means to test yet.',
    });
  });

  it('drops a fully empty replicate and counts it', () => {
    const s = setup([[[1, 2], []]]);
    const prepared = nestedNormality.prepare(s.analysis(), s.p);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.request.groups[0]?.replicateMeans.length).toBe(1);
      expect(prepared.request.groups[0]?.droppedReplicates).toBe(1);
    }
  });
});
