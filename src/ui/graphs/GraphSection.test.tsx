// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GraphSummaryResult } from '@/analyses/graphsummary/types';
import { drawnParts } from '@/graphs/drawn';
import { layoutColumn } from '@/graphs/layout';
import {
  type RenderReply,
  type RenderRequest,
  WorkerRenderer,
  type WorkerLike,
  setRenderer,
} from '@/graphs/renderer';
import type { TTestResult } from '@/analyses/ttest/types';
import { applyEdit } from '@/model/edits';
import type { Json } from '@/model/json';
import { GRAPH_DEFAULTS, createProject } from '@/model/project';
import type { Job } from '@/model/recompute';
import { createColumnTable, createGroupedTable } from '@/model/table';

import { App } from '../App';
import { ResultsBridge, setResults } from '../state/results';
import { project, store } from '../state/store';

function summaryOf(job: Job): GraphSummaryResult {
  const input = job.analysis.input;
  const sets = input.kind === 'table' ? input.dataSets : [];
  const table = input.kind === 'table' ? job.project.tables.get(input.table) : undefined;
  // A Grouped table's graph summarises its cells (note 07).
  const ds =
    table?.type === 'grouped' ? table.rows.flatMap((r) => sets.map((d) => `${r.id}/${d}`)) : sets;
  return {
    cells: ds.map((id, i) => ({
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
      whiskers: { low: 1, high: 4 + i, beyond: [] },
      kde: { bw: 1, y: [1, 2.5, 4 + i], density: [0.1, 0.3, 0.1] },
    })),
    warnings: [],
  };
}

