/**
 * The app's normality tests, run in the app's WebR on every fixture the R
 * oracle wrote (CLAUDE.md, Correctness).
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import { type Analysis, type Project, createProject } from '@/model/project';
import { createColumnTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { normality } from '.';
import type { NormalityRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture): NormalityRequest {
  const keys = Object.keys(f.input);
  return {
    groups: keys.map((k) => ({ id: k, title: k })),
    values: keys.map((k) => (f.input[k] ?? []).filter((v): v is number => v !== null)),
    dropped: keys.map(() => null),
  };
}

describe('normality tests, against the R oracle', () => {
  it.each(loadFixtures('normality').map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(normality.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = normality.parse(out.value, request, out.warnings);
      expect(r.groups.map((g) => g.id)).toEqual(Object.keys(f.input));
    },
    60_000,
  );

  it('says why a test didn’t run', async () => {
    const request: NormalityRequest = {
      groups: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      values: [
        [1, 2],
        [3, 3, 3, 3, 3, 3, 3, 3],
      ],
      dropped: [null, null],
    };
    const out = await engine.run(normality.job(request));
    const [a, b] = normality.parse(out.value, request, []).groups;
    expect([a?.shapiroWilk, a?.dagostino]).toEqual([
      { ran: false, why: 'few', limit: 3 },
      { ran: false, why: 'few', limit: 8 },
    ]);
    expect(b?.shapiroWilk).toEqual({ ran: false, why: 'same', limit: null });
  }, 60_000);
});

describe('prepare', () => {
  it('needs the values', () => {
    const table = createColumnTable({
      title: 'T',
      groups: ['A'],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const p: Project = applyEdit(createProject('P'), { op: 'addTable', table });
    const a: Extract<Analysis, { kind: 'normality' }> = {
      id: asId('a_1'),
      title: 'n',
      kind: 'normality',
      options: {},
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    };
    expect(normality.prepare(a, p)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/can’t be run on summary data/) as string,
    });
  });
});
