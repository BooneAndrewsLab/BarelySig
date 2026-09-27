/**
 * The app's paired-differences normality tests, run in the app's WebR on
 * every fixture the R oracle wrote (CLAUDE.md, Correctness).
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import { type Analysis, type Project, createProject } from '@/model/project';
import { createColumnTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { pairedNormality } from '.';
import type { PairedNormalityRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

/** Rows missing on either side drop out of the pairing, as `pairedGroups` does. */
function requestFor(f: Fixture): PairedNormalityRequest {
  const a = f.input['a'] ?? [];
  const b = f.input['b'] ?? [];
  let droppedRows = 0;
  const differences: number[] = [];
  a.forEach((va, i) => {
    const vb = b[i] ?? null;
    if (va !== null && vb !== null) differences.push(vb - va);
    else droppedRows += 1;
  });
  return { a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' }, differences, droppedRows };
}

describe('paired-differences normality tests, against the R oracle', () => {
  it.each(loadFixtures('paired-normality').map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const request = requestFor(f);
      const out = await engine.run(pairedNormality.job(request));
      expect(mismatches(out.value, f.expected, f.tolerance)).toEqual([]);
      const r = pairedNormality.parse(out.value, request, out.warnings);
      expect(r.n).toBe(request.differences.length);
      expect(r.droppedRows).toBe(request.droppedRows);
    },
    60_000,
  );

  it('says why a test didn’t run', async () => {
    const request: PairedNormalityRequest = {
      a: { id: 'a', title: 'A' },
      b: { id: 'b', title: 'B' },
      differences: [1, 2],
      droppedRows: 0,
    };
    const out = await engine.run(pairedNormality.job(request));
    const r = pairedNormality.parse(out.value, request, []);
    expect(r.shapiroWilk).toEqual({ ran: false, why: 'few', limit: 3 });
    expect(r.dagostino).toEqual({ ran: false, why: 'few', limit: 8 });
  }, 60_000);

  it('says when every difference is the same', async () => {
    const request: PairedNormalityRequest = {
      a: { id: 'a', title: 'A' },
      b: { id: 'b', title: 'B' },
      differences: [1, 1, 1, 1, 1, 1, 1, 1],
      droppedRows: 0,
    };
    const out = await engine.run(pairedNormality.job(request));
    const r = pairedNormality.parse(out.value, request, []);
    expect(r.shapiroWilk).toEqual({ ran: false, why: 'same', limit: null });
    expect(r.dagostino).toEqual({ ran: false, why: 'same', limit: null });
  }, 60_000);
});

describe('prepare', () => {
  it('needs the values', () => {
    const table = createColumnTable({
      title: 'T',
      groups: ['A', 'B'],
      format: { kind: 'summary', stats: 'mean-sd-n' },
    });
    const p: Project = applyEdit(createProject('P'), { op: 'addTable', table });
    const a: Extract<Analysis, { kind: 'paired-normality' }> = {
      id: asId('a_1'),
      title: 'n',
      kind: 'paired-normality',
      options: {},
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    };
    expect(pairedNormality.prepare(a, p)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/can’t be run on summary data/) as string,
    });
  });

  it('needs exactly two groups', () => {
    const table = createColumnTable({ title: 'T', groups: ['A', 'B', 'C'] });
    const p: Project = applyEdit(createProject('P'), { op: 'addTable', table });
    const a: Extract<Analysis, { kind: 'paired-normality' }> = {
      id: asId('a_1'),
      title: 'n',
      kind: 'paired-normality',
      options: {},
      input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
    };
    expect(pairedNormality.prepare(a, p)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/choose two/i) as string,
    });
  });
});
