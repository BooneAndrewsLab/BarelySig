import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Edit, applyEdit } from './edits';
import { type Id, asId } from './ids';
import { type EngineInfo, inputHashes } from './inputs';
import type { Json } from './json';
import { type Analysis, type Project, createProject } from './project';
import { type Job, Recompute } from './recompute';
import { createColumnTable } from './table';

const ENGINE: EngineInfo = { webr: '0.6.0', r: '4.6.0', packages: { mvtnorm: '1.2-4' } };
const A1 = asId('a_1');
const A2 = asId('a_2');

function setup() {
  const table = createColumnTable({ title: 'T', groups: ['A', 'B'], rows: 2 });
  const [a, b] = table.dataSets;
  const [r0] = table.rows;
  if (!a || !b || !r0) throw new Error('unreachable');
  const first: Analysis = {
    id: A1,
    title: 'Stats',
    kind: 'descriptive',
    options: {},
    input: { kind: 'table', table: table.id, dataSets: [a.id] },
  };
  const second: Analysis = {
    id: A2,
    title: 'Chained',
    kind: 'descriptive',
    options: {},
    input: { kind: 'analysis', analysis: A1 },
  };
  const project = [
    { op: 'addTable', table },
    { op: 'addAnalysis', analysis: first },
    { op: 'addAnalysis', analysis: second },
  ].reduce((p, e) => applyEdit(p, e as Edit), createProject('P'));
  const set = (p: Project, value: number | null, ds: Id = a.id): Project =>
    applyEdit(p, {
      op: 'setCells',
      table: table.id,
      cells: [{ dataSet: ds, subcolumn: 0, row: r0.id, value }],
    });
  return { project, table, a: a.id, b: b.id, set };
}

function analysisOf(p: Project): Analysis {
  const a = p.analyses.get(A1);
  if (!a) throw new Error('unreachable');
  return a;
}

describe('input hashes', () => {
  const hashes = (p: Project, engine = ENGINE) => inputHashes(p, engine);

  it('change with the data an analysis reads, and come back on undo', () => {
    const { project, set } = setup();
    const edited = set(project, 1);
    expect(hashes(edited).get(A1)).not.toBe(hashes(project).get(A1));
    // Chained analyses follow their upstream.
    expect(hashes(edited).get(A2)).not.toBe(hashes(project).get(A2));
    expect(hashes(set(edited, null)).get(A1)).toBe(hashes(project).get(A1));
  });

  it('ignore data sets the analysis does not read, names that are not in results, and colours', () => {
    const { project, table, a, b, set } = setup();
    const h = hashes(project).get(A1);
    expect(hashes(set(project, 5, b)).get(A1)).toBe(h);
    const cosmetic = [
      { op: 'setTableInfo', table: table.id, title: 'Renamed', unit: 'mM' },
      { op: 'setDataSet', table: table.id, dataSet: a, color: '#123456', decimals: 3 },
      {
        op: 'setAnalysis',
        analysis: { ...analysisOf(project), title: 'New name' },
      },
      { op: 'renameProject', name: 'Other' },
    ].reduce((p, e) => applyEdit(p, e as Edit), project);
    expect(hashes(cosmetic).get(A1)).toBe(h);
  });

  it('change when a group is renamed, since results are labelled by it', () => {
    const { project, table, a } = setup();
    const renamed = applyEdit(project, {
      op: 'setDataSet',
      table: table.id,
      dataSet: a,
      title: 'Control',
    });
    expect(hashes(renamed).get(A1)).not.toBe(hashes(project).get(A1));
  });

  it('change with the engine, and with options', () => {
    const { project } = setup();
    expect(hashes(project, { ...ENGINE, packages: { mvtnorm: '1.3-0' } }).get(A1)).not.toBe(
      hashes(project).get(A1),
    );
    const ttest = applyEdit(project, {
      op: 'setAnalysis',
      analysis: {
        ...analysisOf(project),
        kind: 't-test',
        options: { paired: false, welch: false, tails: 'two' },
      },
    });
    expect(hashes(ttest).get(A1)).not.toBe(hashes(project).get(A1));
  });
});

/** A runner whose runs finish when the test says so. */
function controlledRunner() {
  const calls: {
    job: Job;
    signal: AbortSignal;
    resolve: (v: Json) => void;
    reject: (e: Error) => void;
  }[] = [];
  const runner = (job: Job, signal: AbortSignal) =>
    new Promise<Json>((resolve, reject) => {
      calls.push({ job, signal, resolve, reject });
      signal.addEventListener('abort', () => {
        reject(new Error('aborted'));
      });
    });
  return { calls, runner };
}

/** Lets pending promise callbacks run. */
const tick = () => vi.advanceTimersByTimeAsync(0);

