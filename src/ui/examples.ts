/**
 * "Try an example": a small project with made-up numbers, so a first-time
 * user sees filled tables before typing anything — and what they turn
 * into: a one-way ANOVA with Tukey's comparisons and its bar graph with
 * brackets, a two-way ANOVA and its grouped bars (#33), an XY table
 * (Anscombe's quartet dataset I, #91) with its linear regression and
 * Pearson correlation — a real dataset, not invented, so its reference
 * slope (0.500), intercept (3.000) and r (0.816) are independently
 * published and let a user sanity-check the app's numbers — and a growth
 * curve fit (#94) on an invented sigmoidal time course. No graph is
 * attached to either XY table: XY graphs aren't supported yet (#87). The
 * titles say which tables' data are invented.
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
import { type Table, createColumnTable, createGroupedTable, createXyTable } from '@/model/table';

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
  const anscombe = createXyTable({
    title: "Anscombe's quartet I",
    xTitle: 'X',
    groups: ['Y'],
    rows: 11,
  });
  // dataSets[0] is the shared X column; the rest (just one, here) are Y data sets.
  const anscombeYs = anscombe.dataSets.slice(1).map((d) => d.id);
  const growthCurve = createXyTable({
    title: 'Bacterial growth (example data)',
    xTitle: 'Time (h)',
    groups: ['OD600'],
    rows: 13,
    format: { kind: 'replicates', count: 3 },
  });
  const growthCurveYs = growthCurve.dataSets.slice(1).map((d) => d.id);
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
    { op: 'addTable', table: anscombe },
    fill(anscombe, [
      [[10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]],
      [[8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]],
    ]),
    { op: 'addTable', table: growthCurve },
    fill(growthCurve, [
      [[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]],
      [
        [
          -0.0065, 0.0043, 0.0784, 0.8313, 1.0168, 0.9954, 0.9836, 1.0142, 1.0149, 0.9976, 1.0179,
          0.9585, 1.0034,
        ],
        [
          0.011, 0.0062, 0.0637, 0.8463, 0.9589, 0.9822, 0.9589, 0.9946, 0.9718, 1.0093, 1.0056,
          1.0238, 1.0184,
        ],
        [
          -0.0135, 0.0235, 0.0843, 0.8199, 0.9835, 1.0004, 0.9967, 0.9707, 1.0093, 1.01, 1.0202,
          0.9855, 0.9666,
        ],
      ],
    ]),
  ];
  const anova = newId('a');
  const twoWay = newId('a');
  const linReg = newId('a');
  const pearson = newId('a');
  const growthFit = newId('a');
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
      op: 'addAnalysis',
      analysis: {
        id: linReg,
        title: "Linear regression of Anscombe's quartet I",
        kind: 'linear-regression',
        options: DEFAULT_OPTIONS['linear-regression'],
        input: { kind: 'table', table: anscombe.id, dataSets: anscombeYs },
      },
    },
    {
      op: 'addAnalysis',
      analysis: {
        id: pearson,
        title: "Pearson correlation of Anscombe's quartet I",
        kind: 'correlation',
        options: DEFAULT_OPTIONS.correlation,
        input: { kind: 'table', table: anscombe.id, dataSets: anscombeYs },
      },
    },
    {
      op: 'addAnalysis',
      analysis: {
        id: growthFit,
        title: 'Growth curve of Bacterial growth (example data)',
        kind: 'growth-curve',
        options: DEFAULT_OPTIONS['growth-curve'],
        input: { kind: 'table', table: growthCurve.id, dataSets: growthCurveYs },
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