/** A t test's result: its section is on the same page as the graph (item 08). */
function tTest(ids: readonly string[], p: number): TTestResult {
  return {
    test: 'unpaired',
    tails: 'two',
    from: 'values',
    a: { id: ids[0] ?? 'a', title: 'WT', n: 2, mean: 2, sd: 1 },
    b: { id: ids[1] ?? 'b', title: 'KO', n: 2, mean: 3, sd: 1 },
    t: 5,
    df: 2,
    pTwo: p,
    pOne: p / 2,
    p,
    difference: 1,
    seDifference: 1,
    ciLower: 0.5,
    ciUpper: 1.5,
    rSquared: 0.5,
    fTest: { f: 1, dfn: 1, dfd: 1, p: 1 },
    pairing: null,
    dropped: { a: { empty: 0, excluded: 0 }, b: { empty: 0, excluded: 0 }, rows: null },
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

/** The figure itself, not the sidebar's thumbnail of it. */
const figure = () => within(screen.getByRole('img', { name: /Viability/ }));

/** A new graph of the table, with its format panel open (item 08). */
function newGraph() {
  fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Format' }));
}

describe('graph sheet', () => {
  it('makes a graph of a table and draws its bars, points and error bars', async () => {
    render(<App />);
    newGraph();
    expect(screen.getByRole('heading', { level: 1, name: 'Viability' })).toBeInTheDocument();
    await screen.findByRole('img', { name: /Bars: mean ± SD/ });
    expect(svg()?.querySelectorAll('[data-role="bar"]')).toHaveLength(2);
    expect(svg()?.querySelectorAll('[data-role="point"]')).toHaveLength(4);
    expect(svg()?.querySelectorAll('[data-role="error"]')).toHaveLength(2);
    expect(screen.getByText(/Bars: mean ± SD; points: individual values\./)).toBeInTheDocument();
    // A section of the table's page, after the data.
    expect(screen.getByRole('heading', { level: 2, name: 'Viability' })).toBeInTheDocument();
    const onPage = within(screen.getByRole('navigation', { name: 'On this page' }));
    expect(onPage.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1Data',
      '2Viability',
    ]);
  });

  it('says it is calculating over the figure, moving nothing around it', async () => {
    render(<App />);
    newGraph();
    const canvas = screen.getByRole('img', { name: /Viability/ }).closest('.graph-canvas');
    expect(within(canvas as HTMLElement).getByRole('status')).toHaveTextContent(
      'Calculating the means and error bars…',
    );
    expect(document.querySelector('.graph-figure > .status-banner')).toBeNull();
    await waitFor(() => {
      expect(canvas).toHaveAttribute('aria-busy', 'false');
    });
    expect(within(canvas as HTMLElement).queryByRole('status')).toBeNull();
  });

  it('keeps the complete graph, faded, while a change is recalculated', async () => {
    let release: (() => void) | undefined;
    render(<App />);
    newGraph();
    await screen.findByRole('img', { name: /Bars: mean ± SD/ });
    await waitFor(() => {
      expect(svg()?.querySelectorAll('[data-role="error"]')).toHaveLength(2);
    });
    const before = svg()?.outerHTML;
    setResults(
      new ResultsBridge(store, {
        debounceMs: 0,
        runner: (job) =>
          new Promise((resolve) => {
            release = () => {
              resolve(summaryOf(job) as unknown as Json);
            };
          }),
      }),
    );
    const t = [...project(store.getState()).tables.values()][0];
    const [wt] = t?.dataSets ?? [];
    const [r0] = t?.rows ?? [];
    if (!t || !wt || !r0) throw new Error('unreachable');
    act(() => {
      store.edit({
        op: 'setCells',
        table: t.id,
        cells: [{ dataSet: wt.id, subcolumn: 0, row: r0.id, value: 7 }],
      });
    });
    const canvas = screen.getByRole('img', { name: /Viability/ }).closest('.graph-canvas');
    await waitFor(() => {
      expect(canvas).toHaveAttribute('aria-busy', 'true');
    });
    // Not a bare graph drawn in between: the last complete one, error bars and all.
    expect(svg()?.outerHTML).toBe(before);
    expect(within(canvas as HTMLElement).getByRole('status')).toHaveTextContent(
      'Calculating the means and error bars…',
    );
    await waitFor(() => {
      expect(release).toBeDefined();
    });
    act(() => {
      release?.();
    });
    await waitFor(() => {
      expect(canvas).toHaveAttribute('aria-busy', 'false');
    });
    expect(svg()?.outerHTML).not.toBe(before);
    expect(svg()?.querySelectorAll('[data-role="error"]')).toHaveLength(2);
  });

  it('switches to a dot plot, changes the error bars and theme, each one undo step', async () => {
    render(<App />);
    newGraph();
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

  it('draws box and violin plots, with their own settings and no error bars', async () => {
    render(<App />);
    newGraph();
    await screen.findByRole('img', { name: /Bars/ });
    fireEvent.click(screen.getByRole('radio', { name: 'Box and whiskers' }));
    await screen.findByRole('img', { name: /Boxes: median and quartiles; whiskers: min to max/ });
    expect(svg()?.querySelectorAll('[data-role="box"]')).toHaveLength(2);
    expect(screen.queryByRole('combobox', { name: 'Error bars' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Whiskers' }), {
      target: { value: 'tukey' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Points' }), {
      target: { value: 'outliers' },
    });
    expect([...project(store.getState()).graphs.values()][0]?.plot).toEqual({
      kind: 'box',
      whiskers: 'tukey',
      points: 'outliers',
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Violin' }));
    await screen.findByRole('img', { name: /Violins: distribution/ });
    expect(svg()?.querySelectorAll('[data-role="violin"]')).toHaveLength(2);
    expect(screen.getByText(/Bandwidths: /)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Bars' }));
    expect([...project(store.getState()).graphs.values()][0]?.plot).toEqual({
      kind: 'bars',
      error: 'sd',
      points: true,
    });
  });

  it('resizes the figure in millimetres', async () => {
    render(<App />);
    newGraph();
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

  it('keeps the settings open beside a larger figure where the section is wide (note 08)', async () => {
    const width = (el: Element) => (el.classList.contains('graph-body') ? 1200 : 0);
    const saved = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return width(this);
      },
    });
    const nothing = () => undefined;
    globalThis.ResizeObserver = class {
      observe = nothing;
      unobserve = nothing;
      disconnect = nothing;
    };
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: /New graph/ }));
      await screen.findByRole('img', { name: /Bars/ });
      expect(screen.queryByRole('button', { name: 'Format' })).toBeNull();
      expect(screen.getByRole('form', { name: 'Graph settings' })).toBeInTheDocument();
      // 70 mm at 2.25× (the most), not 1.5×: 1200 px leaves room for more.
      const canvas = screen.getByRole('img', { name: /Viability/ }).closest('.graph-canvas');
      expect(parseFloat((canvas as HTMLElement).style.width)).toBeCloseTo(
        70 * (96 / 25.4) * 2.25,
        2,
      );
    } finally {
      if (saved) Object.defineProperty(HTMLElement.prototype, 'clientWidth', saved);
      Reflect.deleteProperty(globalThis, 'ResizeObserver');
    }
  });
});

describe('grouped bar graphs', () => {
  it('makes interleaved bars of a Grouped table, with a legend, and separates them', async () => {
    const g = createGroupedTable({
      title: 'Growth',
      rowTitles: ['Day 1', 'Day 2'],
      groups: ['WT', 'KO'],
      format: { kind: 'replicates', count: 2 },
    });
    const [wt] = g.dataSets;
    const [d1] = g.rows;
    if (!wt || !d1) throw new Error('unreachable');
    act(() => {
      store.load(
        applyEdit(applyEdit(createProject('P'), { op: 'addTable', table: g }), {
          op: 'setCells',
          table: g.id,
          cells: [{ dataSet: wt.id, subcolumn: 0, row: d1.id, value: 3 }],
        }),
      );
    });
    render(<App />);
    newGraph();
    await screen.findByRole('img', { name: /Bars: mean ± SD/ });
    const gsvg = () => screen.getByRole('img', { name: /Growth/ }).querySelector('svg');
    expect(gsvg()?.querySelectorAll('[data-role="bar"]')).toHaveLength(4);
    expect(
      [...(gsvg()?.querySelectorAll('[data-role="legend-label"]') ?? [])].map((x) => x.textContent),
    ).toEqual(['WT', 'KO']);
    fireEvent.click(screen.getByRole('radio', { name: /separated/ }));
    expect(gsvg()?.querySelectorAll('[data-role="legend-label"]')).toHaveLength(0);
    expect(
      [...(gsvg()?.querySelectorAll('[data-role="cluster-label"]') ?? [])].map(
        (x) => x.textContent,
      ),
    ).toEqual(['WT', 'KO']);
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
              ? tTest(ids, 0.0004)
              : summaryOf(job)) as unknown as Json,
          ),
      }),
    );
    render(<App />);
    newGraph();
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
    await figure().findByText('***', { selector: '[data-role="bracket-label"]' });
    const graphSection = within(screen.getByRole('region', { name: 'Viability' }));
    expect(graphSection.getByText(/Asterisks: ns P ≥ 0.05/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Bracket labels' }), {
      target: { value: 'exact' },
    });
    expect(svg()?.querySelector('[data-role="bracket-label"]')?.textContent).toBe('P = 0.0004');
    expect(graphSection.queryByText(/Asterisks:/)).not.toBeInTheDocument();
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
    newGraph();
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
    newGraph();
    await screen.findByRole('img', { name: /Bars/ });
    const k = sized();
    const bar = svg()?.querySelectorAll('[data-role="bar"]')[1];
    const x = Number(bar?.getAttribute('x')) + Number(bar?.getAttribute('width')) / 2;
    const y = Number(bar?.getAttribute('y')) + Number(bar?.getAttribute('height')) * 0.5;
    fireEvent.pointerDown(canvas(), { clientX: x * k, clientY: y * k, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { pointerId: 1 });
    expect(screen.getByRole('heading', { name: 'Data set: KO' })).toBeInTheDocument();
    // One outline per mark of the data set, drawn as one path (item 11).
    const ref = bar?.getAttribute('data-ref') ?? '';
    const outlined = document.querySelector('.graph-overlay path')?.getAttribute('d') ?? '';
    expect(outlined.match(/M/g)).toHaveLength(
      svg()?.querySelectorAll(`[data-ref="${ref}"]:is([data-role="bar"], [data-role="point"])`)
        .length ?? -1,
    );
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
            (job.analysis.kind === 't-test' ? tTest(ids, 0.03) : summaryOf(job)) as unknown as Json,
          ),
      }),
    );
    render(<App />);
    newGraph();
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
    const label = await figure().findByText('*', { selector: '[data-role="bracket-label"]' });
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
    newGraph();
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

