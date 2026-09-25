// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeBsig } from '@/io/bsig';
import { BarelySigDb, ProjectStorage } from '@/io/storage';
import { applyEdit } from '@/model/edits';
import { newId } from '@/model/ids';
import { createProject } from '@/model/project';
import { createColumnTable } from '@/model/table';

import { AUTOSAVE_DELAY } from './autosave';
import { Session } from './session';
import { AppStore, project } from './store';

const withTable = (name: string) =>
  applyEdit(createProject(name), {
    op: 'addTable',
    table: createColumnTable({ title: 'T', groups: ['A'], rows: 1 }),
  });

function setup() {
  const store = new AppStore(createProject('Untitled project'));
  const storage = new ProjectStorage(new BarelySigDb(`test-${newId('x')}`));
  return { store, storage, session: new Session(store, storage, () => null) };
}

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves a second after the last change', async () => {
    const { store, storage } = setup();
    store.edit({ op: 'addTable', table: createColumnTable({ title: 'T', groups: [] }) });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY / 2);
    store.edit({ op: 'renameProject', name: 'Screen' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY / 2);
    expect(await storage.list()).toEqual([]);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    await vi.waitFor(async () => {
      expect((await storage.list()).map((r) => r.name)).toEqual(['Screen']);
    });
  });

  it('does not save an empty, untouched project', async () => {
    const { store, storage, session } = setup();
    store.load(createProject('Untitled project'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    await session.autosaver.flush();
    expect(await storage.list()).toEqual([]);
  });

  it('writes the pending change before switching project', async () => {
    const { store, storage, session } = setup();
    store.edit({ op: 'renameProject', name: 'Unsaved yet' });
    await session.newProject();
    expect((await storage.list()).map((r) => r.name)).toEqual(['Unsaved yet']);
    expect(project(store.getState()).name).toBe('Untitled project');
  });
});

describe('Session', () => {
  it('restores the latest project', async () => {
    const { store, storage, session } = setup();
    const p = withTable('Kept');
    await storage.save(p, '0.3.0');
    await session.restore();
    expect(project(store.getState())).toStrictEqual(p);
  });

  it('opens a .bsig file as a new project, remembered as downloaded', async () => {
    const { store, session } = setup();
    const p = withTable('From disk');
    const file = new File(
      [writeBsig({ project: p, results: new Map(), engine: null, app: '0.3.0' })],
      'disk.bsig',
    );
    await session.openFile(file);
    const opened = project(store.getState());
    expect(opened.name).toBe('From disk');
    expect(opened.id).not.toBe(p.id);
    expect(opened.tables).toStrictEqual(p.tables);
    expect(store.getState().downloaded).toBe(opened);
    expect(store.getState().notice?.text).toBe('Opened “disk.bsig”.');
  });

  it('says why a file cannot be opened, and keeps the current project', async () => {
    const { store, session } = setup();
    const before = project(store.getState());
    await session.openFile(new File(['not json'], 'broken.bsig'));
    expect(store.getState().notice).toMatchObject({
      tone: 'error',
      text: expect.stringContaining('broken.bsig') as string,
    });
    expect(project(store.getState())).toBe(before);
    await session.openFile(new File(['{"format":"barelysig","schemaVersion":99}'], 'new.bsig'));
    expect(store.getState().notice?.text).toContain('newer version of BarelySig');
  });

  it('downloads the project and marks it downloaded', async () => {
    const { store, session } = setup();
    store.edit({ op: 'renameProject', name: 'Figure 2' });
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () =>
          Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
      } as unknown as FileSystemFileHandle),
    );
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker;
    await session.download();
    delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Figure 2.bsig' }),
    );
    expect(store.getState().downloaded).toBe(project(store.getState()));
    expect(store.getState().notice?.text).toBe('Downloaded “Figure 2.bsig”.');
  });
});

