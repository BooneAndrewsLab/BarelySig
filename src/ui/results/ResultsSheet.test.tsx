// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DescriptiveResult } from '@/analyses/descriptive/types';
import type { KruskalWallisResult } from '@/analyses/kruskal/types';
import type { OneWayResult } from '@/analyses/oneway/types';
import type { MannWhitneyResult, WilcoxonResult } from '@/analyses/ranktest/types';
import type { TTestResult } from '@/analyses/ttest/types';
import type { TwoWayResult } from '@/analyses/twoway/types';
import { applyEdit } from '@/model/edits';
import type { Json } from '@/model/json';
import { createProject } from '@/model/project';
import type { Job } from '@/model/recompute';
import { type Table, createColumnTable, createGroupedTable } from '@/model/table';

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
    // The normality tests added alongside may run; the t test must not.
    expect(runs.filter((j) => j.analysis.kind === 't-test')).toHaveLength(0);
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

  it('runs a Mann-Whitney test, with its exact P, U, medians and the achieved CI level', async () => {
    const r: MannWhitneyResult = {
      test: 'mann-whitney',
      tails: 'two',
      a: { id: 'a', title: 'WT', median: 2 },
      b: { id: 'b', title: 'KO', median: 5 },
      exact: true,
      pTwo: 0.1,
      pOne: 0.05,
      p: 0.1,
      hodgesLehmann: 3,
      ci: { lower: 1, upper: 5, level: 0.9 },
      dropped: { a: null, b: null, rows: null },
      warnings: [],
      u: 0,
      nA: 3,
      nB: 3,
      rankSumA: 6,
      rankSumB: 15,
      meanRankA: 2,
      meanRankB: 5,
      difference: 3,
    };
    answer = () => Promise.resolve(r as unknown as Json);
    render(<App />);
    analyze(/Mann-Whitney/);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mann-Whitney test of Viability' }),
    ).toBeInTheDocument();
    await screen.findByText(
      /^There is no evidence that values in WT and KO differ \(P = 0\.1000\)/,
    );
    expect(
      screen.getByText(/can’t give P < 0\.05 however different the groups are/),
    ).toBeInTheDocument();
    const table = screen.getByRole('table');
    const row = (label: string) =>
      within(table).getByRole('rowheader', { name: label }).closest('tr');
    expect(row('Exact or approximate P value?')).toHaveTextContent('Exact');
    expect(row('Mann-Whitney U')).toHaveTextContent('0');
    expect(row('Difference: actual (KO − WT)')).toHaveTextContent('3');
    expect(
      row('90.00% CI of difference (the widest possible with so few values)'),
    ).toHaveTextContent('1 to 5');
  });

  it('runs a Wilcoxon test when paired, saying how zero differences were handled', async () => {
    const r: WilcoxonResult = {
      test: 'wilcoxon',
      tails: 'two',
      a: { id: 'a', title: 'WT', median: 2 },
      b: { id: 'b', title: 'KO', median: 5 },
      exact: true,
      pTwo: 0.03125,
      pOne: 0.015625,
      p: 0.03125,
      hodgesLehmann: 3,
      ci: { lower: 1, upper: 5, level: 0.9688 },
      dropped: { a: null, b: null, rows: 1 },
      warnings: [],
      zeros: 'pratt',
      w: 21,
      sumPositive: 21,
      sumNegative: -0,
      pairs: 7,
      zeroPairs: 1,
      medianDifference: 3,
      pairing: { r: 0.8, p: 0.02 },
    };
    answer = (job) => {
      expect(job.analysis).toMatchObject({ options: { paired: true, zeros: 'pratt' } });
      return Promise.resolve(r as unknown as Json);
    };
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze…/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Mann-Whitney/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /^Paired/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /Pratt/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Wilcoxon test of Viability' }),
    ).toBeInTheDocument();
    await screen.findByText(
      /^KO tends to be higher than WT within the same subjects \(P = 0\.0313\)/,
    );
    expect(screen.getByText(/counted for neither side \(Pratt’s method\)/)).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('rowheader', { name: 'Sum of signed ranks (W)' }).closest('tr'),
    ).toHaveTextContent('21');
  });

  it('runs a one-way ANOVA with Dunnett’s comparisons against a chosen control', async () => {
    const g = (id: string, title: string, mean: number) => ({
      id,
      title,
      n: 3,
      mean,
      sd: 1,
      median: mean,
      dropped: null,
    });
    const r: OneWayResult = {
      from: 'values',
      welch: false,
      groups: [g('a', 'WT', 2), g('b', 'KO', 5), g('c', 'Het', 2.5)],
      anova: {
        ssBetween: 15.5,
        ssWithin: 6,
        ssTotal: 21.5,
        dfBetween: 2,
        dfWithin: 6,
        dfTotal: 8,
        msBetween: 7.75,
        msWithin: 1,
        f: 7.75,
        p: 0.0217,
        rSquared: 0.7209,
      },
      bartlett: null,
      brownForsythe: { f: 0.2, dfn: 2, dfd: 6, p: 0.82 },
      welchAnova: null,
      brownForsytheAnova: null,
      comparisons: { kind: 'control', control: 'a' as never, test: 'dunnett' },
      pairs: [
        {
          a: { id: 'a', title: 'WT' },
          b: { id: 'b', title: 'KO' },
          diff: -3,
          se: 0.8165,
          df: 6,
          statistic: 3.674,
          ciLower: -5.2,
          ciUpper: -0.8,
          p: 0.0151,
        },
        {
          a: { id: 'a', title: 'WT' },
          b: { id: 'c', title: 'Het' },
          diff: -0.5,
          se: 0.8165,
          df: 6,
          statistic: 0.6124,
          ciLower: -2.7,
          ciUpper: 1.7,
          p: 0.7751,
        },
      ],
      warnings: [],
    };
    const tbl = project(store.getState()).tables.get(tableId);
    const het = tbl?.dataSets[2];
    if (!tbl || !het) throw new Error('unreachable');
    act(() => {
      store.edit({
        op: 'setCells',
        table: tableId,
        cells: tbl.rows.map((row, i) => ({
          dataSet: het.id,
          subcolumn: 0,
          row: row.id,
          value: i + 2,
        })),
      });
    });
    let asked: Job | undefined;
    answer = (job) => {
      if (job.analysis.kind === 'one-way-anova') asked = job;
      return Promise.resolve(r as unknown as Json);
    };
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze…/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /One-way ANOVA/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /with a control group/ }));
    expect(within(dialog).getByRole('combobox', { name: 'Multiple comparisons test' })).toHaveValue(
      'dunnett',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    await screen.findByText(
      /^The means of the 3 groups are not all the same \(P = 0\.0217\).* Dunnett’s comparisons: WT and KO \(P = 0\.0151\) differ; the other pair shows no evidence of a difference\.$/,
    );
    const t = project(store.getState()).tables.get(tableId);
    expect(asked?.analysis).toMatchObject({
      kind: 'one-way-anova',
      options: {
        welch: false,
        comparisons: { kind: 'control', control: t?.dataSets[0]?.id, test: 'dunnett' },
      },
    });
    const mc = screen.getByRole('table', { name: 'Multiple comparisons' });
    expect(
      within(mc).getByRole('rowheader', { name: 'WT vs. KO' }).closest('tr'),
    ).toHaveTextContent('WT vs. KO-3-5.2 to -0.8Yes*0.0151');
    expect(
      within(screen.getByRole('table', { name: 'ANOVA table' }))
        .getByRole('rowheader', { name: 'Treatment (between columns)' })
        .closest('tr'),
    ).toHaveTextContent('F (2, 6) = 7.75P = 0.0217');
  });

  it('runs a Kruskal-Wallis test with Dunn’s comparisons, capped P shown as Prism does', async () => {
    const r: KruskalWallisResult = {
      groups: [
        { id: 'a', title: 'WT', n: 3, median: 2, rankSum: 7, meanRank: 2.333, dropped: null },
        { id: 'b', title: 'KO', n: 3, median: 5, rankSum: 14, meanRank: 4.667, dropped: null },
      ],
      h: 3.857,
      df: 1,
      p: 0.0495,
      comparisons: { kind: 'all' },
      corrected: true,
      pairs: [
        {
          a: { id: 'a', title: 'WT' },
          b: { id: 'b', title: 'KO' },
          diff: -2.333,
          z: 1.964,
          pUnadjusted: 0.0495,
          p: 1,
        },
      ],
      warnings: [],
    };
    answer = () => Promise.resolve(r as unknown as Json);
    render(<App />);
    analyze(/Kruskal-Wallis/, ['WT', 'KO']);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Kruskal-Wallis test of Viability' }),
    ).toBeInTheDocument();
    await screen.findByText(/^The 2 groups don’t all have the same distribution \(P = 0\.0495\)/);
    const mc = screen.getByRole('table', { name: 'Multiple comparisons' });
    expect(
      within(mc).getByRole('rowheader', { name: 'WT vs. KO' }).closest('tr'),
    ).toHaveTextContent('WT vs. KO-2.333Nons> 0.9999');
  });

  it('adds normality tests alongside a t test by default, in the same undo step', async () => {
    render(<App />);
    analyze(/t test/);
    await screen.findByText(/P = 0\.0021/);
    const all = () => [...project(store.getState()).analyses.values()].map((a) => a.kind);
    expect(all()).toEqual(['t-test', 'normality']);
    expect(
      project(store.getState()).analyses.get(runs[0]?.analysis.id ?? ('' as never))?.kind,
    ).toBe('t-test');
    const nav = within(screen.getByRole('navigation', { name: 'Project' }));
    expect(nav.getByRole('button', { name: 'Normality tests of Viability' })).toBeInTheDocument();
    act(() => {
      store.undo();
    });
    expect(all()).toEqual([]);
  });

  it('adds only the test when the normality box is unticked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze…/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /one-way ANOVA/i }));
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: /Also test each group for normality/ }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    expect([...project(store.getState()).analyses.values()].map((a) => a.kind)).toEqual([
      'one-way-anova',
    ]);
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

