// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DescriptiveResult } from '@/analyses/descriptive/types';
import { applyEdit } from '@/model/edits';
import type { Json } from '@/model/json';
import { GRAPH_DEFAULTS, createProject } from '@/model/project';
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

describe('significance brackets on the graph', () => {
  it('offers the table’s t tests, shows their brackets, and labels them as chosen', async () => {
    const p0 = project(store.getState());
    const t = [...p0.tables.values()][0];
    if (!t) throw new Error('unreachable');
    const ids = t.dataSets.map((d) => d.id);
    setResults(
      new ResultsBridge(store, {
        debounceMs: 0,
        runner: (job) =>
          Promise.resolve(
            (job.analysis.kind === 't-test'
              ? { p: 0.0004, a: { id: ids[0] }, b: { id: ids[1] } }
              : summaryOf(job)) as unknown as Json,
          ),
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    await screen.findByRole('img', { name: /Bars/ });
    expect(
      screen.getByText('Compare groups of this table (a t test, for example) to add brackets.'),
    ).toBeInTheDocument();
    act(() => {
      store.edit({
        op: 'addAnalysis',
        analysis: {
          id: 'a_t' as never,
          title: 'Unpaired t test of Viability',
          kind: 't-test',
          options: { paired: false, welch: false, tails: 'two' },
          input: { kind: 'table', table: t.id, dataSets: ids },
        },
      });
    });
    const box = await screen.findByRole('checkbox', { name: 'Unpaired t test of Viability' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await screen.findByText('***', { selector: '[data-role="bracket-label"]' });
    expect(screen.getByText(/Asterisks: ns P ≥ 0.05/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Bracket labels' }), {
      target: { value: 'exact' },
    });
    expect(svg()?.querySelector('[data-role="bracket-label"]')?.textContent).toBe('P = 0.0004');
    expect(screen.queryByText(/Asterisks:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Unpaired t test of Viability' }));
    expect(svg()?.querySelectorAll('[data-role="bracket"]')).toHaveLength(0);
  });
});

describe('formatting on the graph (note 07)', () => {
  const graphOf = () => [...project(store.getState()).graphs.values()][0];
  /** A figure 300 px wide, as a browser would lay it out (jsdom has no layout). */
  function sized() {
    const fig = screen.getByRole('img', { name: /Viability/ });
    const view = svg()?.getAttribute('viewBox')?.split(' ').map(Number) ?? [];
    const [, , w = 1, h = 1] = view;
    fig.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 300,
        height: (300 * h) / w,
        right: 300,
        bottom: (300 * h) / w,
      }) as DOMRect;
    return 300 / w;
  }
  const canvas = () => screen.getByLabelText(/Graph: click a part of it/);

  it('selects an element from the list, edits it, and resets it', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    await screen.findByRole('img', { name: /Bars/ });
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), {
      target: { value: 'y-axis' },
    });
    expect(screen.getByRole('heading', { name: 'Y axis' })).toBeInTheDocument();
    const max = screen.getByRole('textbox', { name: 'Maximum' });
    fireEvent.change(max, { target: { value: '20' } });
    fireEvent.blur(max);
    expect(graphOf()?.format.yMax).toBe(20);
    expect(svg()?.querySelectorAll('[data-role="tick-label"]')[0]?.textContent).toBe('0');
    const size = screen.getByRole('textbox', { name: 'Label size (both axes)' });
    fireEvent.change(size, { target: { value: '9' } });
    fireEvent.keyDown(size, { key: 'Enter' });
    expect(svg()?.querySelector('[data-role="tick-label"]')?.getAttribute('font-size')).toBe('9');
    fireEvent.click(screen.getByRole('checkbox', { name: /Logarithmic/ }));
    expect(graphOf()?.format.yScale).toBe('log10');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the theme' }));
    expect(graphOf()?.format).toEqual(GRAPH_DEFAULTS.format);
    // Each change was one undo step.
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(graphOf()?.format.yScale).toBe('log10');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('form', { name: 'Graph settings' })).toBeInTheDocument();
  });

  it('selects what is clicked, outlines it, and colours a data set in the table', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    await screen.findByRole('img', { name: /Bars/ });
    const k = sized();
    const bar = svg()?.querySelectorAll('[data-role="bar"]')[1];
    const x = Number(bar?.getAttribute('x')) + Number(bar?.getAttribute('width')) / 2;
    const y = Number(bar?.getAttribute('y')) + Number(bar?.getAttribute('height')) * 0.5;
    fireEvent.pointerDown(canvas(), { clientX: x * k, clientY: y * k, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { pointerId: 1 });
    expect(screen.getByRole('heading', { name: 'Data set: KO' })).toBeInTheDocument();
    expect(document.querySelectorAll('.graph-overlay rect').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: '#029e73' }));
    const t = [...project(store.getState()).tables.values()][0];
    expect(t?.dataSets[1]?.color).toBe('#029e73');
    expect(svg()?.querySelectorAll('[data-role="bar"]')[1]?.getAttribute('stroke')).toBe('#029e73');
    fireEvent.change(screen.getByRole('combobox', { name: 'Symbol' }), {
      target: { value: 'square' },
    });
    expect(svg()?.querySelectorAll('path[data-role="point"]')).toHaveLength(2);
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    expect(screen.getByRole('form', { name: 'Graph settings' })).toBeInTheDocument();
  });

  it('drags a bracket up as one edit, and moves it with the arrow keys', async () => {
    const t = [...project(store.getState()).tables.values()][0];
    if (!t) throw new Error('unreachable');
    const ids = t.dataSets.map((d) => d.id);
    setResults(
      new ResultsBridge(store, {
        debounceMs: 0,
        runner: (job) =>
          Promise.resolve(
            (job.analysis.kind === 't-test'
              ? { p: 0.03, a: { id: ids[0] }, b: { id: ids[1] } }
              : summaryOf(job)) as unknown as Json,
          ),
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    await screen.findByRole('img', { name: /Bars/ });
    act(() => {
      store.edit({
        op: 'addAnalysis',
        analysis: {
          id: 'a_t' as never,
          title: 'Unpaired t test of Viability',
          kind: 't-test',
          options: { paired: false, welch: false, tails: 'two' },
          input: { kind: 'table', table: t.id, dataSets: ids },
        },
      });
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Unpaired t test of Viability' }));
    const label = await screen.findByText('*', { selector: '[data-role="bracket-label"]' });
    const k = sized();
    const lx = Number(label.getAttribute('x'));
    const ly = Number(label.getAttribute('y')) - 2;
    const steps = () => project(store.getState());
    const before = steps();
    fireEvent.pointerDown(canvas(), { clientX: lx * k, clientY: ly * k, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: lx * k, clientY: (ly - 4) * k, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: lx * k, clientY: (ly - 8) * k, pointerId: 1 });
    // Still only a preview.
    expect(steps()).toBe(before);
    fireEvent.pointerUp(canvas(), { pointerId: 1 });
    expect(graphOf()?.format.bracketOffsets).toEqual({ a_t: 8 });
    expect(screen.getByRole('heading', { name: 'Bracket: WT vs. KO' })).toBeInTheDocument();
    fireEvent.keyDown(canvas(), { key: 'ArrowDown', shiftKey: true });
    expect(graphOf()?.format.bracketOffsets).toEqual({ a_t: 3 });
    fireEvent.keyDown(canvas(), { key: 'ArrowDown', shiftKey: true });
    expect(graphOf()?.format.bracketOffsets).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(graphOf()?.format.bracketOffsets).toEqual({ a_t: 3 });
  });
});

describe('exporting', () => {
  it('exports an SVG at the chosen journal width, as one download', async () => {
    let written: unknown = null;
    let suggested = '';
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = (o: {
      suggestedName: string;
    }) => {
      suggested = o.suggestedName;
      return Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: (d: unknown) => {
              written = d;
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
          }),
      });
    };
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
    await screen.findByRole('img', { name: /Bars/ });
    fireEvent.click(screen.getByRole('button', { name: /Export…/ }));
    const dialog = screen.getByRole('dialog', { name: 'Export graph' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Single column (89 mm)' }));
    expect([...project(store.getState()).graphs.values()][0]?.size).toEqual({
      width: 89,
      height: 76.3,
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export SVG' }));
    await screen.findByText('Exported “Viability.svg”.');
    delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    expect(suggested).toBe('Viability.svg');
    expect(String(written)).toMatch(
      /^<\?xml version="1.0" encoding="UTF-8"\?>\n<!-- Made with BarelySig /,
    );
    expect(String(written)).toMatch(/<svg [^>]*width="89mm" height="76.3mm"/);
    expect(String(written)).toContain('<barelysig:recipe');
    // The project remembers the export.
    expect(project(store.getState()).exports.map((x) => [x.fileName, x.format, x.size])).toEqual([
      ['Viability.svg', 'svg', { width: 89, height: 76.3 }],
    ]);
    expect(await screen.findByRole('button', { name: 'Restore this figure' })).toBeInTheDocument();
  });
});
