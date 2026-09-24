import { describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import { newId } from '@/model/ids';
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
    await s.save(a, '0.3.0', 1000);
    await s.save(b, '0.3.0', 2000);
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
    await s.save(a, '0.3.0', 1);
    const renamed = applyEdit(a, { op: 'renameProject', name: 'A2' });
    await s.save(renamed, '0.3.0', 2);
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
});