describe('results with the project', () => {
  it('shows saved results at once on opening, without running again, and saves them back', async () => {
    const { ResultsBridge } = await import('./results');
    const { readBsig } = await import('@/io/bsig');
    const { asId } = await import('@/model/ids');
    const p0 = withTable('With results');
    const t = [...p0.tables.values()][0];
    if (!t) throw new Error('unreachable');
    const p = applyEdit(p0, {
      op: 'addAnalysis',
      analysis: {
        id: asId('a_1'),
        title: 'Stats',
        kind: 'descriptive',
        options: {},
        input: { kind: 'table', table: t.id, dataSets: t.dataSets.map((d) => d.id) },
      },
    });
    // Compute the hash the app would, and save a result under it.
    const store = new AppStore(createProject('Untitled project'));
    const runs: unknown[] = [];
    const bridge = new ResultsBridge(store, {
      debounceMs: 0,
      runner: (job) => {
        runs.push(job);
        return new Promise(() => undefined);
      },
    });
    store.load(p);
    const hash = bridge.recompute.inputHash(asId('a_1'));
    if (!hash) throw new Error('no hash');
    const text = writeBsig({
      project: p,
      results: new Map([
        [asId('a_1'), { inputHash: hash, ok: true, value: { groups: [], warnings: [] } }],
      ]),
      engine: bridge.info,
      app: '0.3.0',
    });
    store.load(createProject('Other'));
    const storage = new ProjectStorage(new BarelySigDb(`test-${newId('x')}`));
    const session = new Session(store, storage, () => bridge);
    await session.openFile(new File([text], 'r.bsig'));
    expect(bridge.recompute.status(asId('a_1')).state).toBe('fresh');
    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toHaveLength(0);
    // Downloading writes the result back out.
    let saved = '';
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = () =>
      Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: (s: string) => {
              saved = s;
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
          }),
      });
    await session.download();
    delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    expect(readBsig(saved).results.get(asId('a_1'))).toMatchObject({ inputHash: hash, ok: true });
    bridge.dispose();
  });
});

describe('opening an exported figure', () => {
  it('opens its recipe as a project on its graph, results current, nothing rerun', async () => {
    const { ResultsBridge } = await import('./results');
    const { recipeText, svgMeta } = await import('@/io/recipe');
    const { exportSvg } = await import('@/graphs/export');
    const { layoutColumn } = await import('@/graphs/layout');
    const { graphInput, summaryId } = await import('@/graphs/data');
    const { asId } = await import('@/model/ids');
    const { GRAPH_DEFAULTS } = await import('@/model/project');
    const p0 = withTable('Paper');
    const t = [...p0.tables.values()][0];
    if (!t) throw new Error('unreachable');
    const graph = {
      id: asId('g_1'),
      title: 'Figure 2',
      source: { kind: 'table' as const, table: t.id },
      analyses: [],
      ...GRAPH_DEFAULTS,
    };
    const p = applyEdit(p0, { op: 'addGraph', graph });
    const store = new AppStore(p);
    const runs: unknown[] = [];
    const bridge = new ResultsBridge(store, {
      debounceMs: 0,
      runner: (job) => {
        runs.push(job);
        return new Promise(() => undefined);
      },
    });
    const hash = bridge.recompute.inputHash(summaryId(graph.id));
    if (!hash) throw new Error('no hash');
    const results = new Map([
      [
        summaryId(graph.id),
        { inputHash: hash, ok: true as const, value: { groups: [], warnings: [] } },
      ],
    ]);
    const recipe = recipeText(p, graph, results, bridge.info, '0.5.0');
    const input = graphInput(p, graph, (id) => results.get(id));
    if (!input.ok) throw new Error(input.reason);
    const svg = exportSvg(
      layoutColumn(input.input),
      await svgMeta(
        { app: '0.5.0', engine: bridge.info, title: 'Figure 2', withData: true },
        recipe,
      ),
    );
    store.load(createProject('Something else'));
    const session = new Session(
      store,
      new ProjectStorage(new BarelySigDb(`test-${newId('x')}`)),
      () => bridge,
    );
    await session.openFile(new File([svg], 'Figure 2.svg', { type: 'image/svg+xml' }));
    expect(store.getState().sheet).toEqual({ kind: 'graph', id: graph.id });
    expect(project(store.getState()).name).toBe('Figure 2');
    expect(store.getState().notice?.text).toBe(
      'Opened the figure “Figure 2.svg” with the data and settings that made it.',
    );
    expect(bridge.recompute.status(summaryId(graph.id)).state).toBe('fresh');
    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toHaveLength(0);
    bridge.dispose();
  });
});
