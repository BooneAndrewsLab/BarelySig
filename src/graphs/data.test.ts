import { describe, expect, it } from 'vitest';

import { readBsig, writeBsig } from '@/io/bsig';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Json } from '@/model/json';
import {
  GRAPH_DEFAULTS,
  GROUPED_DEFAULT,
  type Graph,
  type Project,
  createProject,
} from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import { createColumnTable, createGroupedTable } from '@/model/table';

import {
  type GraphInput,
  bracketChoices,
  graphInput,
  graphOfSummary,
  summaryAnalysis,
  summaryId,
  withBracket,
  withGraphSummaries,
  withPair,
} from './data';

function setup() {
  const t = createColumnTable({ title: 'Viability', groups: ['WT', 'KO', 'Het'], rows: 2 });
  const [wt, ko, het] = t.dataSets;
  const [r0, r1] = t.rows;
  if (!wt || !ko || !het || !r0 || !r1) throw new Error('unreachable');
  let p: Project = applyEdit(createProject('P'), {
    op: 'addTable',
    table: { ...t, valueTitle: 'Viability', unit: '%' },
  });
  p = applyEdit(p, {
    op: 'setCells',
    table: t.id,
    cells: [
      { dataSet: wt.id, subcolumn: 0, row: r0.id, value: 1 },
      { dataSet: wt.id, subcolumn: 0, row: r1.id, value: 3 },
      { dataSet: ko.id, subcolumn: 0, row: r0.id, value: 5 },
    ],
  });
  p = applyEdit(p, {
    op: 'addAnalysis',
    analysis: {
      id: asId('a_t'),
      title: 't',
      kind: 't-test',
      options: { paired: false, welch: false, tails: 'two' },
      input: { kind: 'table', table: t.id, dataSets: [wt.id, ko.id] },
    },
  });
  const graph: Graph = {
    id: asId('g_1'),
    title: 'Viability',
    source: { kind: 'table', table: t.id },
    analyses: [asId('a_t')],
    ...GRAPH_DEFAULTS,
  };
  p = applyEdit(p, { op: 'addGraph', graph });
  return { p, graph, t, wt, ko, het };
}

const bracketsOf = (r: GraphInput) => (r.ok ? r.input.brackets : null);

const tResult = (p: number, a: string, b: string): ResultEntry => ({
  inputHash: 'h',
  ok: true,
  value: { p, a: { id: a }, b: { id: b } } as unknown as Json,
});

