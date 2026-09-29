import fc from 'fast-check';

import { type Edit, EditError, applyEdit } from '@/model/edits';
import { type Id, asId, newId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import {
  type Analysis,
  type AnalysisSpec,
  type Comparisons,
  type NestedComparisons,
  type Project,
  REPEATED_TWO_WAY_FAMILIES,
  TWO_WAY_FAMILIES,
  DEFAULT_OPTIONS,
  EQUAL_SD_ALL,
  EQUAL_SD_CONTROL,
  WELCH_ALL,
  WELCH_CONTROL,
  createProject,
  GRAPH_DEFAULTS,
} from '@/model/project';
import {
  type EntryFormat,
  SUMMARY_STATS,
  createColumnTable,
  createContingencyTable,
  createGroupedTable,
  createNestedTable,
  createXyTable,
  subcolumnCount,
} from '@/model/table';

/**
 * fast-check generators for random editing sessions (item 02), as in
 * PlasmidPop: edits are generated as abstract shapes of small integers and
 * only resolved against the project as it stands when they are applied, so
 * any sequence of shapes is valid for any project and shrinking stays
 * meaningful. A resolved edit may still be refused (`EditError`, e.g. a
 * cycle): sessions skip those, and tests check the refusal left the
 * project valid.
 */

/** Cell values, weighted towards the awkward ones. */
export const cellArb: fc.Arbitrary<Cell> = fc.oneof(
  { arbitrary: fc.constant(null), weight: 3 },
  {
    arbitrary: fc.constantFrom(0, -0, 1, -1, 0.1, 1e-300, 5e-324, 1.7976931348623157e308, -2.5e-17),
    weight: 2,
  },
  { arbitrary: fc.integer({ min: -1000, max: 1000 }), weight: 2 },
  { arbitrary: fc.double({ noNaN: true, noDefaultInfinity: true }), weight: 3 },
);

export const formatArb: fc.Arbitrary<EntryFormat> = fc.oneof(
  fc.integer({ min: 1, max: 4 }).map((count): EntryFormat => ({ kind: 'replicates', count })),
  fc.constantFrom(...SUMMARY_STATS).map((stats): EntryFormat => ({ kind: 'summary', stats })),
);

/** A Nested table always has a replicates format: no summary variant (validate.ts). */
export const nestedFormatArb: fc.Arbitrary<EntryFormat> = fc
  .integer({ min: 1, max: 4 })
  .map((count): EntryFormat => ({ kind: 'replicates', count }));

const idx = fc.nat(50);
const small = fc.integer({ min: 0, max: 5 });
const title = fc.string({ maxLength: 6 });
const tails = fc.constantFrom('two' as const, 'one' as const);

const comparisons: fc.Arbitrary<Comparisons> = fc.oneof(
  fc.constant<Comparisons>({ kind: 'none' }),
  fc
    .constantFrom(...EQUAL_SD_ALL, ...WELCH_ALL)
    .map((test): Comparisons => ({ kind: 'all', test })),
  fc
    .record({
      control: fc.string({ minLength: 1, maxLength: 6 }).map(asId),
      test: fc.constantFrom(...EQUAL_SD_CONTROL, ...WELCH_CONTROL),
    })
    .map((c): Comparisons => ({ kind: 'control', control: c.control, test: c.test })),
);

/** The equal-SD-only comparisons of nested one-way ANOVA and repeated-measures ANOVA. */
const nestedComparisonsArb: fc.Arbitrary<NestedComparisons> = fc.oneof(
  fc.constant<NestedComparisons>({ kind: 'none' }),
  fc.constantFrom(...EQUAL_SD_ALL).map((test): NestedComparisons => ({ kind: 'all', test })),
  fc
    .record({
      control: fc.string({ minLength: 1, maxLength: 6 }).map(asId),
      test: fc.constantFrom(...EQUAL_SD_CONTROL),
    })
    .map((c): NestedComparisons => ({ kind: 'control', control: c.control, test: c.test })),
);

/**
 * Every analysis kind with every option it can take (the `.bsig` round
 * trip can only see a field the generator fills). Records are spread into
 * plain objects: fast-check makes them without a prototype.
 */
export const analysisSpec: fc.Arbitrary<AnalysisSpec> = fc.oneof(
  fc.constant<AnalysisSpec>({ kind: 'descriptive', options: DEFAULT_OPTIONS.descriptive }),
  fc.constant<AnalysisSpec>({
    kind: 'nested-descriptive',
    options: DEFAULT_OPTIONS['nested-descriptive'],
  }),
  fc.constant<AnalysisSpec>({ kind: 'normality', options: DEFAULT_OPTIONS.normality }),
  fc.constant<AnalysisSpec>({
    kind: 'nested-normality',
    options: DEFAULT_OPTIONS['nested-normality'],
  }),
  fc.constant<AnalysisSpec>({
    kind: 'paired-normality',
    options: DEFAULT_OPTIONS['paired-normality'],
  }),
  fc.constant<AnalysisSpec>({
    kind: 'contingency-chi-square',
    options: DEFAULT_OPTIONS['contingency-chi-square'],
  }),
  fc.constant<AnalysisSpec>({
    kind: 'contingency-fisher',
    options: DEFAULT_OPTIONS['contingency-fisher'],
  }),
  fc.constant<AnalysisSpec>({
    kind: 'linear-regression',
    options: DEFAULT_OPTIONS['linear-regression'],
  }),
  fc
    .record({ x: fc.constantFrom('log' as const, 'concentration' as const) })
    .map((o): AnalysisSpec => ({
      kind: 'nonlinear-regression',
      options: { model: 'log-agonist-variable-slope', x: o.x },
    })),
  fc.constant<AnalysisSpec>({
    kind: 'growth-curve',
    options: DEFAULT_OPTIONS['growth-curve'],
  }),
  fc
    .record({ method: fc.constantFrom('pearson' as const, 'spearman' as const) })
    .map((o): AnalysisSpec => ({ kind: 'correlation', options: { ...o } })),
  fc
    .record({ paired: fc.boolean(), welch: fc.boolean(), tails })
    .map((o): AnalysisSpec => ({ kind: 't-test', options: { ...o } })),
  fc
    .record({
      paired: fc.boolean(),
      tails,
      zeros: fc.constantFrom('wilcoxon' as const, 'pratt' as const),
    })
    .map((o): AnalysisSpec => ({ kind: 'rank-test', options: { ...o } })),
  fc
    .record({ welch: fc.boolean(), comparisons })
    .map((o): AnalysisSpec => ({ kind: 'one-way-anova', options: { ...o } })),
  fc
    .record({
      comparisons: fc.oneof(
        fc.constant({ kind: 'none' as const }),
        fc.constant({ kind: 'all' as const }),
        fc
          .string({ minLength: 1, maxLength: 6 })
          .map((c) => ({ kind: 'control' as const, control: asId(c) })),
      ),
      corrected: fc.boolean(),
    })
    .map((o): AnalysisSpec => ({ kind: 'kruskal-wallis', options: { ...o } })),
  fc
    .record({ family: fc.constantFrom(...TWO_WAY_FAMILIES), comparisons })
    .map((o): AnalysisSpec => ({ kind: 'two-way-anova', options: { ...o } })),
  fc
    .record({
      repeatedFactor: fc.constantFrom('row' as const, 'column' as const),
      family: fc.constantFrom(...REPEATED_TWO_WAY_FAMILIES),
      comparisons: nestedComparisonsArb,
    })
    .map((o): AnalysisSpec => ({ kind: 'repeated-two-way-anova', options: { ...o } })),
  fc.constant<AnalysisSpec>({
    kind: 'repeated-two-way-anova-both',
    options: DEFAULT_OPTIONS['repeated-two-way-anova-both'],
  }),
  fc
    .record({ tails, matched: fc.boolean() })
    .map((o): AnalysisSpec => ({ kind: 'nested-t-test', options: { ...o } })),
  nestedComparisonsArb.map((comparisons): AnalysisSpec => ({
    kind: 'nested-one-way-anova',
    options: { comparisons },
  })),
  fc
    .record({ comparisons: nestedComparisonsArb, assumeSphericity: fc.boolean() })
    .map((o): AnalysisSpec => ({ kind: 'repeated-measures-anova', options: { ...o } })),
  fc
    .record({ comparisons: nestedComparisonsArb, assumeSphericity: fc.boolean() })
    .map((o): AnalysisSpec => ({ kind: 'nested-repeated-anova', options: { ...o } })),
  fc
    .record({
      comparisons: fc.oneof(
        fc.constant({ kind: 'none' as const }),
        fc.constant({ kind: 'all' as const }),
        fc
          .string({ minLength: 1, maxLength: 6 })
          .map((c) => ({ kind: 'control' as const, control: asId(c) })),
      ),
      corrected: fc.boolean(),
    })
    .map((o): AnalysisSpec => ({ kind: 'friedman', options: { ...o } })),
);

export type Shape =
  | {
      readonly k: 'column';
      readonly groups: number;
      readonly rows: number;
      readonly format: EntryFormat;
    }
  | {
      readonly k: 'grouped';
      readonly levels: number;
      readonly groups: number;
      readonly format: EntryFormat;
    }
  | {
      readonly k: 'nested';
      readonly groups: number;
      readonly format: EntryFormat;
      readonly replicateTitles: readonly (string | null)[] | null;
    }
  | {
      readonly k: 'contingency';
      readonly levels: number;
      readonly groups: number;
    }
  | {
      readonly k: 'xy';
      readonly groups: number;
      readonly rows: number;
      readonly format: EntryFormat;
    }
  | {
      readonly k: 'cells';
      readonly t: number;
      readonly writes: readonly (readonly [number, number, number, Cell])[];
    }
  | { readonly k: 'insertRows'; readonly t: number; readonly at: number; readonly n: number }
  | { readonly k: 'deleteRows'; readonly t: number; readonly rows: readonly number[] }
  | {
      readonly k: 'rowTitle';
      readonly t: number;
      readonly r: number;
      readonly title: string | null;
    }
  | { readonly k: 'addDataSet'; readonly t: number; readonly at: number; readonly title: string }
  | { readonly k: 'removeDataSet'; readonly t: number; readonly d: number }
  | { readonly k: 'moveDataSet'; readonly t: number; readonly d: number; readonly to: number }
  | {
      readonly k: 'dataSet';
      readonly t: number;
      readonly d: number;
      readonly title?: string;
      readonly color?: string | null;
      readonly decimals?: number | null;
    }
  | {
      readonly k: 'exclude';
      readonly t: number;
      readonly d: number;
      readonly cells: readonly (readonly [number, number])[];
      readonly on: boolean;
    }
  | { readonly k: 'format'; readonly t: number; readonly format: EntryFormat }
  | {
      readonly k: 'tableInfo';
      readonly t: number;
      readonly unit: string | null;
      readonly notes: string | null;
    }
  | {
      readonly k: 'analysis';
      readonly t: number;
      readonly ds: readonly number[];
      readonly spec: AnalysisSpec;
    }
  | { readonly k: 'chained'; readonly a: number }
  | { readonly k: 'rewire'; readonly a: number; readonly to: number }
  | {
      readonly k: 'graph';
      readonly t: number;
      readonly a: readonly number[];
      readonly v: number;
      readonly ds: readonly number[];
    }
  | { readonly k: 'removeTable'; readonly t: number }
  | { readonly k: 'removeAnalysis'; readonly a: number }
  | { readonly k: 'removeGraph'; readonly g: number }
  | { readonly k: 'moveTable'; readonly t: number; readonly to: number }
  | { readonly k: 'export'; readonly g: number };

export const shapeArb: fc.Arbitrary<Shape> = fc.oneof(
  {
    arbitrary: fc.record({
      k: fc.constant('column'),
      groups: small,
      rows: fc.integer({ min: 0, max: 6 }),
      format: formatArb,
    }),
    weight: 3,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('grouped'),
      levels: small,
      groups: small,
      format: formatArb,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('nested'),
      groups: small,
      format: nestedFormatArb,
      replicateTitles: fc.option(fc.array(title, { maxLength: 4 })),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('contingency'),
      levels: small,
      groups: small,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('xy'),
      groups: small,
      rows: small,
      format: formatArb,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('cells'),
      t: idx,
      writes: fc.array(fc.tuple(idx, idx, idx, cellArb), { maxLength: 12 }),
    }),
    weight: 6,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('insertRows'),
      t: idx,
      at: idx,
      n: fc.integer({ min: 1, max: 3 }),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('deleteRows'),
      t: idx,
      rows: fc.array(idx, { maxLength: 3 }),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({ k: fc.constant('rowTitle'), t: idx, r: idx, title: fc.option(title) }),
    weight: 1,
  },
  { arbitrary: fc.record({ k: fc.constant('addDataSet'), t: idx, at: idx, title }), weight: 1 },
  { arbitrary: fc.record({ k: fc.constant('removeDataSet'), t: idx, d: idx }), weight: 1 },
  { arbitrary: fc.record({ k: fc.constant('moveDataSet'), t: idx, d: idx, to: idx }), weight: 1 },
  {
    arbitrary: fc.record(
      {
        k: fc.constant('dataSet'),
        t: idx,
        d: idx,
        title,
        color: fc.option(fc.constantFrom('#0173b2', '#de8f05')),
        decimals: fc.option(fc.integer({ min: 0, max: 15 })),
      },
      { requiredKeys: ['k', 't', 'd'] },
    ),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('exclude'),
      t: idx,
      d: idx,
      cells: fc.array(fc.tuple(idx, idx), { maxLength: 4 }),
      on: fc.boolean(),
    }),
    weight: 2,
  },
  { arbitrary: fc.record({ k: fc.constant('format'), t: idx, format: formatArb }), weight: 1 },
  {
    arbitrary: fc.record({
      k: fc.constant('tableInfo'),
      t: idx,
      unit: fc.option(title),
      notes: fc.option(title),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('analysis'),
      t: idx,
      ds: fc.array(idx, { maxLength: 3 }),
      spec: analysisSpec,
    }),
    weight: 2,
  },
  { arbitrary: fc.record({ k: fc.constant('chained'), a: idx }), weight: 1 },
  { arbitrary: fc.record({ k: fc.constant('rewire'), a: idx, to: idx }), weight: 1 },
  {
    arbitrary: fc.record({
      k: fc.constant('graph'),
      t: idx,
      a: fc.array(idx, { maxLength: 2 }),
      v: fc.nat(1000),
      ds: fc.array(idx, { maxLength: 3 }),
    }),
    // Graphs carry many optional fields; enough of them that each is seen.
    weight: 4,
  },
  { arbitrary: fc.record({ k: fc.constant('removeTable'), t: idx }), weight: 1 },
  { arbitrary: fc.record({ k: fc.constant('removeAnalysis'), a: idx }), weight: 1 },
  { arbitrary: fc.record({ k: fc.constant('removeGraph'), g: idx }), weight: 1 },
  { arbitrary: fc.record({ k: fc.constant('moveTable'), t: idx, to: idx }), weight: 1 },
  { arbitrary: fc.record({ k: fc.constant('export'), g: idx }), weight: 1 },
);

