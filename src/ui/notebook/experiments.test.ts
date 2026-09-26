import { describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import type { Id } from '@/model/ids';
import { type Analysis, DEFAULT_OPTIONS, GRAPH_DEFAULTS, createProject } from '@/model/project';
import { createColumnTable } from '@/model/table';

import { experimentOf, partsOf, rootTable, sectionsOf, summaryLine } from './experiments';

const a = createColumnTable({ title: 'Viability', groups: ['WT', 'KO'], rows: 2 });
const b = createColumnTable({ title: 'Growth', groups: ['WT', 'KO'], rows: 2 });

function analysisOf(id: string, table: typeof a, title: string): Analysis {
  return {
    id: id as Id,
    title,
    kind: 't-test',
    options: DEFAULT_OPTIONS['t-test'],
    input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
  };
}

function project() {
  let p = applyEdit(createProject('P'), { op: 'addTable', table: a });
  p = applyEdit(p, { op: 'addTable', table: b });
  p = applyEdit(p, { op: 'addAnalysis', analysis: analysisOf('t1', a, 't test of Viability') });
  p = applyEdit(p, { op: 'addAnalysis', analysis: analysisOf('t2', b, 't test of Growth') });
  p = applyEdit(p, {
    op: 'addAnalysis',
    analysis: {
      id: 'd1' as Id,
      title: 'Descriptive statistics of Viability',
      kind: 'descriptive',
      options: DEFAULT_OPTIONS.descriptive,
      input: { kind: 'table', table: a.id, dataSets: a.dataSets.map((d) => d.id) },
    },
  });
  p = applyEdit(p, {
    op: 'addGraph',
    graph: {
      ...GRAPH_DEFAULTS,
      id: 'g1' as Id,
      title: 'Viability graph',
      source: { kind: 'table', table: a.id },
      analyses: ['t1' as Id],
    },
  });
  return p;
}

describe('experiments', () => {
  it('finds the table everything belongs to', () => {
    const p = project();
    expect(rootTable(p, 't1' as Id)).toBe(a.id);
    expect(rootTable(p, 'g1' as Id)).toBe(a.id);
    expect(rootTable(p, b.id)).toBe(b.id);
    expect(rootTable(p, 'nothing' as Id)).toBeNull();
    expect(experimentOf(p, { kind: 'analysis', id: 't2' as Id })).toBe(b.id);
    expect(experimentOf(p, { kind: 'home' })).toBeNull();
  });

  it('lists an experiment’s parts in project order, data first', () => {
    const p = project();
    expect(partsOf(p, a.id).analyses.map((x) => x.id)).toEqual(['t1', 'd1']);
    expect(partsOf(p, b.id).graphs).toEqual([]);
    expect(sectionsOf(p, a.id).map((s) => [s.kind, s.title])).toEqual([
      ['table', 'Data'],
      ['analysis', 't test of Viability'],
      ['analysis', 'Descriptive statistics of Viability'],
      ['graph', 'Viability graph'],
    ]);
  });

  it('says in a line what each experiment holds', () => {
    const p = project();
    expect(summaryLine(p, a.id)).toBe('2 analyses · 1 graph');
    expect(summaryLine(p, b.id)).toBe('Unpaired t test');
    const empty = applyEdit(createProject('P'), { op: 'addTable', table: a });
    expect(summaryLine(empty, a.id)).toBe('No analysis yet');
  });
});
