import { describe, expect, it, vi } from 'vitest';

import { applyEdit } from '@/model/edits';
import { asId, newId } from '@/model/ids';
import { createProject } from '@/model/project';
import { createColumnTable } from '@/model/table';

import { BarelySigDb, ProjectStorage } from './storage';

const fresh = () => new ProjectStorage(new BarelySigDb(`test-${newId('x')}`));

function project(name: string) {
  return applyEdit(createProject(name), {
    op: 'addTable',
    table: createColumnTable({ title: 'T', groups: ['A'], rows: 2 }),
  });
}

describe('ProjectStorage', () => {
  it('keeps projects as .bsig text and gives back the latest', async () => {
    const s = fresh();
    expect(await s.latest()).toBeNull();
    const a = project('First');
    const b = project('Second');
    await s.save(a, '0.3.0', { now: 1000 });
    await s.save(b, '0.3.0', { now: 2000 });
    expect((await s.latest())?.project).toStrictEqual(b);
    expect((await s.load(a.id))?.project).toStrictEqual(a);
    expect((await s.list()).map((r) => [r.name, r.tables])).toEqual([
      ['Second', 1],
      ['First', 1],
    ]);
  });

  it('overwrites a project saved again, and removes one', async () => {
    const s = fresh();
    const a = project('A');
    await s.save(a, '0.3.0', { now: 1 });
    const renamed = applyEdit(a, { op: 'renameProject', name: 'A2' });
    await s.save(renamed, '0.3.0', { now: 2 });
    expect((await s.list()).map((r) => r.name)).toEqual(['A2']);
    await s.remove(a.id);
    expect(await s.list()).toEqual([]);
  });

  it('leaves a row it cannot read alone and returns null for it', async () => {
    const db = new BarelySigDb(`test-${newId('x')}`);
    const s = new ProjectStorage(db);
    await db.projects.put({
      id: 'p_future',
      name: 'From the future',
      text: '{"format":"barelysig","schemaVersion":99}',
      tables: 0,
      updatedAt: 5,
    });
    expect(await s.latest()).toBeNull();
    expect(await db.projects.count()).toBe(1);
  });

  it('counts what a project holds, and whether a file of it exists', async () => {
    const s = fresh();
    const a = project('A');
    await s.save(a, '1.0.0', { now: 1 });
    expect(await s.list()).toEqual([
      { id: a.id, name: 'A', tables: 1, analyses: 0, graphs: 0, downloaded: false, updatedAt: 1 },
    ]);
    expect((await s.load(a.id))?.downloaded).toBe(false);
    await s.markDownloaded(a.id);
    expect((await s.list())[0]?.downloaded).toBe(true);
    expect((await s.load(a.id))?.downloaded).toBe(true);
    // Saving again (an edit) says whether it is still the downloaded one.
    await s.save(a, '1.0.0', { now: 2 });
    expect((await s.list())[0]?.downloaded).toBe(false);
  });

  it('reads a row written before the counts as not downloaded', async () => {
    const db = new BarelySigDb(`test-${newId('x')}`);
    const s = new ProjectStorage(db);
    const a = project('Old');
    await s.save(a, '1.0.0', { now: 1 });
    const { text } = (await s.text(a.id)) ?? { text: '' };
    await db.projects.put({ id: a.id, name: 'Old', text, tables: 1, updatedAt: 1 });
    expect(await s.list()).toEqual([
      {
        id: a.id,
        name: 'Old',
        tables: 1,
        analyses: null,
        graphs: null,
        downloaded: false,
        updatedAt: 1,
      },
    ]);
  });

  it('renames and duplicates without opening, and clears the downloaded flag', async () => {
    const s = fresh();
    const a = project('A');
    await s.save(a, '1.0.0', { now: 1, downloaded: true });
    expect(await s.rename(a.id, 'Renamed', '1.0.0', 2)).toBe(true);
    const renamed = await s.load(a.id);
    expect(renamed?.project.name).toBe('Renamed');
    expect(renamed?.project.tables).toStrictEqual(a.tables);
    expect(renamed?.downloaded).toBe(false);
    const copy = await s.duplicate(
      a.id,
      { id: asId('p_copy'), name: 'Renamed (copy)' },
      '1.0.0',
      3,
    );
    expect(copy).toMatchObject({ name: 'Renamed (copy)', tables: 1, downloaded: false });
    expect((await s.load(asId('p_copy')))?.project.tables).toStrictEqual(a.tables);
    expect((await s.list()).map((r) => r.name)).toEqual(['Renamed (copy)', 'Renamed']);
  });

  it('refuses to rename or duplicate a row it cannot read, and still lets it be downloaded', async () => {
    const db = new BarelySigDb(`test-${newId('x')}`);
    const s = new ProjectStorage(db);
    const text = '{"format":"barelysig","schemaVersion":99}';
    await db.projects.put({ id: 'p_future', name: 'Future', text, tables: 0, updatedAt: 5 });
    expect(await s.rename(asId('p_future'), 'X', '1.0.0')).toBe(false);
    expect(await s.duplicate(asId('p_future'), { id: asId('p_2'), name: 'Y' }, '1.0.0')).toBeNull();
    expect(await s.text(asId('p_future'))).toEqual({ name: 'Future', text });
  });

  it('tells listeners after every write and removal', async () => {
    const s = fresh();
    const heard = vi.fn();
    const off = s.subscribe(heard);
    const a = project('A');
    await s.save(a, '1.0.0');
    await s.markDownloaded(a.id);
    await s.markDownloaded(asId('p_missing'));
    await s.remove(a.id);
    expect(heard).toHaveBeenCalledTimes(3);
    off();
    await s.save(a, '1.0.0');
    expect(heard).toHaveBeenCalledTimes(3);
  });
});
