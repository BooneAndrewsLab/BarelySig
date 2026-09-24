// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import { createProject } from '@/model/project';
import { type Table, createColumnTable } from '@/model/table';

import { App } from '../App';
import { project, store } from '../state/store';

let tableId: Table['id'];

beforeEach(() => {
  const t = createColumnTable({ title: 'Viability', groups: [] });
  tableId = t.id;
  act(() => {
    store.load(applyEdit(createProject('P'), { op: 'addTable', table: t }));
  });
});

const table = (): Table => {
  const t = project(store.getState()).tables.get(tableId);
  if (!t) throw new Error('table gone');
  return t;
};
const grid = () => screen.getByRole('grid', { name: 'Viability data' });
const editor = () => within(grid()).getByRole('textbox');

/** Types text into the active cell the way a user does: a first key opens the editor. */
function typeText(text: string, end: 'Enter' | 'Tab' | 'ArrowRight' = 'Enter') {
  fireEvent.keyDown(grid(), { key: text[0] });
  fireEvent.change(editor(), { target: { value: text } });
  fireEvent.keyDown(editor(), { key: end });
}

const activeCell = () => {
  const id = grid().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

describe('DataGrid', () => {
  it('is a grid with the true row and column counts', () => {
    render(<App />);
    expect(grid()).toHaveAttribute('aria-rowcount');
    expect(Number(grid().getAttribute('aria-rowcount'))).toBeGreaterThan(20);
    expect(within(grid()).getAllByRole('columnheader')[0]).toHaveTextContent('Add group');
  });

  it('types values down a column, creating the group and rows', () => {
    render(<App />);
    typeText('1.5');
    typeText('2');
    typeText('0');
    expect(table().dataSets.map((d) => [d.title, d.subcolumns])).toEqual([
      ['Group A', [[1.5, 2, 0]]],
    ]);
    // Enter moved on to the fourth row, still empty.
    expect(activeCell()).toHaveAttribute('data-row', '3');
    expect(activeCell()?.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Undo Edit cells' })).toBeEnabled();
  });

  it('tabs across and returns to the starting column with Enter', () => {
    render(<App />);
    typeText('1', 'Tab');
    typeText('2', 'Tab');
    typeText('3', 'Enter');
    typeText('4');
    expect(table().dataSets.map((d) => d.subcolumns[0])).toEqual([
      [1, 4],
      [2, null],
      [3, null],
    ]);
  });

  it('refuses text with a message and keeps the editor open', () => {
    render(<App />);
    typeText('abc');
    expect(editor()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent("“abc” isn't a number");
    fireEvent.change(editor(), { target: { value: '12' } });
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(table().dataSets[0]?.subcolumns[0]).toEqual([12]);
    expect(screen.getByRole('status')).not.toHaveTextContent("isn't a number");
  });

  it('cancels an edit with Escape', () => {
    render(<App />);
    fireEvent.keyDown(grid(), { key: '9' });
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(within(grid()).queryByRole('textbox')).not.toBeInTheDocument();
    expect(table().dataSets).toHaveLength(0);
  });

  it('names a group from the title row', () => {
    render(<App />);
    fireEvent.keyDown(grid(), { key: 'ArrowUp' });
    typeText('Wild type');
    expect(table().dataSets.map((d) => d.title)).toEqual(['Wild type']);
    expect(within(grid()).getAllByRole('columnheader')[0]).toHaveTextContent('Wild type');
  });

  it('edits with F2 keeping the full value, and clears with Delete', () => {
    render(<App />);
    typeText('0.30000000000000004');
    fireEvent.keyDown(grid(), { key: 'ArrowUp' });
    expect(activeCell()).toHaveTextContent('0.3');
    fireEvent.keyDown(grid(), { key: 'F2' });
    expect(editor()).toHaveValue('0.30000000000000004');
    fireEvent.keyDown(editor(), { key: 'Escape' });
    fireEvent.keyDown(grid(), { key: 'Delete' });
    expect(table().dataSets[0]?.subcolumns[0]).toEqual([null]);
  });

  it('excludes the selected value with Ctrl+E and shows it struck through', () => {
    render(<App />);
    typeText('5');
    fireEvent.keyDown(grid(), { key: 'ArrowUp' });
    fireEvent.keyDown(grid(), { key: 'e', ctrlKey: true });
    expect(table().dataSets[0]?.excluded.size).toBe(1);
    expect(activeCell()).toHaveClass('excluded');
  });

  it('undoes a typed value with Ctrl+Z', () => {
    render(<App />);
    typeText('5');
    typeText('6');
    fireEvent.keyDown(grid(), { key: 'z', ctrlKey: true });
    expect(table().dataSets[0]?.subcolumns[0]).toEqual([5]);
  });

  it('summarises a range selection in the status line', () => {
    render(<App />);
    typeText('1');
    typeText('2');
    fireEvent.keyDown(grid(), { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(grid(), { key: 'ArrowUp', shiftKey: true });
    expect(screen.getByRole('status')).toHaveTextContent('3 cells selected, 2 with values');
  });
});