describe('Recompute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for edits to pause, then runs in dependency order', async () => {
    const { project, set } = setup();
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({ runner, engine: ENGINE });
    rc.setProject(project);
    await vi.advanceTimersByTimeAsync(200);
    rc.setProject(set(project, 1));
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toHaveLength(0);
    expect(rc.status(A1).state).toBe('stale');
    await vi.advanceTimersByTimeAsync(100);
    expect(calls.map((c) => c.job.analysis.id)).toEqual([A1]);
    expect(rc.status(A1).state).toBe('running');
    expect(rc.status(A2).state).toBe('stale');

    calls[0]?.resolve({ mean: 1 });
    await tick();
    expect(rc.status(A1).state).toBe('fresh');
    expect(calls[1]?.job.analysis.id).toBe(A2);
    expect(calls[1]?.job.upstream).toEqual({ mean: 1 });
    calls[1]?.resolve({ chained: true });
    await rc.idle();
    expect(rc.result(A2)).toMatchObject({ ok: true, value: { chained: true } });
    expect([...rc.currentResults().keys()]).toEqual([A1, A2]);
  });

  it('never lets a slow, outdated run overwrite a fresh result, and finds it again on undo', async () => {
    const { project, set } = setup();
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({ runner, engine: ENGINE });
    const p1 = set(project, 1);
    rc.setProject(p1);
    await vi.advanceTimersByTimeAsync(300);
    const p2 = set(p1, 2);
    rc.setProject(p2);
    // The old run finishes after the edit.
    calls[0]?.resolve({ mean: 1 });
    await tick();
    expect(rc.status(A1).state).toBe('stale');
    expect(rc.result(A1)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(300);
    expect(calls[1]?.job.project).toBe(p2);
    calls[1]?.resolve({ mean: 2 });
    await tick();
    expect(rc.result(A1)).toMatchObject({ value: { mean: 2 } });

    // Undo: the earlier result is still valid, without running again.
    rc.setProject(p1);
    expect(rc.status(A1).state).toBe('fresh');
    expect(rc.result(A1)).toMatchObject({ value: { mean: 1 } });
    rc.dispose();
  });

  it('cancels a superseded run only once it has run for a while', async () => {
    const { project, set } = setup();
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({ runner, engine: ENGINE, cancelAfterMs: 3000 });
    rc.setProject(set(project, 1));
    await vi.advanceTimersByTimeAsync(300);
    const run = calls[0];
    await vi.advanceTimersByTimeAsync(1000);
    rc.setProject(set(project, 2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(run?.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run?.signal.aborted).toBe(true);
    await tick();
    // The aborted run left no result, error or otherwise; the current input runs.
    expect(calls).toHaveLength(2);
    expect(rc.status(A1).state).toBe('running');
    rc.dispose();
  });

  it('does not cancel a run that is still current', async () => {
    const { project, table, set } = setup();
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({ runner, engine: ENGINE, cancelAfterMs: 10 });
    const p = set(project, 1);
    rc.setProject(p);
    await vi.advanceTimersByTimeAsync(300);
    rc.setProject(applyEdit(p, { op: 'setTableInfo', table: table.id, notes: 'cosmetic' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls[0]?.signal.aborted).toBe(false);
    rc.dispose();
  });

  it('reports errors in plain language, blocks what reads from them, and retries on request', async () => {
    const { project } = setup();
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({ runner, engine: ENGINE });
    rc.setProject(project);
    await vi.advanceTimersByTimeAsync(300);
    calls[0]?.reject(new Error('Each group needs at least two values.'));
    await rc.idle();
    expect(rc.status(A1)).toEqual({
      state: 'error',
      message: 'Each group needs at least two values.',
    });
    expect(rc.status(A2).state).toBe('blocked');
    expect(calls).toHaveLength(1);

    rc.retry(A1);
    await tick();
    expect(calls).toHaveLength(2);
    rc.dispose();
  });

  it('stops a run on request and does not rerun it until asked', async () => {
    const { project, set } = setup();
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({ runner, engine: ENGINE });
    rc.setProject(set(project, 1));
    await vi.advanceTimersByTimeAsync(300);
    const run = calls[0];
    rc.stop(A1, 'Stopped.');
    expect(run?.signal.aborted).toBe(true);
    await tick();
    expect(rc.status(A1)).toEqual({ state: 'error', message: 'Stopped.' });
    expect(calls).toHaveLength(1);
    rc.retry(A1);
    await tick();
    expect(calls).toHaveLength(2);
    rc.dispose();
  });

  it('does not run an analysis its check refuses', async () => {
    const { project } = setup();
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({
      runner,
      engine: ENGINE,
      check: (a) => (a.id === A1 ? 'A t test needs two groups.' : null),
    });
    rc.setProject(project);
    await vi.advanceTimersByTimeAsync(300);
    await rc.idle();
    expect(calls).toHaveLength(0);
    expect(rc.status(A1)).toEqual({ state: 'blocked', message: 'A t test needs two groups.' });
    expect(rc.status(A2).state).toBe('blocked');
  });

  it('reports a graph as the worst of the analyses it draws', async () => {
    const { project, table } = setup();
    const p = applyEdit(project, {
      op: 'addGraph',
      graph: {
        id: asId('g_1'),
        title: 'G',
        source: { kind: 'table', table: table.id },
        analyses: [A1],
      },
    });
    const { calls, runner } = controlledRunner();
    const rc = new Recompute({ runner, engine: ENGINE });
    rc.setProject(p);
    expect(rc.graphStatus(asId('g_1')).state).toBe('stale');
    await vi.advanceTimersByTimeAsync(300);
    calls[0]?.resolve({});
    await tick();
    expect(rc.graphStatus(asId('g_1')).state).toBe('fresh');
    rc.dispose();
  });
});
