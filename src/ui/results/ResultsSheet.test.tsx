// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DescriptiveResult } from '@/analyses/descriptive/types';
import type { TTestResult } from '@/analyses/ttest/types';
import { applyEdit } from '@/model/edits';
import type { Json } from '@/model/json';
import { createProject } from '@/model/project';
import type { Job } from '@/model/recompute';
import { type Table, createColumnTable } from '@/model/table';

import { App } from '../App';
import { ResultsBridge, setResults } from '../state/results';
import { project, store } from '../state/store';

let runs: Job[] = [];
let answer: (job: Job) => Promise<Json>;

function tResult(job: Job): TTestResult {
  const p = runs.length === 1 ? 0.0021 : 0.3;
  return {
    test: 'unpaired',
    tails: 'two',
    from: 'values',
    a: { id: 'a', title: 'WT', n: 3, mean: 2, sd: 1 },
    b: { id: 'b', title: 'KO', n: 3, mean: 5, sd: 1 },
    t: 3.674,
    df: 4,
    pTwo: p,
    pOne: p / 2,
    p,
    difference: 3,
    seDifference: 0.8165,
    ciLower: 0.73,
    ciUpper: 5.27,
    rSquared: 0.7714,
    fTest: { f: 1, dfn: 2, dfd: 2, p: 1 },
    pairing: null,
    dropped: { a: { empty: 0, excluded: 0 }, b: { empty: 1, excluded: 0 }, rows: null },
    warnings: job.analysis.title.includes('warn') ? ['data are essentially constant'] : [],
  };
}

let tableId: Table['id'];

beforeEach(() => {
  runs = [];
  answer = (job) => Promise.resolve(tResult(job) as unknown as Json);
  const t = createColumnTable({ title: 'Viability', groups: ['WT', 'KO', 'Het'], rows: 3 });
  tableId = t.id;
  const [wt, ko] = t.dataSets;
  if (!wt || !ko) throw new Error('unreachable');
  let p = applyEdit(createProject('P'), { op: 'addTable', table: t });
  p = applyEdit(p, {
    op: 'setCells',
    table: t.id,
    cells: t.rows.flatMap((r, i) => [
      { dataSet: wt.id, subcolumn: 0, row: r.id, value: i + 1 },
      { dataSet: ko.id, subcolumn: 0, row: r.id, value: i + 4 },
    ]),
  });
  act(() => {
    store.load(p);
  });
  setResults(
    new ResultsBridge(store, {
      debounceMs: 0,
      runner: (job) => {
        runs.push(job);
        return answer(job);
      },
    }),
  );
});

