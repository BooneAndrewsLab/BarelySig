// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createProject } from '@/model/project';

import { App } from './App';
import { project, store } from './state/store';

beforeEach(() => {
  act(() => {
    store.load(createProject('Untitled project'));
  });
});

const nav = () => within(screen.getByRole('navigation', { name: 'Project' }));

function createColumnTable() {
  fireEvent.click(screen.getByRole('button', { name: /Column table/ }));
  const dialog = screen.getByRole('dialog', { name: 'New table' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create table' }));
}

describe('app shell', () => {
  it('starts on the home screen and creates a table from it', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Start with a table' })).toBeInTheDocument();
    createColumnTable();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Data 1' })).toBeInTheDocument();
    expect(screen.getByText(/Column table, individual values/)).toBeInTheDocument();
    expect(nav().getByRole('button', { name: 'Data 1' })).toHaveAttribute('aria-current', 'page');
  });

  it('builds a Grouped table of summary data from the dialog', () => {
    render(<App />);
    fireEvent.click(nav().getByRole('button', { name: /New table/ }));
    const dialog = screen.getByRole('dialog', { name: 'New table' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Grouped/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /Summary data/ }));
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Summary data' }), {
      target: { value: 'mean-sem-n' },
    });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Growth' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create table' }));
    const t = [...project(store.getState()).tables.values()][0];
    expect(t).toMatchObject({
      type: 'grouped',
      title: 'Growth',
      format: { kind: 'summary', stats: 'mean-sem-n' },
    });
  });

  it('cancels the dialog with Escape', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Grouped table/ }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(project(store.getState()).tables.size).toBe(0);
  });

  it('renames, duplicates and deletes tables, and undo brings a deleted one back', () => {
    render(<App />);
    createColumnTable();
    fireEvent.click(nav().getByRole('button', { name: 'More for Data 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = nav().getByRole('textbox', { name: 'Table name' });
    fireEvent.change(input, { target: { value: 'Viability' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(nav().getByRole('button', { name: 'Viability' })).toBeInTheDocument();

    fireEvent.click(nav().getByRole('button', { name: 'More for Viability' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Viability (copy)' })).toBeInTheDocument();

    fireEvent.click(nav().getByRole('button', { name: 'More for Viability (copy)' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(nav().queryByRole('button', { name: 'Viability (copy)' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Deleted “Viability (copy)”. Undo brings it back',
    );

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(nav().getByRole('button', { name: 'Viability (copy)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo Delete table' })).toBeEnabled();
  });

  it('renames the project from the bar, as one undo step', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Untitled project' }));
    const input = screen.getByRole('textbox', { name: 'Project name' });
    fireEvent.change(input, { target: { value: 'Knockout screen' } });
    fireEvent.blur(input);
    expect(screen.getByRole('button', { name: 'Knockout screen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo Rename project' }));
    expect(screen.getByRole('button', { name: 'Untitled project' })).toBeInTheDocument();
  });

  it('opens the example project', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }));
    expect(
      nav().getAllByRole('button', {
        name: /^(Cell viability|Growth by genotype) \(example data\)$/,
      }),
    ).toHaveLength(2);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cell viability (example data)' }),
    ).toBeInTheDocument();
  });
});
