/**
 * Pearson/Spearman correlation, run in the app's WebR on every fixture
 * the R oracle wrote (CLAUDE.md, Correctness), and its plain-language
 * refusals.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { Engine } from '@/engine/engine';
import { newId } from '@/model/ids';
import { type Analysis, createProject } from '@/model/project';
import { createXyTable, type XyTable } from '@/model/table';
import { type Fixture, loadFixtures, mismatches } from '@/test/fixtures';
import { startNodeWebR } from '@/test/webrNode';

import { correlation } from '.';
import type { CorrelationMethod, CorrelationRequest } from './types';

const engine = new Engine(startNodeWebR);
afterAll(() => {
  engine.close();
});

function requestFor(f: Fixture, method: CorrelationMethod): CorrelationRequest {
  const x = f.input['x'] ?? [];
  const y = f.input['y'] ?? [];
  const points = x.map((v, i) => {
    const yv = y[i];
    if (v === null || yv === null || yv === undefined) throw new Error('fixture cell is empty');
    return { x: v, y: yv };
  });
  return { method, series: [{ id: 's1', title: 'Series 1' }], points: [points] };
}

describe('correlation, against the R oracle', () => {
  const fixtures = loadFixtures('correlation');

  it('covers Pearson, Spearman with and without ties, n = 2, zero variance and a tiny P', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const method: CorrelationMethod = f.id.includes('spearman') ? 'spearman' : 'pearson';
      const request = requestFor(f, method);
      const out = await engine.run(correlation.job(request));
      // The job runs the batching wrapper (one series here); the fixture's
      // `expected` is that one series' own flat shape.
      expect(mismatches(out.value, { series: [f.expected] }, f.tolerance)).toEqual([]);
      const r = correlation.parse(out.value, request, out.warnings);
      expect(r.series).toHaveLength(1);
    },
    60_000,
  );

  it('surfaces R’s tie-driven fallback to the asymptotic Spearman P', async () => {
    const f = fixtures.find((x) => x.id.endsWith('spearman-ties'));
    if (!f) throw new Error('fixture missing');
    const request = requestFor(f, 'spearman');
    const out = await engine.run(correlation.job(request));
    const r = correlation.parse(out.value, request, out.warnings);
    const outcome = r.series[0]?.outcome;
    expect(outcome?.ran).toBe(true);
    if (outcome?.ran) {
      expect(outcome.ties).toBe(true);
      expect(outcome.exact).toBe(false);
    }
  }, 60_000);

  it('reports why at n = 2 and zero variance', async () => {
    for (const id of ['pearson-n2', 'constant-y']) {
      const f = fixtures.find((x) => x.id.endsWith(id));
      if (!f) throw new Error(`fixture ${id} missing`);
      const request = requestFor(f, 'pearson');
      const out = await engine.run(correlation.job(request));
      const r = correlation.parse(out.value, request, out.warnings);
      expect(r.series[0]?.outcome.ran).toBe(false);
    }
  }, 60_000);
});

describe('prepare', () => {
  type Correlation = Extract<Analysis, { kind: 'correlation' }>;

  function setup(): {
    readonly project: ReturnType<typeof createProject>;
    readonly table: XyTable;
  } {
    const table = createXyTable({ title: 'Dose response', groups: ['Y1'], rows: 3 });
    let project = createProject('p');
    project = {
      ...project,
      tables: new Map([[table.id, table]]),
      order: { ...project.order, tables: [table.id] },
    };
    return { project, table };
  }

  function analysisFor(table: XyTable): Correlation {
    return {
      id: newId('a'),
      title: 'Correlation',
      kind: 'correlation',
      options: { method: 'pearson' },
      input: { kind: 'table', table: table.id, dataSets: [table.dataSets[1]?.id ?? newId('ds')] },
    };
  }

  it('refuses no Y data set chosen', () => {
    const { project, table } = setup();
    const a = analysisFor(table);
    const prepared = correlation.prepare(
      { ...a, input: { kind: 'table' as const, table: table.id, dataSets: [] } },
      project,
    );
    expect(prepared.ok).toBe(false);
  });

  it('refuses a Y series with no usable point', () => {
    const { project, table } = setup();
    const prepared = correlation.prepare(analysisFor(table), project);
    expect(prepared.ok).toBe(false);
  });

  it('accepts a Y series with usable points, carrying the chosen method', () => {
    const { project, table } = setup();
    const x = table.dataSets[0];
    const y = table.dataSets[1];
    if (!x || !y) throw new Error('table has no data sets');
    const filled: XyTable = {
      ...table,
      dataSets: [
        { ...x, subcolumns: [[1, 2, 3]] },
        { ...y, subcolumns: [[2, 4, 6]] },
      ],
    };
    const project2 = { ...project, tables: new Map([[filled.id, filled]]) };
    const a = { ...analysisFor(filled), options: { method: 'spearman' as const } };
    const prepared = correlation.prepare(a, project2);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) expect(prepared.request.method).toBe('spearman');
  });
});