const pick = <T>(items: readonly T[], i: number): T | undefined =>
  items.length === 0 ? undefined : items[i % items.length];

/** The edit a shape stands for in this project, or null when it has nothing to act on. */
export function resolve(p: Project, s: Shape): Edit | null {
  const tableId = 't' in s ? pick(p.order.tables, s.t) : undefined;
  const table = tableId === undefined ? undefined : p.tables.get(tableId);
  const ds = table && 'd' in s ? pick(table.dataSets, s.d) : undefined;
  switch (s.k) {
    case 'column':
      return {
        op: 'addTable',
        table: createColumnTable({
          title: 'C',
          groups: Array.from({ length: s.groups }, (_, i) => `G${String(i)}`),
          rows: s.rows,
          ...(s.format.kind === 'summary' ? { format: s.format } : {}),
        }),
      };
    case 'grouped':
      return {
        op: 'addTable',
        table: createGroupedTable({
          title: 'G',
          rowTitles: Array.from({ length: s.levels }, (_, i) => `R${String(i)}`),
          groups: Array.from({ length: s.groups }, (_, i) => `G${String(i)}`),
          format: s.format,
        }),
      };
    case 'contingency':
      return {
        op: 'addTable',
        table: createContingencyTable({
          title: 'X',
          rowTitles: Array.from({ length: s.levels }, (_, i) => `R${String(i)}`),
          groups: Array.from({ length: s.groups }, (_, i) => `G${String(i)}`),
        }),
      };
    case 'xy':
      return {
        op: 'addTable',
        table: createXyTable({
          title: 'XY',
          groups: Array.from({ length: s.groups }, (_, i) => `G${String(i)}`),
          rows: s.rows,
          format: s.format,
        }),
      };
    case 'nested': {
      const count = subcolumnCount(s.format);
      const pool = s.replicateTitles;
      const replicateTitles = pool?.length
        ? Array.from({ length: count }, (_, i) => pool[i % pool.length] ?? null)
        : undefined;
      return {
        op: 'addTable',
        table: createNestedTable({
          title: 'N',
          groups: Array.from({ length: s.groups }, (_, i) => `G${String(i)}`),
          replicates: count,
          ...(replicateTitles ? { replicateTitles } : {}),
        }),
      };
    }
    case 'cells': {
      if (!table || table.dataSets.length === 0 || table.rows.length === 0) return null;
      const cells = s.writes.map(([d, c, r, value]) => {
        const set = table.dataSets[d % table.dataSets.length];
        const row = table.rows[r % table.rows.length];
        if (!set || !row) throw new Error('unreachable');
        return { dataSet: set.id, subcolumn: c % subcolumnCount(table.format), row: row.id, value };
      });
      return { op: 'setCells', table: table.id, cells };
    }
    case 'insertRows':
      if (!table) return null;
      return {
        op: 'insertRows',
        table: table.id,
        at: s.at % (table.rows.length + 1),
        rows: Array.from({ length: s.n }, () => ({
          id: newId('r'),
          title: table.type === 'grouped' ? 'new' : null,
        })),
      };
    case 'deleteRows': {
      if (!table || table.rows.length === 0) return null;
      const rows = [
        ...new Set(s.rows.map((r) => (table.rows[r % table.rows.length] as { id: Id }).id)),
      ];
      return { op: 'deleteRows', table: table.id, rows };
    }
    case 'rowTitle': {
      const row = table ? pick(table.rows, s.r) : undefined;
      return table && row
        ? { op: 'setRowTitle', table: table.id, row: row.id, title: s.title }
        : null;
    }
    case 'addDataSet':
      return table
        ? {
            op: 'addDataSet',
            table: table.id,
            at: s.at % (table.dataSets.length + 1),
            id: newId('ds'),
            title: s.title,
          }
        : null;
    case 'removeDataSet':
      return table && ds ? { op: 'removeDataSet', table: table.id, dataSet: ds.id } : null;
    case 'moveDataSet':
      return table && ds
        ? { op: 'moveDataSet', table: table.id, dataSet: ds.id, to: s.to % table.dataSets.length }
        : null;
    case 'dataSet':
      return table && ds
        ? {
            op: 'setDataSet',
            table: table.id,
            dataSet: ds.id,
            ...(s.title === undefined ? {} : { title: s.title }),
            ...(s.color === undefined ? {} : { color: s.color }),
            ...(s.decimals === undefined ? {} : { decimals: s.decimals }),
          }
        : null;
    case 'exclude': {
      if (!table || !ds || table.rows.length === 0) return null;
      const cells = s.cells.map(([c, r]) => ({
        subcolumn: c % ds.subcolumns.length,
        row: (table.rows[r % table.rows.length] as { id: Id }).id,
      }));
      return { op: 'setExcluded', table: table.id, dataSet: ds.id, cells, excluded: s.on };
    }
    case 'format': {
      if (!table) return null;
      const format: EntryFormat =
        table.type === 'column' && s.format.kind === 'replicates'
          ? { kind: 'replicates', count: 1 }
          : s.format;
      return { op: 'setFormat', table: table.id, format };
    }
    case 'tableInfo':
      return table ? { op: 'setTableInfo', table: table.id, unit: s.unit, notes: s.notes } : null;
    case 'analysis': {
      if (!table) return null;
      const dataSets = [
        ...new Set(
          s.ds.flatMap((d) =>
            table.dataSets.length
              ? [(table.dataSets[d % table.dataSets.length] as { id: Id }).id]
              : [],
          ),
        ),
      ];
      const base = {
        id: newId('a'),
        title: 'A',
        input: { kind: 'table' as const, table: table.id, dataSets },
      };
      return { op: 'addAnalysis', analysis: { ...base, ...s.spec } as Analysis };
    }
    case 'chained': {
      const up = pick(p.order.analyses, s.a);
      if (up === undefined) return null;
      return {
        op: 'addAnalysis',
        analysis: {
          id: newId('a'),
          title: 'B',
          kind: 'descriptive',
          options: {},
          input: { kind: 'analysis', analysis: up },
        },
      };
    }
    case 'rewire': {
      const a = pick(p.order.analyses, s.a);
      const to = pick(p.order.analyses, s.to);
      const cur = a === undefined ? undefined : p.analyses.get(a);
      if (!cur || to === undefined) return null;
      return { op: 'setAnalysis', analysis: { ...cur, input: { kind: 'analysis', analysis: to } } };
    }
    case 'graph': {
      // Contingency tables have no graph plot kind yet (#86, note 31's
      // PLOT_TABLE_TYPES): every plot kind this generator can build is for
      // a Column/Grouped/Nested/XY table, so it never adds one to a
      // Contingency table (the "New graph" button's own gap, unrelated to
      // this generator, is #86's to close).
      if (!table || table.type === 'contingency') return null;
      const analyses = [
        ...new Set(
          s.a.flatMap((i) => {
            const a = pick(p.order.analyses, i);
            return a === undefined ? [] : [a];
          }),
        ),
      ];
      return {
        op: 'addGraph',
        graph: {
          id: newId('g'),
          title: 'Graph',
          ...GRAPH_DEFAULTS,
          source: { kind: 'table', table: table.id },
          analyses,
          // Vary every field the file has to carry.
          dataSets:
            s.v % 2 === 0 || table.dataSets.length === 0
              ? null
              : [
                  ...new Set(
                    s.ds.map((i) => (table.dataSets[i % table.dataSets.length] as { id: Id }).id),
                  ),
                ],
          plot:
            table.type === 'grouped'
              ? {
                  kind: 'grouped-bars',
                  arrangement: s.v % 2 ? 'separated' : 'interleaved',
                  error: (['sd', 'sem', 'ci95', 'range', 'none'] as const)[s.v % 5] ?? 'sd',
                  points: s.v % 3 !== 0,
                }
              : table.type === 'xy'
                ? {
                    kind: 'xy-scatter',
                    style: (['scatter', 'lines', 'traces'] as const)[s.v % 3] ?? 'scatter',
                    points: s.v % 3 !== 0,
                    fit: s.v % 2 === 0,
                    band: (['confidence', 'prediction', 'none'] as const)[s.v % 3] ?? 'none',
                  }
                : s.v % 11 === 3
                  ? {
                      kind: 'box',
                      whiskers:
                        (['min-max', 'tukey', 'p10-90', 'p2.5-97.5'] as const)[s.v % 4] ?? 'tukey',
                      points: (['none', 'outliers', 'all'] as const)[s.v % 3] ?? 'all',
                    }
                  : s.v % 11 === 5
                    ? {
                        kind: 'violin',
                        inner: (['quartiles', 'box', 'points', 'none'] as const)[s.v % 4] ?? 'none',
                        smoothing: 0.5 + (s.v % 4) * 0.25,
                      }
                    : s.v % 3 === 0
                      ? {
                          kind: 'dots',
                          center: s.v % 5 === 0 ? 'median' : 'mean',
                          error: (['sd', 'sem', 'ci95', 'range', 'none'] as const)[s.v % 5] ?? 'sd',
                          ...(s.v % 2 === 0 ? { colorByReplicate: s.v % 4 === 0 } : {}),
                        }
                      : {
                          kind: 'bars',
                          error: (['sd', 'sem', 'ci95', 'range', 'none'] as const)[s.v % 5] ?? 'sd',
                          points: s.v % 7 !== 0,
                        },
          size: { width: 20 + (s.v % 160), height: 20 + ((s.v * 7) % 120) + 0.5 },
          theme:
            s.v % 4 === 0
              ? { kind: 'fixed', theme: { name: 'x', lines: { axis: 0.5 } } }
              : { kind: 'named', name: s.v % 2 ? 'classic' : 'modern' },
          format: {
            bracketLabels: s.v % 2 ? 'exact' : 'stars',
            showNs: s.v % 3 !== 1,
            ...(s.v % 3 === 0 ? { starScheme: 'apa' as const } : {}),
            hiddenBrackets: analyses.slice(0, s.v % 2),
            ...(s.v % 5 === 1 ? { yTitle: 'Viability (%)', yMin: -1.5, yMax: 120 } : {}),
            ...(s.v % 5 === 2 ? { xTitle: 'Time (h)', xMin: -1, xMax: 48 } : {}),
            ...(s.v % 6 === 2
              ? {
                  yScale: 'log10' as const,
                  yDecimals: 2,
                  xScale: 'log10' as const,
                  xDecimals: 1,
                  xAngle: 45 as const,
                  showTitle: true,
                  style: {
                    'font.tick': 9,
                    'lines.axis': 1.25,
                    barWidth: 0.5,
                    ticks: 'in' as const,
                  },
                  symbols: Object.fromEntries(
                    table.dataSets
                      .slice(0, 2)
                      .map((d, i) => [d.id, i ? 'diamond' : 'square'] as const),
                  ),
                  bracketOffsets: Object.fromEntries(analyses.map((a, i) => [a, 2.5 - i * 4])),
                  legend: 'top' as const,
                }
              : {}),
            ...(s.v % 6 === 4
              ? {
                  yStep: 5,
                  xStep: 6,
                  xAngle: 90 as const,
                  showTitle: false,
                  legend: 'none' as const,
                  style: { spines: 'box' as const },
                }
              : {}),
          },
        },
      };
    }
    case 'removeTable':
      return table ? { op: 'removeTable', table: table.id } : null;
    case 'removeAnalysis': {
      const a = pick(p.order.analyses, s.a);
      return a === undefined ? null : { op: 'removeAnalysis', analysis: a };
    }
    case 'removeGraph': {
      const g = pick(p.order.graphs, s.g);
      return g === undefined ? null : { op: 'removeGraph', graph: g };
    }
    case 'moveTable':
      return table ? { op: 'moveTable', table: table.id, to: s.to % p.order.tables.length } : null;
    case 'export': {
      const g = pick(p.order.graphs, s.g);
      return g === undefined
        ? null
        : {
            op: 'addExport',
            record: {
              id: newId('x'),
              graph: g,
              exportedAt: '2026-09-24T12:00:00.000Z',
              fileName: s.g % 2 ? 'Figure 2.png' : 'Figure 2.svg',
              format: s.g % 2 ? 'png' : 'svg',
              dpi: s.g % 2 ? 600 : null,
              size: { width: 89, height: 60.5 },
              recipe: { note: 'x' },
            },
          };
    }
  }
}

export interface Session {
  readonly project: Project;
  /** Edits that were applied, in order. */
  readonly applied: readonly Edit[];
  /** Edits that were refused with an `EditError`. */
  readonly refused: number;
}

/** Plays shapes against a fresh project, skipping edits that are refused. */
export function play(shapes: readonly Shape[]): Session {
  let project = createProject('Session');
  const applied: Edit[] = [];
  let refused = 0;
  for (const s of shapes) {
    const edit = resolve(project, s);
    if (!edit) continue;
    try {
      project = applyEdit(project, edit);
      applied.push(edit);
    } catch (e: unknown) {
      if (!(e instanceof EditError)) throw e;
      refused += 1;
    }
  }
  return { project, applied, refused };
}

export const sessionArb: fc.Arbitrary<readonly Shape[]> = fc.array(shapeArb, { maxLength: 40 });