describe('graph data', () => {
  it('names summaries after their graph', () => {
    expect(summaryId(asId('g_1'))).toBe('g_1/summary');
    expect(graphOfSummary(asId('g_1/summary'))).toBe('g_1');
    expect(graphOfSummary(asId('a_1'))).toBeNull();
  });

  it('gives Recompute a descriptive analysis of the plotted data sets for each graph', () => {
    const { p, graph, wt, ko, het } = setup();
    const withSummaries = withGraphSummaries(p);
    expect(withSummaries.analyses.get(summaryId(graph.id))).toEqual(summaryAnalysis(p, graph));
    expect(summaryAnalysis(p, graph)?.input).toMatchObject({ dataSets: [wt.id, ko.id, het.id] });
    expect(p.analyses.has(summaryId(graph.id))).toBe(false);
  });

  it('assembles groups with values, colours and the axis title', () => {
    const { p, graph } = setup();
    const r = graphInput(p, graph, () => undefined);
    if (!r.ok) throw new Error(r.reason);
    expect(r.summaryReady).toBe(false);
    expect(r.input.yTitle).toBe('Viability (%)');
    expect(r.input.groups.map((g) => [g.title, g.values, g.color])).toEqual([
      ['WT', [1, 3], '#0173b2'],
      ['KO', [5], '#de8f05'],
      ['Het', [], '#029e73'],
    ]);
  });

  it('draws a bracket for a current t test, as asterisks or exact P, and can hide ns', () => {
    const { p, graph, wt, ko } = setup();
    const results = (pv: number) => (id: string) =>
      id === 'a_t' ? tResult(pv, wt.id, ko.id) : undefined;
    const ok = graphInput(p, graph, results(0.003));
    expect(ok.ok && ok.input.brackets).toEqual([{ id: 'a_t', from: 0, to: 1, label: '**' }]);
    const exact = graphInput(
      p,
      { ...graph, format: { ...graph.format, bracketLabels: 'exact' } },
      results(0.003),
    );
    expect(exact.ok && exact.input.brackets[0]?.label).toBe('P = 0.0030');
    const ns = { ...graph, format: { ...graph.format, showNs: false } };
    expect(bracketsOf(graphInput(p, ns, results(0.3)))).toEqual([]);
    const hidden = { ...graph, format: { ...graph.format, hiddenBrackets: [asId('a_t')] } };
    expect(bracketsOf(graphInput(p, hidden, results(0.003)))).toEqual([]);
  });

  it('draws a rank test’s bracket like a t test’s, and offers both', () => {
    const { p: base, graph, t, wt, ko } = setup();
    const p = applyEdit(base, {
      op: 'addAnalysis',
      analysis: {
        id: asId('a_r'),
        title: 'Mann-Whitney',
        kind: 'rank-test',
        options: { paired: false, tails: 'two', zeros: 'wilcoxon' },
        input: { kind: 'table', table: t.id, dataSets: [ko.id, wt.id] },
      },
    });
    expect(bracketChoices(p, graph).map((c) => [c.id, c.shown])).toEqual([
      ['a_t', true],
      ['a_r', false],
    ]);
    const shown = withBracket(graph, asId('a_r'), true);
    const r = graphInput(p, shown, (id) =>
      id === 'a_r' ? tResult(0.04, ko.id, wt.id) : undefined,
    );
    expect(r.ok && r.input.brackets).toEqual([{ id: 'a_r', from: 1, to: 0, label: '*' }]);
  });

  it('draws a bracket per post-hoc comparison, each of which can be hidden', () => {
    const { p: base, graph, t, wt, ko, het } = setup();
    const p = applyEdit(base, {
      op: 'addAnalysis',
      analysis: {
        id: asId('a_1w'),
        title: 'ANOVA',
        kind: 'one-way-anova',
        options: { welch: false, comparisons: { kind: 'all', test: 'tukey' } },
        input: { kind: 'table', table: t.id, dataSets: [wt.id, ko.id, het.id] },
      },
    });
    const on = withBracket(graph, asId('a_1w'), true);
    const choice = bracketChoices(p, on).find((c) => c.id === 'a_1w');
    expect(choice?.pairs.map((x) => [x.label, x.shown])).toEqual([
      ['WT vs. KO', true],
      ['WT vs. Het', true],
      ['KO vs. Het', true],
    ]);
    const pair = (a: string, b: string, pv: number) => ({ a: { id: a }, b: { id: b }, p: pv });
    const results = (id: string): ResultEntry | undefined =>
      id === 'a_1w'
        ? {
            inputHash: 'h',
            ok: true,
            value: {
              pairs: [
                pair(wt.id, ko.id, 0.0005),
                pair(wt.id, het.id, 0.3),
                pair(ko.id, het.id, 0.04),
              ],
            } as unknown as Json,
          }
        : undefined;
    const only = { ...on, analyses: [asId('a_1w')] };
    expect(bracketsOf(graphInput(p, only, results))).toEqual([
      { id: `a_1w/${wt.id}/${ko.id}`, from: 0, to: 1, label: '***' },
      { id: `a_1w/${wt.id}/${het.id}`, from: 0, to: 2, label: 'ns' },
      { id: `a_1w/${ko.id}/${het.id}`, from: 1, to: 2, label: '*' },
    ]);
    const hidden = withPair(only, `a_1w/${wt.id}/${het.id}`, false);
    expect(bracketsOf(graphInput(p, hidden, results))?.map((b) => b.label)).toEqual(['***', '*']);
    expect(
      bracketChoices(p, hidden)
        .find((c) => c.id === 'a_1w')
        ?.pairs.map((x) => x.shown),
    ).toEqual([true, false, true]);
  });

  it('shows no bracket while the t test is outdated or for groups not plotted', () => {
    const { p, graph, wt } = setup();
    expect(bracketsOf(graphInput(p, graph, () => undefined))).toEqual([]);
    const only = { ...graph, dataSets: [wt.id] };
    const r = graphInput(p, only, (id) =>
      id === 'a_t' ? tResult(0.001, wt.id, 'ds_elsewhere') : undefined,
    );
    expect(r.ok && r.input.brackets).toEqual([]);
  });

  it('keeps graph summaries when saving results, drops those of graphs gone', () => {
    const { p, graph } = setup();
    const entry: ResultEntry = { inputHash: 'x', ok: true, value: { groups: [], warnings: [] } };
    const results = new Map([
      [summaryId(graph.id), entry],
      [asId('g_gone/summary'), entry],
    ]);
    const back = readBsig(writeBsig({ project: p, results, engine: null, app: '0.5.0' }));
    expect([...back.results.keys()]).toEqual([summaryId(graph.id)]);
  });
});