describe('drawn in a worker (item 11)', () => {
  /** A worker that paints only when told to. */
  class Painter implements WorkerLike {
    onmessage: ((e: MessageEvent<RenderReply>) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    pending: RenderRequest[] = [];
    postMessage(req: RenderRequest): void {
      this.pending.push(req);
    }
    terminate(): void {
      // Nothing runs.
    }
    /** Answers every request so far. */
    paint(): void {
      const reqs = this.pending;
      this.pending = [];
      act(() => {
        for (const req of reqs) {
          if (req.type !== 'draw' || req.input.kind !== 'column') continue;
          this.onmessage?.({
            data: {
              type: 'drawn',
              id: req.id,
              ok: true,
              parts: drawnParts(layoutColumn(req.input.input)),
              png: new Blob(['png'], { type: 'image/png' }),
            },
          } as MessageEvent<RenderReply>);
        }
      });
    }
  }

  let painter: Painter;
  // jsdom has no blob URLs.
  const saved: Partial<Record<string, PropertyDescriptor>> = Object.getOwnPropertyDescriptors(URL);
  beforeEach(() => {
    painter = new Painter();
    setRenderer(new WorkerRenderer(() => painter));
    let n = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => `blob:picture-${String((n += 1))}`,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  });
  afterEach(() => {
    setRenderer(null);
    for (const k of ['createObjectURL', 'revokeObjectURL'] as const) {
      const d = saved[k];
      if (d) Object.defineProperty(URL, k, d);
      else Reflect.deleteProperty(URL, k);
    }
  });

  it('shows a spinner in the placeholder, then the picture; the old picture while redrawing', async () => {
    render(<App />);
    newGraph();
    const picture = screen.getByRole('img', { name: /Viability/ });
    const canvas = picture.closest('.graph-canvas');
    expect(canvas).toHaveAttribute('aria-busy', 'true');
    expect(within(canvas as HTMLElement).getByRole('status')).toHaveTextContent(
      'Calculating the means and error bars…',
    );
    expect(picture.querySelector('img')).toBeNull();
    // Drawn without error bars, then again when they come.
    await waitFor(() => {
      painter.paint();
      expect(screen.queryByText(/Calculating the means/)).toBeNull();
      expect(canvas).toHaveAttribute('aria-busy', 'false');
    });
    const first = picture.querySelector('img')?.getAttribute('src');
    expect(first).toMatch(/^blob:/);
    expect(within(canvas as HTMLElement).queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: /Show the graph’s name/ }));
    expect(canvas).toHaveAttribute('aria-busy', 'true');
    expect(within(canvas as HTMLElement).getByRole('status')).toHaveTextContent('Redrawing…');
    expect(picture.querySelector('img')?.getAttribute('src')).toBe(first);
    painter.paint();
    expect(canvas).toHaveAttribute('aria-busy', 'false');
    expect(picture.querySelector('img')?.getAttribute('src')).not.toBe(first);
  });
});