function analyze(kind: RegExp, groups?: readonly string[]) {
  fireEvent.click(screen.getByRole('button', { name: /Analyze…/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('radio', { name: kind }));
  if (groups) {
    for (const box of within(dialog).getAllByRole('checkbox')) {
      const name = box.parentElement?.textContent ?? '';
      if (groups.includes(name) !== (box as HTMLInputElement).checked) fireEvent.click(box);
    }
  }
  fireEvent.click(within(dialog).getByRole('button', { name: 'Analyze' }));
}

describe('results sheets', () => {
  it('runs a t test from the table and shows it as Prism does, with a plain reading', async () => {
    render(<App />);
    analyze(/t test/);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Unpaired t test of Viability' }),
    ).toBeInTheDocument();
    await screen.findByText(/^The mean of KO is higher than the mean of WT \(P = 0\.0021\)/);
    expect(
      screen.getByText('Unpaired t test, assuming both groups have the same SD, two-tailed.'),
    ).toBeInTheDocument();
    const table = screen.getByRole('table');
    // The first matching row: the F test has its own "P value" further down.
    const row = (label: string) =>
      within(table).getAllByRole('rowheader', { name: label })[0]?.closest('tr');
    expect(row('P value')).toHaveTextContent('0.0021');
    expect(row('P value summary')).toHaveTextContent('**');
    expect(row('t, df')).toHaveTextContent('t = 3.674, df = 4');
    expect(row('Sample size, KO')).toHaveTextContent('3 (1 empty left out)');
    expect(screen.getByText(/Asterisks: ns P ≥ 0.05/)).toBeInTheDocument();
    // The job read exactly the first two groups.
    expect(runs[0]?.analysis.input).toMatchObject({ kind: 'table', table: tableId });
    expect(
      runs[0]?.analysis.input.kind === 'table' && runs[0].analysis.input.dataSets,
    ).toHaveLength(2);
    const nav = within(screen.getByRole('navigation', { name: 'Project' }));
    expect(nav.getByRole('button', { name: 'Unpaired t test of Viability' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('recomputes after the data change, never showing the old result as current', async () => {
    let release: (() => void) | undefined;
    render(<App />);
    analyze(/t test/);
    await screen.findByText(/P = 0\.0021/);
    answer = (job) =>
      new Promise((resolve) => {
        release = () => {
          resolve(tResult(job) as unknown as Json);
        };
      });
    const t = project(store.getState()).tables.get(tableId);
    const [wt] = t?.dataSets ?? [];
    const [r0] = t?.rows ?? [];
    act(() => {
      store.edit({
        op: 'setCells',
        table: tableId,
        cells: [{ dataSet: wt?.id ?? tableId, subcolumn: 0, row: r0?.id ?? tableId, value: 9 }],
      });
    });
    await screen.findByText(/Calculating…|Updating…/);
    expect(screen.queryByText(/P = 0\.0021/)).not.toBeInTheDocument();
    act(() => {
      release?.();
    });
    await screen.findByText(
      /There is no evidence that the means of WT and KO differ \(P = 0\.3000\)/,
    );
  });

  it('says why an analysis can’t run instead of running it', async () => {
    render(<App />);
    analyze(/t test/, ['WT', 'KO', 'Het']);
    await screen.findByText(
      'A t test compares two groups; this one has 3. Choose two, or use one-way ANOVA.',
    );
    expect(runs).toHaveLength(0);
  });

  it('shows an error with a way to run again, and stops a run on request', async () => {
    answer = () => Promise.reject(new Error('Each group needs at least two values for a t test.'));
    render(<App />);
    analyze(/t test/);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Each group needs at least two values for a t test.',
    );
    answer = () => new Promise(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await screen.findByText(/Stopped. Run it again/);
  });

  it('shows descriptive statistics as a table of groups', async () => {
    const r: DescriptiveResult = {
      groups: [
        {
          id: 'a',
          title: 'WT',
          from: 'values',
          n: 3,
          dropped: { empty: 0, excluded: 1 },
          min: 1,
          q1: 1,
          median: 2,
          q3: 3,
          max: 3,
          range: 2,
          mean: 2,
          sd: 1,
          sem: 0.5774,
          ciLower: -0.4841,
          ciUpper: 4.484,
          cv: 50,
          geomean: 1.817,
          sum: 6,
        },
        {
          id: 'b',
          title: 'KO',
          from: 'values',
          n: 1,
          dropped: null,
          min: 4,
          q1: 4,
          median: 4,
          q3: 4,
          max: 4,
          range: 0,
          mean: 4,
          sd: null,
          sem: null,
          ciLower: null,
          ciUpper: null,
          cv: null,
          geomean: 4,
          sum: 4,
        },
      ],
      warnings: [],
    };
    answer = () => Promise.resolve(r as unknown as Json);
    render(<App />);
    analyze(/Descriptive statistics/);
    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['', 'WT', 'KO']);
    expect(
      within(table).getByRole('rowheader', { name: 'Number of values' }).closest('tr'),
    ).toHaveTextContent('3 (1 excluded left out)1');
    expect(
      within(table).getByRole('rowheader', { name: 'Std. deviation' }).closest('tr'),
    ).toHaveTextContent('1—');
    expect(
      within(table).getByRole('rowheader', { name: 'Coefficient of variation' }).closest('tr'),
    ).toHaveTextContent('50%—');
  });

  it('keeps the analysis linked: its table shows it, and it opens its table', async () => {
    render(<App />);
    analyze(/t test/);
    await screen.findByText(/P = 0\.0021/);
    fireEvent.click(screen.getByRole('button', { name: /Data: Viability/ }));
    // The table's "Used by" chip, not the navigator entry.
    const usedBy = (await screen.findByText(/Used by/)).closest('p');
    fireEvent.click(
      within(usedBy ?? document.body).getByRole('button', { name: 'Unpaired t test of Viability' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Unpaired t test of Viability',
      );
    });
  });
});
