// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeBsig } from '@/io/bsig';
import type { Json } from '@/model/json';
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

  it('does not keep a blank project because its results changed', async () => {
    const { store, storage, session } = setup();
    store.load(createProject('Untitled project'));
    session.autosaver.resultsChanged();
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
        { inputHash: hash, ok: true as const, value: { cells: [], warnings: [] } },
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

describe('a figure reopened under a newer engine (#46)', () => {
  it('keeps its numbers, recomputes, and says which changed', async () => {
    const { ResultsBridge } = await import('./results');
    const { recipeText } = await import('@/io/recipe');
    const { summaryId } = await import('@/graphs/data');
    const { asId } = await import('@/model/ids');
    const { GRAPH_DEFAULTS } = await import('@/model/project');
    const { engineNotice } = await import('../graphs/engineNotice');
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
    const cell = (mean: number) => ({
      cells: [{ id: 'x', title: 'A', mean, sd: 2 }],
      warnings: [],
    });
    let mean = 10.0000001;
    const store = new AppStore(createProject('Something else'));
    const bridge = new ResultsBridge(store, {
      debounceMs: 0,
      // The table is empty; the stand-in runner doesn't mind.
      check: () => null,
      runner: () => Promise.resolve(cell(mean)),
    });
    const older = { ...bridge.info, webr: '0.5.9', r: '4.5.2' };
    const results = new Map([
      [summaryId(graph.id), { inputHash: 'from-0.5.9', ok: true as const, value: cell(10) }],
    ]);
    const recipe = JSON.parse(recipeText(p, graph, results, older, '0.9.0')) as Json;
    const session = new Session(
      store,
      new ProjectStorage(new BarelySigDb(`test-${newId('x')}`)),
      () => bridge,
    );
    await session.openRecipe(recipe);
    expect(session.baseline?.app).toBe('0.9.0');
    const notice = () =>
      engineNotice(session.baseline, project(store.getState()), graph, bridge.info, (id) =>
        bridge.recompute.result(id),
      );
    expect(notice()?.kind).toBe('waiting');
    await bridge.recompute.idle();
    expect(notice()).toEqual({
      kind: 'same',
      text: `This figure was made with BarelySig 0.9.0 (WebR 0.5.9, R 4.5.2) and recomputed with this version (WebR ${bridge.info.webr}, R ${bridge.info.r}): every number is the same.`,
    });
    // An engine that gives another mean.
    mean = 10.5;
    bridge.recompute.results.forget(summaryId(graph.id));
    bridge.retry(summaryId(graph.id));
    await bridge.recompute.idle();
    expect(notice()).toMatchObject({
      kind: 'changed',
      changes: ['Graph statistics: A: mean was 10, now 10.5'],
    });
    // Once the data change, the old numbers say nothing.
    store.edit({ op: 'setTableInfo', table: t.id, title: 'Renamed' });
    expect(notice()).toBeNull();
    bridge.dispose();
  });

  it('keeps nothing when the engine is the same', async () => {
    const { ResultsBridge } = await import('./results');
    const store = new AppStore(createProject('P'));
    const bridge = new ResultsBridge(store, { debounceMs: 0, runner: () => Promise.resolve(null) });
    const session = new Session(
      store,
      new ProjectStorage(new BarelySigDb(`test-${newId('x')}`)),
      () => bridge,
    );
    const { recipeText } = await import('@/io/recipe');
    const { asId } = await import('@/model/ids');
    const { GRAPH_DEFAULTS } = await import('@/model/project');
    const p0 = withTable('Paper');
    const t = [...p0.tables.values()][0];
    if (!t) throw new Error('unreachable');
    const graph = {
      id: asId('g_1'),
      title: 'F',
      source: { kind: 'table' as const, table: t.id },
      analyses: [],
      ...GRAPH_DEFAULTS,
    };
    const p = applyEdit(p0, { op: 'addGraph', graph });
    await session.openRecipe(
      JSON.parse(recipeText(p, graph, new Map(), bridge.info, '1.0.0')) as Json,
    );
    expect(session.baseline).toBeNull();
    bridge.dispose();
  });
});

describe('closing a project', () => {
  it('saves it first, then starts afresh, and it can be opened again', async () => {
    const { store, storage, session } = setup();
    store.load(withTable('Screen 3'));
    store.edit({ op: 'renameProject', name: 'Screen 3b' });
    await session.closeProject();
    expect(project(store.getState()).tables.size).toBe(0);
    expect(store.getState().sheet).toEqual({ kind: 'home' });
    expect(store.getState().notice?.text).toBe(
      'Closed “Screen 3b”. It’s kept in this browser: open it again from the list.',
    );
    const [kept] = await storage.list();
    expect(kept?.name).toBe('Screen 3b');
    if (!kept) throw new Error('not kept');
    await session.openStored(kept.id);
    expect(project(store.getState()).name).toBe('Screen 3b');
  });

  it('says nothing when closing an empty project', async () => {
    const { store, session } = setup();
    await session.closeProject();
    expect(store.getState().notice).toBeNull();
  });
});

function stubPicker() {
  const picker = vi.fn(() =>
    Promise.resolve({
      createWritable: () =>
        Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
    } as unknown as FileSystemFileHandle),
  );
  (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker;
  return picker;
}

afterEach(() => {
  delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe('the project manager (item 09)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes the open project, and its pending autosave never brings it back', async () => {
    const { store, storage, session } = setup();
    const p = withTable('Doomed');
    await storage.save(p, '1.0.0');
    await session.openStored(p.id);
    store.edit({ op: 'renameProject', name: 'Doomed, edited' });
    await session.deleteProject(p.id, 'Doomed, edited');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    await session.autosaver.flush();
    expect(await storage.list()).toEqual([]);
    expect(project(store.getState()).tables.size).toBe(0);
    expect(store.getState().notice?.text).toBe('Deleted “Doomed, edited” from this browser.');
  });

  it('waits for a write under way before deleting', async () => {
    const { store, storage, session } = setup();
    store.load(withTable('In flight'));
    store.edit({ op: 'renameProject', name: 'In flight 2' });
    const id = project(store.getState()).id;
    // A slow disk: the write is still under way when the delete comes.
    const save = storage.save.bind(storage);
    const opened: { release?: () => void } = {};
    const gate = new Promise<void>((r) => {
      opened.release = r;
    });
    vi.spyOn(storage, 'save').mockImplementation(async (...args) => {
      await gate;
      await save(...args);
    });
    const writing = session.autosaver.flush();
    const deleting = session.deleteProject(id, 'In flight 2');
    await vi.advanceTimersByTimeAsync(10);
    opened.release?.();
    await Promise.all([writing, deleting]);
    expect(await storage.list()).toEqual([]);
  });

  it('deletes a project that is not open, leaving the open one alone', async () => {
    const { store, storage, session } = setup();
    const other = withTable('Other');
    await storage.save(other, '1.0.0');
    store.load(withTable('Open'));
    const open = project(store.getState());
    await session.deleteProject(other.id, 'Other');
    expect(project(store.getState())).toBe(open);
    expect(await storage.load(other.id)).toBeNull();
  });

  it('marks the row downloaded, keeps that on reopening, and an edit clears it', async () => {
    const { store, storage, session } = setup();
    store.load(withTable('Figure 3'));
    store.edit({ op: 'renameProject', name: 'Figure 3b' });
    const id = project(store.getState()).id;
    stubPicker();
    await session.download();
    expect((await storage.list())[0]).toMatchObject({ name: 'Figure 3b', downloaded: true });
    await session.newProject();
    await session.openStored(id);
    expect(store.getState().downloaded).toBe(project(store.getState()));
    store.edit({ op: 'renameProject', name: 'Figure 3c' });
    await session.autosaver.flush();
    expect((await storage.list())[0]).toMatchObject({ name: 'Figure 3c', downloaded: false });
  });

  it('downloads a project in the list without opening it', async () => {
    const { store, storage, session } = setup();
    const p = withTable('Elsewhere');
    await storage.save(p, '1.0.0');
    const open = project(store.getState());
    const picker = stubPicker();
    expect(await session.downloadStored(p.id)).toBe(true);
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Elsewhere.bsig' }),
    );
    expect(project(store.getState())).toBe(open);
    expect((await storage.list())[0]?.downloaded).toBe(true);
  });

  it('renames the open project as an edit, and another one in storage', async () => {
    const { store, storage, session } = setup();
    const other = withTable('Other');
    await storage.save(other, '1.0.0');
    store.load(withTable('Open'));
    await session.renameStored(project(store.getState()).id, 'Open, renamed');
    expect(store.undoLabel()).toBe('Undo Rename project');
    await session.renameStored(other.id, 'Other, renamed');
    expect((await storage.load(other.id))?.project.name).toBe('Other, renamed');
  });

  it('duplicates as “Name (copy)”, then “Name (copy 2)”', async () => {
    const { storage, session } = setup();
    const p = withTable('Assay');
    await storage.save(p, '1.0.0');
    await session.duplicateStored(p.id, 'Assay');
    await session.duplicateStored(p.id, 'Assay');
    expect((await storage.list()).map((r) => r.name).sort()).toEqual([
      'Assay',
      'Assay (copy 2)',
      'Assay (copy)',
    ]);
  });
});