describe('two-way ANOVA sheet', () => {
  it('reads the interaction first and lists comparisons per row', async () => {
    const t = createGroupedTable({
      title: 'Growth',
      rowTitles: ['Day 1', 'Day 2'],
      groups: ['WT', 'KO'],
      format: { kind: 'replicates', count: 2 },
    });
    let p = applyEdit(createProject('P'), { op: 'addTable', table: t });
    p = applyEdit(p, {
      op: 'setCells',
      table: t.id,
      cells: t.dataSets.flatMap((d, j) =>
        t.rows.flatMap((row, i) =>
          [0, 1].map((s) => ({ dataSet: d.id, subcolumn: s, row: row.id, value: i + j + s })),
        ),
      ),
    });
    act(() => {
      store.load(p);
    });
    const term = (pv: number) => ({ ss: 1, df: 1, ms: 1, f: 10, p: pv, percent: 20 });
    const r: TwoWayResult = {
      from: 'values',
      model: 'full',
      why: null,
      rows: [
        { id: 'r1', title: 'Day 1' },
        { id: 'r2', title: 'Day 2' },
      ],
      columns: [
        { id: 'c1', title: 'WT' },
        { id: 'c2', title: 'KO' },
      ],
      nTotal: 8,
      interaction: term(0.003),
      row: term(0.2),
      column: term(0.00001),
      residual: { ss: 0.4, df: 4, ms: 0.1 },
      total: { ss: 3.4, df: 7 },
      cells: [
        [
          { n: 2, mean: 0.5, sd: 0.7 },
          { n: 2, mean: 1.5, sd: 0.7 },
        ],
        [
          { n: 2, mean: 1.5, sd: 0.7 },
          { n: 2, mean: 2.5, sd: 0.7 },
        ],
      ],
      options: { family: 'within-rows', comparisons: { kind: 'all', test: 'tukey' } },
      families: [
        {
          label: 'Day 1',
          pairs: [
            {
              a: { id: 'c1', title: 'WT' },
              b: { id: 'c2', title: 'KO' },
              diff: -1,
              se: 0.3,
              df: 4,
              statistic: 4.7,
              ciLower: -1.8,
              ciUpper: -0.2,
              p: 0.02,
            },
          ],
        },
      ],
      comparisonsNote: null,
      emptyRows: 0,
      droppedValues: 0,
      warnings: [],
    };
    setResults(
      new ResultsBridge(store, {
        debounceMs: 0,
        runner: () => Promise.resolve(r as unknown as Json),
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze…/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('radio', { name: /^t test/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Two-way ANOVA/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    await screen.findByText(
      /^How the data sets differ depends on the row \(interaction P = 0\.0030\)/,
    );
    expect(
      within(screen.getByRole('table', { name: 'Source of variation' }))
        .getByRole('rowheader', { name: 'Interaction' })
        .closest('tr'),
    ).toHaveTextContent('Interaction200.0030**Yes');
    expect(
      within(screen.getByRole('table', { name: 'Day 1' }))
        .getByRole('rowheader', { name: 'WT vs. KO' })
        .closest('tr'),
    ).toHaveTextContent('WT vs. KO-1-1.8 to -0.2Yes*0.0200');
  });
});
