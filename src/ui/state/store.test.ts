import { describe, expect, it } from 'vitest';

import { createProject } from '@/model/project';
import { createColumnTable } from '@/model/table';

import { AppStore, HOME, project } from './store';

function withTable() {
  const s = new AppStore(createProject('P'));
  const table = createColumnTable({ title: 'Viability', groups: ['A'], rows: 1 });
  s.edit({ op: 'addTable', table }, { show: { kind: 'table', id: table.id } });
  return { s, table };
}

describe('AppStore', () => {
  it('records each edit as an undo step with its name', () => {
    const { s, table } = withTable();
    expect(s.getState().sheet).toEqual({ kind: 'table', id: table.id });
    expect(s.undoLabel()).toBe('Undo New table');
    expect(s.redoLabel()).toBeNull();
    s.undo();
    expect(project(s.getState()).tables.size).toBe(0);
    // The table is gone, so the sheet falls back to home.
    expect(s.getState().sheet).toEqual(HOME);
    expect(s.redoLabel()).toBe('Redo New table');
    s.redo();
    expect(s.getState().sheet).toEqual({ kind: 'table', id: table.id });
  });

  it('undo returns to the sheet where the change was made', () => {
    const { s, table } = withTable();
    const other = createColumnTable({ title: 'Other', groups: ['B'] });
    s.edit({ op: 'addTable', table: other }, { show: { kind: 'table', id: other.id } });
    s.show({ kind: 'table', id: table.id });
    s.edit({ op: 'setTableInfo', table: table.id, notes: 'n' });
    s.show({ kind: 'table', id: other.id });
    s.undo();
    expect(s.getState().sheet).toEqual({ kind: 'table', id: table.id });
  });

  it('refuses an invalid edit with a notice and no undo step', () => {
    const { s } = withTable();
    const before = s.getState().history;
    const listener: string[] = [];
    s.subscribe(() => listener.push('changed'));
    expect(
      s.edit({ op: 'removeTable', table: createColumnTable({ title: 'x', groups: [] }).id }),
    ).toBe(false);
    expect(s.getState().history).toBe(before);
    expect(s.getState().notice).toMatchObject({ tone: 'error' });
    expect(listener).toEqual(['changed']);
  });

  it('starts a fresh history when a project is loaded, remembering a file as downloaded', () => {
    const { s } = withTable();
    const p = createProject('Opened');
    s.load(p, { fromFile: true });
    expect(s.undoLabel()).toBeNull();
    expect(s.getState().downloaded).toBe(p);
    s.edit({ op: 'renameProject', name: 'Changed' });
    expect(s.getState().downloaded).not.toBe(project(s.getState()));
  });
});
