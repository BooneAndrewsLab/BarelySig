/**
 * "Try an example": a small project with made-up numbers, so a first-time
 * user sees filled tables before typing anything — and what they turn
 * into: a one-way ANOVA with Tukey's comparisons and its bar graph with
 * brackets, a two-way ANOVA and its grouped bars (#33). The titles say the
 * data are invented.
 */
import { type Edit, applyEdit } from '@/model/edits';
import type { Cell } from '@/model/missing';
import { newId } from '@/model/ids';
import {
  DEFAULT_OPTIONS,
  GRAPH_DEFAULTS,
  GROUPED_DEFAULT,
  type Project,
  createProject,
} from '@/model/project';
import { type Table, createColumnTable, createGroupedTable } from '@/model/table';

function fill(table: Table, values: readonly (readonly (readonly Cell[])[])[]): Edit {
  // values[dataSet][subcolumn][row]
  return {
    op: 'setCells',
    table: table.id,
    cells: table.dataSets.flatMap((d, i) =>
      (values[i] ?? []).flatMap((col, s) =>
        col.map((value, r) => ({
          dataSet: d.id,
          subcolumn: s,
          row: table.rows[r]?.id ?? d.id,
          value,
        })),
      ),
    ),
  };
}

export function exampleProject(): Project {
  const viability = createColumnTable({
    title: 'Cell viability (example data)',
    groups: ['Vehicle', 'Drug 1 µM', 'Drug 10 µM'],
    rows: 6,
  });
  const growth = createGroupedTable({
    title: 'Growth by genotype (example data)',
    rowTitles: ['Wild type', 'Knockout'],
    groups: ['Untreated', 'Treated'],
    format: { kind: 'replicates', count: 3 },
  });
  const edits: Edit[] = [
    { op: 'addTable', table: { ...viability, valueTitle: 'Viability', unit: '%' } },
    fill(viability, [
      [[98.2, 101.5, 99.1, 97.8, 102.3, 100.4]],
      [[91.7, 88.4, 93.0, 90.2, 86.9, null]],
      [[62.3, 58.1, 65.7, 60.9, 55.4, 63.2]],
    ]),
    { op: 'addTable', table: { ...growth, valueTitle: 'Colony area', unit: 'mm²' } },
    fill(growth, [
      [
        [12.1, 8.4],
        [11.6, 7.9],
        [12.8, 8.8],
      ],
      [
        [9.3, 3.2],
        [8.7, 2.9],
        [9.9, 3.6],
      ],
    ]),
  ];
  const anova = newId('a');
  const twoWay = newId('a');
  edits.push(
    {
      op: 'addAnalysis',
      analysis: {
        id: anova,
        title: 'One-way ANOVA of Cell viability (example data)',
        kind: 'one-way-anova',
        options: DEFAULT_OPTIONS['one-way-anova'],
        input: {
          kind: 'table',
          table: viability.id,
          dataSets: viability.dataSets.map((d) => d.id),
        },
      },
    },
    {
      op: 'addAnalysis',
      analysis: {
        id: twoWay,
        title: 'Two-way ANOVA of Growth by genotype (example data)',
        kind: 'two-way-anova',
        options: DEFAULT_OPTIONS['two-way-anova'],
        input: { kind: 'table', table: growth.id, dataSets: growth.dataSets.map((d) => d.id) },
      },
    },
    {
      op: 'addGraph',
      graph: {
        id: newId('g'),
        title: 'Cell viability (example data)',
        source: { kind: 'table', table: viability.id },
        analyses: [anova],
        ...GRAPH_DEFAULTS,
      },
    },
    {
      op: 'addGraph',
      graph: {
        id: newId('g'),
        title: 'Growth by genotype (example data)',
        source: { kind: 'table', table: growth.id },
        analyses: [twoWay],
        ...GRAPH_DEFAULTS,
        plot: GROUPED_DEFAULT,
      },
    },
  );
  return edits.reduce(applyEdit, { ...createProject('Example project') });
}
