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
  const t = createColumnTable({
    title: 'Means',
    groups: [],
    format: { kind: 'summary', stats: 'mean-sd-n' },
  });
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
const grid = () => screen.getByRole('grid', { name: 'Means data' });

function typeRow(values: readonly string[]) {
  for (const v of values) {
    fireEvent.keyDown(grid(), { key: v[0] });
    fireEvent.change(within(grid()).getByRole('textbox'), { target: { value: v } });
    fireEvent.keyDown(within(grid()).getByRole('textbox'), { key: 'Tab' });
  }
}

describe('summary data', () => {
  it('labels the subcolumns and takes one row per group', () => {
    render(<App />);
    const heads = within(grid())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(['Mean', 'SD', 'N']));
    typeRow(['10', '2', '5', '12', '3', '5']);
    expect(table().dataSets.map((d) => d.subcolumns)).toEqual([
      [[10], [2], [5]],
      [[12], [3], [5]],
    ]);
    expect(table().rows).toHaveLength(1);
    // Down from the only row stays on it.
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    fireEvent.keyDown(grid(), { key: '4' });
    fireEvent.keyDown(within(grid()).getByRole('textbox'), { key: 'Enter' });
    expect(table().rows).toHaveLength(1);
  });

  it('changes the format, warning first what it clears, and undoes it', () => {
    render(<App />);
    typeRow(['10', '2', '5']);
    fireEvent.click(screen.getByRole('button', { name: 'Change data format…' }));
    const dialog = screen.getByRole('dialog', { name: 'Change data format' });
    expect(within(dialog).getByRole('button', { name: 'Change format' })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Summary data' }), {
      target: { value: 'mean-sem-n' },
    });
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'This clears 1 value that doesn’t fit the new format.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change format' }));
    expect(table().format).toEqual({ kind: 'summary', stats: 'mean-sem-n' });
    expect(table().dataSets[0]?.subcolumns).toEqual([[10], [null], [5]]);
    expect(screen.getByText(/mean, sem and n/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo Change data format' }));
    expect(table().dataSets[0]?.subcolumns).toEqual([[10], [2], [5]]);
  });

  it('offers a mean with interval limits, for graphs', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Change data format…' }));
    const dialog = screen.getByRole('dialog', { name: 'Change data format' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Summary data' }), {
      target: { value: 'mean-lower-upper' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change format' }));
    const heads = within(grid())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(['Mean', 'Lower', 'Upper']));
  });
});
