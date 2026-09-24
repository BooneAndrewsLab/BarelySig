// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DescriptiveResult } from '@/analyses/descriptive/types';
import { applyEdit } from '@/model/edits';
import type { Json } from '@/model/json';
import { createProject } from '@/model/project';
import type { Job } from '@/model/recompute';
import { createColumnTable } from '@/model/table';

import { App } from '../App';
import { ResultsBridge, setResults } from '../state/results';
import { project, store } from '../state/store';

function summaryOf(job: Job): DescriptiveResult {
  const ds = job.analysis.input.kind === 'table' ? job.analysis.input.dataSets : [];
  return {
    groups: ds.map((id, i) => ({
      id,
      title: `G${String(i)}`,
      from: 'values',
      n: 2,
      dropped: null,
      min: 1,
      q1: 1,
      median: 2 + i,
      q3: 3,
      max: 4 + i,
      range: 3,
      mean: 2 + i,
      sd: 1,
      sem: 0.7,
      ciLower: 0,
      ciUpper: 4 + i,
      cv: 50,
      geomean: 2,
      sum: 4,
    })),
    warnings: [],
  };
}

beforeEach(() => {
  const t = createColumnTable({ title: 'Viability', groups: ['WT', 'KO'], rows: 2 });
  const [wt, ko] = t.dataSets;
  if (!wt || !ko) throw new Error('unreachable');
  let p = applyEdit(createProject('P'), { op: 'addTable', table: t });
  p = applyEdit(p, {
    op: 'setCells',
    table: t.id,
    cells: t.rows.flatMap((r, i) => [
      { dataSet: wt.id, subcolumn: 0, row: r.id, value: 1 + i * 2 },
      { dataSet: ko.id, subcolumn: 0, row: r.id, value: 2 + i * 2 },
    ]),
  });
  act(() => {
    store.load(p);
  });
  setResults(
    new ResultsBridge(store, {
      debounceMs: 0,
      runner: (job) => Promise.resolve(summaryOf(job) as unknown as Json),
    }),
  );
});

const svg = () => screen.getByRole('img', { name: /Viability/ }).querySelector('svg');

describe('graph sheet', () => {
  it('makes a graph of a table and draws its bars, points and error bars', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Viability' })).toBeInTheDocument();
    await screen.findByRole('img', { name: /Bars: mean ± SD/ });
    expect(svg()?.querySelectorAll('[data-role="bar"]')).toHaveLength(2);
    expect(svg()?.querySelectorAll('[data-role="point"]')).toHaveLength(4);
    expect(svg()?.querySelectorAll('[data-role="error"]')).toHaveLength(2);
    expect(screen.getByText(/Bars: mean ± SD; points: individual values\./)).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Project' }));
    expect(nav.getAllByRole('button', { name: 'Viability' })).toHaveLength(2);
  });

  it('switches to a dot plot, changes the error bars and theme, each one undo step', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    await screen.findByRole('img', { name: /Bars/ });
    fireEvent.click(screen.getByRole('radio', { name: /Dots/ }));
    expect(svg()?.querySelectorAll('[data-role="bar"]')).toHaveLength(0);
    expect(svg()?.querySelectorAll('[data-role="centre"]')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Error bars' }), {
      target: { value: 'none' },
    });
    expect(svg()?.querySelectorAll('[data-role="error"]')).toHaveLength(0);
    fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), {
      target: { value: 'classic' },
    });
    expect(svg()?.querySelectorAll('[data-role="frame"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(svg()?.querySelectorAll('[data-role="frame"]')).toHaveLength(0);
    const g = [...project(store.getState()).graphs.values()][0];
    expect(g?.plot).toEqual({ kind: 'dots', center: 'mean', error: 'none' });
  });

  it('resizes the figure in millimetres', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    await screen.findByRole('img', { name: /Bars/ });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width in millimetres' }), {
      target: { value: '89' },
    });
    expect([...project(store.getState()).graphs.values()][0]?.size).toEqual({
      width: 89,
      height: 60,
    });
    expect(svg()?.getAttribute('viewBox')).toBe(
      `0 0 ${String(Math.round(((89 * 72) / 25.4) * 100) / 100)} ${String(Math.round(((60 * 72) / 25.4) * 100) / 100)}`,
    );
  });
});
