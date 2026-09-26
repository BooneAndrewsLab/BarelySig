import { describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import type { Id } from '@/model/ids';
import {
  type Analysis,
  type AnalysisSpec,
  DEFAULT_OPTIONS,
  GRAPH_DEFAULTS,
  type Graph,
  type GraphPlot,
  type Project,
  WHISKERS,
  createProject,
} from '@/model/project';
import { type Table, createColumnTable, createGroupedTable } from '@/model/table';

import { type Note, analysisNotes, dataNotes, graphNotes } from './notes';

const column = createColumnTable({ title: 'Viability', groups: ['Vehicle', 'Drug'], rows: 3 });
const [vehicle] = column.dataSets;

function withAnalysis(spec: AnalysisSpec): { project: Project; analysis: Analysis } {
  const analysis = {
    ...spec,
    id: 'a1' as Id,
    title: 'Test of Viability',
    input: { kind: 'table', table: column.id, dataSets: column.dataSets.map((d) => d.id) },
  } as Analysis;
  let p = applyEdit(createProject('P'), { op: 'addTable', table: column });
  p = applyEdit(p, { op: 'addAnalysis', analysis });
  return { project: p, analysis };
}

const text = (notes: readonly Note[]) =>
  notes.flatMap((n) => [...(n.title ? [n.title] : []), ...n.text]).join(' ');

const SPECS: readonly AnalysisSpec[] = [
  { kind: 'descriptive', options: DEFAULT_OPTIONS.descriptive },
  { kind: 't-test', options: DEFAULT_OPTIONS['t-test'] },
  { kind: 't-test', options: { paired: true, welch: false, tails: 'one' } },
  { kind: 't-test', options: { paired: false, welch: true, tails: 'two' } },
  { kind: 'rank-test', options: DEFAULT_OPTIONS['rank-test'] },
  { kind: 'rank-test', options: { paired: true, tails: 'two', zeros: 'pratt' } },
  { kind: 'one-way-anova', options: DEFAULT_OPTIONS['one-way-anova'] },
  {
    kind: 'one-way-anova',
    options: {
      welch: false,
      comparisons: { kind: 'control', control: vehicle?.id ?? ('x' as Id), test: 'dunnett' },
    },
  },
  {
    kind: 'one-way-anova',
    options: { welch: true, comparisons: { kind: 'all', test: 'games-howell' } },
  },
  { kind: 'one-way-anova', options: { welch: false, comparisons: { kind: 'none' } } },
  { kind: 'kruskal-wallis', options: DEFAULT_OPTIONS['kruskal-wallis'] },
  { kind: 'kruskal-wallis', options: { comparisons: { kind: 'all' }, corrected: false } },
  { kind: 'two-way-anova', options: DEFAULT_OPTIONS['two-way-anova'] },
  { kind: 'normality', options: DEFAULT_OPTIONS.normality },
];

describe('data notes', () => {
  it('says replicates are values, empty cells are not zeros, and paired tests pair by row', () => {
    const t = text(dataNotes(column));
    expect(t).toContain('Replicates, not means');
    expect(t).toContain('An empty cell stays empty: it is not a zero.');
    expect(t).toContain('paired tests pair values by row');
  });

  it('says what summary data can’t do, with and without n', () => {
    const withN: Table = { ...column, format: { kind: 'summary', stats: 'mean-sem-n' } };
    expect(text(dataNotes(withN))).toContain(
      'Rank tests and paired tests need the individual values',
    );
    const noN: Table = { ...column, format: { kind: 'summary', stats: 'mean-lower-upper' } };
    expect(text(dataNotes(noN))).toContain('Without n these can be graphed but not tested');
  });

  it('explains a Grouped table’s replicate columns', () => {
    const g = createGroupedTable({
      title: 'Growth',
      rowTitles: ['WT', 'KO'],
      groups: ['Untreated', 'Treated'],
      format: { kind: 'replicates', count: 3 },
    });
    expect(text(dataNotes(g))).toContain('(Y1, Y2…) are its replicates');
  });
});

describe('analysis notes', () => {
  it('has a plain note for every kind of analysis a user can run', () => {
    for (const spec of SPECS) {
      const { project, analysis } = withAnalysis(spec);
      const notes = analysisNotes(project, analysis);
      expect(notes.length, spec.kind).toBeGreaterThan(0);
      expect(notes[0]?.kicker).toBe('What this means');
    }
  });

  it('never states a result: no P value, no verdict', () => {
    for (const spec of SPECS) {
      const { project, analysis } = withAnalysis(spec);
      const t = text(analysisNotes(project, analysis));
      expect(t, spec.kind).not.toMatch(/P [=<>≤≥] ?\d/);
      expect(t, spec.kind).not.toMatch(/\bdiffer(s)? significantly\b/);
    }
  });

  it('says “ns” is not “the same” for every hypothesis test', () => {
    for (const spec of SPECS) {
      if (spec.kind === 'descriptive' || spec.kind === 'normality') continue;
      const { project, analysis } = withAnalysis(spec);
      expect(text(analysisNotes(project, analysis)), spec.kind).toContain(
        '“ns” means no evidence of a difference, not that the groups are the same.',
      );
    }
  });

  it('names the comparisons, the control and how P is adjusted', () => {
    const dunnett = SPECS[7];
    if (!dunnett) throw new Error('unreachable');
    const { project, analysis } = withAnalysis(dunnett);
    expect(text(analysisNotes(project, analysis))).toContain(
      'Dunnett’s test compares each group with the control (Vehicle), not every pair, and adjusts each P for the number of comparisons.',
    );
    const gh = SPECS[8];
    if (!gh) throw new Error('unreachable');
    const w = withAnalysis(gh);
    expect(text(analysisNotes(w.project, w.analysis))).toMatch(
      /Games-Howell’s test compares every pair of groups without assuming the groups have the same SD/,
    );
    const uncorrected = SPECS[11];
    if (!uncorrected) throw new Error('unreachable');
    const k = withAnalysis(uncorrected);
    expect(text(analysisNotes(k.project, k.analysis))).toContain(
      'You chose not to adjust P for the number of comparisons',
    );
  });

  it('warns about one-tailed tests, and about reading normality tests', () => {
    const paired = SPECS[2];
    const normality = SPECS[13];
    if (!paired || !normality) throw new Error('unreachable');
    const p = withAnalysis(paired);
    expect(text(analysisNotes(p.project, p.analysis))).toContain('One-tailed:');
    expect(text(analysisNotes(p.project, p.analysis))).toContain('drops out of the pairing');
    const n = withAnalysis(normality);
    expect(text(analysisNotes(n.project, n.analysis))).toContain('A large P is not proof');
  });
});

describe('graph notes', () => {
  const graphOf = (plot: GraphPlot, analyses: readonly Id[] = []): Graph => ({
    ...GRAPH_DEFAULTS,
    id: 'g1' as Id,
    title: 'Viability',
    source: { kind: 'table', table: column.id },
    analyses,
    plot,
  });
  const project = withAnalysis(SPECS[1] ?? { kind: 'descriptive', options: {} }).project;

  it('says what each kind of error bar shows', () => {
    expect(
      text(graphNotes(project, graphOf({ kind: 'bars', error: 'sd', points: true }))),
    ).toContain('Error bars show the SD');
    expect(
      text(graphNotes(project, graphOf({ kind: 'bars', error: 'sem', points: true }))),
    ).toContain('say which you show');
    expect(
      text(graphNotes(project, graphOf({ kind: 'dots', center: 'mean', error: 'ci95' }))),
    ).toContain('95% CI');
    expect(
      text(graphNotes(project, graphOf({ kind: 'dots', center: 'median', error: 'none' }))),
    ).not.toContain('Error bars');
  });

  it('says where every kind of whisker ends', () => {
    for (const whiskers of WHISKERS) {
      const t = text(graphNotes(project, graphOf({ kind: 'box', whiskers, points: 'none' })));
      expect(t, whiskers).toMatch(/^The box spans the middle half/);
      expect(t, whiskers).toMatch(/Whiskers reach the (smallest|furthest|\d)/);
    }
    expect(
      text(graphNotes(project, graphOf({ kind: 'box', whiskers: 'p2.5-97.5', points: 'none' }))),
    ).toContain('2.5th and 97.5th percentiles');
  });

  it('names the analysis the brackets come from, and the export size', () => {
    const t = text(
      graphNotes(project, graphOf({ kind: 'bars', error: 'sd', points: true }, ['a1' as Id])),
    );
    expect(t).toContain('The brackets come from “Test of Viability”.');
    expect(t).toMatch(/It exports at \d+ × \d+ mm\./);
  });
});
