// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import { createProject } from '@/model/project';
import { createColumnTable } from '@/model/table';

import { App } from '../App';
import { project, store } from '../state/store';

afterEach(cleanup);

beforeEach(() => {
  const base = createColumnTable({ title: 'Assay', groups: ['Vehicle', 'Drug'], rows: 3 });
  const t = {
    ...base,
    dataSets: base.dataSets.map((d, i) => ({
      ...d,
      subcolumns: [
        [
          [2, 4, 5],
          [1, 6, 10],
        ][i] ?? [],
      ],
    })),
  };
  act(() => {
    store.load(applyEdit(createProject('P'), { op: 'addTable', table: t }));
  });
});

describe('Normalize', () => {
  it('makes a calculated table that follows the original and says what it is', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Normalize…' }));
    // The default is each row against the first data set, as a percent.
    expect(
      screen.getByText(/can’t be tested against itself|cannot be tested against itself/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make normalized table' }));
    const made = [...project(store.getState()).tables.values()].find((t) => t.derived);
    expect(made?.title).toBe('Assay (normalized)');
    expect(made?.valueTitle).toBe('% of control');
    expect(made?.dataSets[1]?.subcolumns[0]).toEqual([50, 150, 200]);
    expect(screen.getByText(/Normalized from “?"?Assay/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Detach (make editable)' })).toBeTruthy();
  });

  it('refuses a control of zero in words and keeps the button off', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Normalize…' }));
    fireEvent.click(screen.getByLabelText(/as an average of the whole control group/));
    fireEvent.click(screen.getByLabelText(/A number I type/));
    fireEvent.change(screen.getByLabelText(/Divide every value by/), { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toMatch(/is 0/);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Make normalized table' }).disabled,
    ).toBe(true);
  });
});
