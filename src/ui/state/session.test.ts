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
  return { store, storage, session: new Session(store, storage) };
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
