import { describe, expect, it } from 'vitest';

import { readBsig, writeBsig } from '@/io/bsig';
import { applyEdit } from '@/model/edits';
import { asId } from '@/model/ids';
import type { Json } from '@/model/json';
import { GRAPH_DEFAULTS, type Graph, type Project, createProject } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import { createColumnTable } from '@/model/table';

import {
  type GraphInput,
  graphInput,
  graphOfSummary,
  summaryAnalysis,
  summaryId,
  withGraphSummaries,
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
