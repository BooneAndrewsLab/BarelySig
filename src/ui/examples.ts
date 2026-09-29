/**
 * "Try an example": a small project with made-up numbers, so a first-time
 * user sees filled tables before typing anything — and what they turn
 * into: a one-way ANOVA with Tukey's comparisons and its bar graph with
 * brackets, a two-way ANOVA and its grouped bars (#33), an XY table
 * (Anscombe's quartet dataset I, #91) with its linear regression and
 * Pearson correlation — a real dataset, not invented, so its reference
 * slope (0.500), intercept (3.000) and r (0.816) are independently
 * published and let a user sanity-check the app's numbers — and a growth
 * curve fit (#94) on an invented sigmoidal time course, each plotted as
 * an XY scatter with its fitted line and 95% confidence band. The
 * titles say which tables' data are invented.
 *
 * The front page also offers one example per table type
 * (`exampleProject(type)`): just that type's tables, analyses and graph,
 * so each type's description can link to a project showing what it is for.
 */
import { type Edit, applyEdit } from '@/model/edits';
import type { Cell } from '@/model/missing';
import { newId } from '@/model/ids';
import {
  DEFAULT_OPTIONS,
  GRAPH_DEFAULTS,
  XY_DEFAULT,
  GROUPED_DEFAULT,
  NESTED_DEFAULT,
  type Project,
  createProject,
} from '@/model/project';
import {
  type Table,
  type TableType,
  createColumnTable,
  createContingencyTable,
  createGroupedTable,
  createNestedTable,
  createXyTable,
  emptyDataSet,
  newRows,
} from '@/model/table';

import { tableTypeInfo } from './formats';

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

const columnExample = (): Edit[] => {
  const viability = createColumnTable({
    title: 'Cell viability (example data)',
    groups: ['Vehicle', 'Drug 1 µM', 'Drug 10 µM'],
    rows: 6,
  });
  const anova = newId('a');
  return [
    { op: 'addTable', table: { ...viability, valueTitle: 'Viability', unit: '%' } },
    fill(viability, [
      [[98.2, 101.5, 99.1, 97.8, 102.3, 100.4]],
      [[91.7, 88.4, 93.0, 90.2, 86.9, null]],
      [[62.3, 58.1, 65.7, 60.9, 55.4, 63.2]],
    ]),
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
      op: 'addGraph',
      graph: {
        id: newId('g'),
        title: 'Cell viability (example data)',
        source: { kind: 'table', table: viability.id },
        analyses: [anova],
        ...GRAPH_DEFAULTS,
      },
    },
  ];
};

const groupedExample = (): Edit[] => {
  const growth = createGroupedTable({
    title: 'Growth by genotype (example data)',
    rowTitles: ['Wild type', 'Knockout'],
    groups: ['Untreated', 'Treated'],
    format: { kind: 'replicates', count: 3 },
  });
  const twoWay = newId('a');
  return [
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
        title: 'Growth by genotype (example data)',
        source: { kind: 'table', table: growth.id },
        analyses: [twoWay],
        ...GRAPH_DEFAULTS,
        plot: GROUPED_DEFAULT,
      },
    },
  ];
};

const nestedExample = (): Edit[] => {
  const base = createNestedTable({
    title: 'Nuclear size (example data)',
    groups: ['Control', 'Treated'],
    replicates: 3,
  });
  const rows = newRows(4);
  const table = {
    ...base,
    rows,
    valueTitle: 'Nuclear area',
    unit: 'µm²',
    dataSets: base.dataSets.map((d) => emptyDataSet(d.id, d.title, rows.length, base.format)),
  };
  const nestedT = newId('a');
  return [
    { op: 'addTable', table },
    // values[group][replicate][row]: four cells measured in each of three experiments
    fill(table, [
      [
        [61.2, 58.4, 64.0, 60.1],
        [66.5, 63.8, 69.2, 65.0],
        [59.3, 62.7, 57.9, 61.4],
      ],
      [
        [72.8, 75.1, 70.3, 74.6],
        [78.4, 81.0, 76.2, 79.5],
        [70.9, 73.6, 69.8, 72.2],
      ],
    ]),
    {
      op: 'addAnalysis',
      analysis: {
        id: nestedT,
        title: 'Nested t test of Nuclear size (example data)',
        kind: 'nested-t-test',
        options: DEFAULT_OPTIONS['nested-t-test'],
        input: { kind: 'table', table: table.id, dataSets: table.dataSets.map((d) => d.id) },
      },
    },
    {
      op: 'addGraph',
      graph: {
        id: newId('g'),
        title: 'Nuclear size (example data)',
        source: { kind: 'table', table: table.id },
        analyses: [nestedT],
        ...GRAPH_DEFAULTS,
        plot: NESTED_DEFAULT,
      },
    },
  ];
};

const contingencyExample = (): Edit[] => {
  const table = createContingencyTable({
    title: 'Response by treatment (example data)',
    rowTitles: ['Responded', 'Did not respond'],
    groups: ['Drug', 'Placebo'],
  });
  const ids = table.dataSets.map((d) => d.id);
  return [
    { op: 'addTable', table },
    fill(table, [[[18, 7]], [[9, 16]]]),
    {
      op: 'addAnalysis',
      analysis: {
        id: newId('a'),
        title: 'Chi-square test of Response by treatment (example data)',
        kind: 'contingency-chi-square',
        options: DEFAULT_OPTIONS['contingency-chi-square'],
        input: { kind: 'table', table: table.id, dataSets: ids },
      },
    },
    {
      op: 'addAnalysis',
      analysis: {
        id: newId('a'),
        title: 'Fisher’s exact test of Response by treatment (example data)',
        kind: 'contingency-fisher',
        options: DEFAULT_OPTIONS['contingency-fisher'],
        input: { kind: 'table', table: table.id, dataSets: ids },
      },
    },
  ];
};

const xyExample = (): Edit[] => {
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
  const regression = newId('a');
  const growthFit = newId('a');
  return [
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
    {
      op: 'addAnalysis',
      analysis: {
        id: regression,
        title: "Linear regression of Anscombe's quartet I",
        kind: 'linear-regression',
        options: DEFAULT_OPTIONS['linear-regression'],
        input: { kind: 'table', table: anscombe.id, dataSets: anscombeYs },
      },
    },
    {
      op: 'addAnalysis',
      analysis: {
        id: newId('a'),
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
        title: "Anscombe's quartet I",
        source: { kind: 'table', table: anscombe.id },
        analyses: [regression],
        ...GRAPH_DEFAULTS,
        plot: { ...XY_DEFAULT, fit: true, band: 'confidence' },
      },
    },
    {
      op: 'addGraph',
      graph: {
        id: newId('g'),
        title: 'Bacterial growth (example data)',
        source: { kind: 'table', table: growthCurve.id },
        analyses: [growthFit],
        ...GRAPH_DEFAULTS,
        plot: { ...XY_DEFAULT, fit: true, band: 'confidence' },
      },
    },
  ];
};

const EXAMPLES: Readonly<Record<TableType, () => Edit[]>> = {
  column: columnExample,
  grouped: groupedExample,
  nested: nestedExample,
  contingency: contingencyExample,
  xy: xyExample,
};

/** The whole-app tour (no type), or the example for one table type. */
export function exampleProject(type?: TableType): Project {
  const edits = type
    ? EXAMPLES[type]()
    : [columnExample, groupedExample, xyExample].flatMap((f) => f());
  const name = type ? `${tableTypeInfo(type).name} table example` : 'Example project';
  return edits.reduce(applyEdit, { ...createProject(name) });
}