describe('grouped bar graphs (note 07)', () => {
  function grouped(family: 'within-rows' | 'within-columns' | 'main-rows' = 'within-rows') {
    const t = createGroupedTable({
      title: 'Growth',
      rowTitles: ['Day 1', 'Day 2'],
      groups: ['WT', 'KO'],
      format: { kind: 'replicates', count: 2 },
    });
    const [wt, ko] = t.dataSets;
    const [d1, d2] = t.rows;
    if (!wt || !ko || !d1 || !d2) throw new Error('unreachable');
    let p: Project = applyEdit(createProject('P'), { op: 'addTable', table: t });
    p = applyEdit(p, {
      op: 'setCells',
      table: t.id,
      cells: [
        { dataSet: wt.id, subcolumn: 0, row: d1.id, value: 1 },
        { dataSet: wt.id, subcolumn: 1, row: d1.id, value: 2 },
        { dataSet: ko.id, subcolumn: 0, row: d1.id, value: 4 },
        { dataSet: ko.id, subcolumn: 0, row: d2.id, value: 6 },
      ],
    });
    p = applyEdit(p, {
      op: 'addAnalysis',
      analysis: {
        id: asId('a_2'),
        title: 'Two-way',
        kind: 'two-way-anova',
        options: { family, comparisons: { kind: 'all', test: 'tukey' } },
        input: { kind: 'table', table: t.id, dataSets: [wt.id, ko.id] },
      },
    });
    const graph: Graph = {
      id: asId('g_2'),
      title: 'Growth',
      source: { kind: 'table', table: t.id },
      analyses: [asId('a_2')],
      ...GRAPH_DEFAULTS,
      plot: GROUPED_DEFAULT,
    };
    p = applyEdit(p, { op: 'addGraph', graph });
    return { p, graph, t, wt, ko, d1, d2 };
  }

  it('clusters the cells by row, coloured by data set, with a legend', () => {
    const { p, graph, wt, ko, d1, d2 } = grouped();
    const r = graphInput(p, graph, () => undefined);
    if (!r.ok) throw new Error(r.reason);
    expect(r.input.groups.map((g) => [g.id, g.series, g.title, g.values])).toEqual([
      [`${d1.id}/${wt.id}`, wt.id, 'WT', [1, 2]],
      [`${d1.id}/${ko.id}`, ko.id, 'KO', [4]],
      [`${d2.id}/${wt.id}`, wt.id, 'WT', []],
      [`${d2.id}/${ko.id}`, ko.id, 'KO', [6]],
    ]);
    expect(r.input.clusters).toEqual([
      { title: 'Day 1', size: 2 },
      { title: 'Day 2', size: 2 },
    ]);
    expect(r.input.legend?.entries.map((e) => e.title)).toEqual(['WT', 'KO']);
    expect(r.input.plot).toEqual({ kind: 'bars', error: 'sd', points: true });
  });

  it('clusters by data set when separated, labelling each bar, without a legend', () => {
    const { p, graph } = grouped();
    const g = { ...graph, plot: { ...GROUPED_DEFAULT, arrangement: 'separated' as const } };
    const r = graphInput(p, g, () => undefined);
    if (!r.ok) throw new Error(r.reason);
    expect(r.input.groups.map((x) => x.title)).toEqual(['Day 1', 'Day 2', 'Day 1', 'Day 2']);
    expect(r.input.clusters?.map((c) => c.title)).toEqual(['WT', 'KO']);
    expect(r.input.barLabels).toBe(true);
    expect(r.input.legend).toBeUndefined();
  });

  it('summarises every cell and draws two-way comparisons within rows as brackets', () => {
    const { p, graph, wt, ko, d1, d2 } = grouped();
    expect(summaryAnalysis(p, graph)).toMatchObject({ kind: 'graph-summary' });
    const choice = bracketChoices(p, graph)[0];
    expect(choice?.pairs.map((x) => x.label)).toEqual(['Day 1: WT vs. KO', 'Day 2: WT vs. KO']);
    const value = {
      options: { family: 'within-rows' },
      families: [
        {
          label: 'Day 1',
          level: { id: d1.id, title: 'Day 1' },
          pairs: [{ a: { id: wt.id }, b: { id: ko.id }, p: 0.004 }],
        },
        {
          label: 'Day 2',
          level: { id: d2.id, title: 'Day 2' },
          pairs: [{ a: { id: wt.id }, b: { id: ko.id }, p: 0.3 }],
        },
      ],
    } as unknown as Json;
    const results = new Map<string, ResultEntry>([['a_2', { inputHash: 'h', ok: true, value }]]);
    const r = graphInput(p, graph, (id) => results.get(id));
    if (!r.ok) throw new Error(r.reason);
    expect(r.input.brackets.map((b) => [b.from, b.to, b.label])).toEqual([
      [0, 1, '**'],
      [2, 3, 'ns'],
    ]);
    expect(r.input.brackets[0]?.id).toBe(choice?.pairs[0]?.key);
  });

  it('pairs rows within each data set for within-column comparisons', () => {
    const { p, graph } = grouped('within-columns');
    expect(bracketChoices(p, graph)[0]?.pairs.map((x) => x.label)).toEqual([
      'Day 1: WT vs. Day 2: WT',
      'Day 1: KO vs. Day 2: KO',
    ]);
  });

  it('says main-effect comparisons give no brackets', () => {
    const { p, graph } = grouped('main-rows');
    const c = bracketChoices(p, graph)[0];
    expect(c?.pairs).toEqual([]);
    expect(c?.note).toMatch(/no bar shows/);
  });
});
