/**
 * The pairwise comparisons an analysis makes, in one form, for
 * significance brackets (note 05; item 06, "Brackets"). A single
 * comparison is keyed by the analysis id; one of several (post-hoc tests)
 * by `<analysis>/<A>/<B>`, where A and B are data sets, or for two-way
 * ANOVA cells of a Grouped table, `<row>/<data set>` (note 07).
 */
import type { Json } from '@/model/json';
import type { Analysis, AnalysisKind, Project } from '@/model/project';

import type { FriedmanResult } from './friedman/types';
import type { KruskalWallisResult } from './kruskal/types';
import type { NestedOneWayResult } from './nested-oneway/types';
import type { NestedTTestResult } from './nested-ttest/types';
import type { OneWayResult } from './oneway/types';
import type { RankTestResult } from './ranktest/types';
import type { RepeatedMeasuresResult } from './repeated/types';
import type { TTestResult } from './ttest/types';
import type { TwoWayResult } from './twoway/types';

export interface Pair {
  readonly key: string;
  /** Data set ids, or `<row>/<data set>` cell ids for two-way ANOVA. */
  readonly a: string;
  readonly b: string;
}

export interface Comparison extends Pair {
  /** The P the analysis reports for it (adjusted, for multiple comparisons). */
  readonly p: number;
}

/** Kinds whose results can give brackets. */
export const BRACKET_KINDS: ReadonlySet<AnalysisKind> = new Set<AnalysisKind>([
  't-test',
  'nested-t-test',
  'rank-test',
  'one-way-anova',
  'nested-one-way-anova',
  'kruskal-wallis',
  'two-way-anova',
  'repeated-measures-anova',
  'friedman',
]);

export const gives = (a: Analysis): boolean => BRACKET_KINDS.has(a.kind);

export const pairKey = (analysis: string, a: string, b: string): string => `${analysis}/${a}/${b}`;

/** Every pair of levels in order, or the control against each other level, as Prism orders them. */
function among(
  levels: readonly string[],
  c:
    | { readonly kind: 'none' }
    | { readonly kind: 'all' }
    | { readonly kind: 'control'; readonly control: string },
): (readonly [string, string])[] {
  if (c.kind === 'none') return [];
  if (c.kind === 'control') {
    const { control } = c;
    return levels.filter((x) => x !== control).map((b) => [control, b] as const);
  }
  return levels.flatMap((a, i) => levels.slice(i + 1).map((b) => [a, b] as const));
}

/** A Grouped table's cell, as two-way comparisons and grouped graphs name it. */
export const cellId = (row: string, dataSet: string): string => `${row}/${dataSet}`;

/**
 * The pairs an analysis compares, from its settings alone (so a graph can
 * list them before the results are in): every pair of its groups in order,
 * or the control against each other group, as Prism orders them. Two-way
 * comparisons need the table's rows, so `project`.
 */
export function pairsOf(analysis: Analysis, project?: Project): readonly Pair[] {
  if (analysis.input.kind !== 'table') return [];
  const ids = analysis.input.dataSets;
  switch (analysis.kind) {
    case 't-test':
    case 'nested-t-test':
    case 'rank-test': {
      const [a, b] = ids;
      return a !== undefined && b !== undefined && ids.length === 2
        ? [{ key: analysis.id, a, b }]
        : [];
    }
    case 'one-way-anova':
    case 'nested-one-way-anova':
    case 'kruskal-wallis':
    case 'repeated-measures-anova':
    case 'friedman': {
      return among(ids, analysis.options.comparisons).map(([a, b]) => ({
        key: pairKey(analysis.id, a, b),
        a,
        b,
      }));
    }
    case 'two-way-anova': {
      const table = project?.tables.get(analysis.input.table);
      if (!table) return [];
      const rows = table.rows.map((r) => r.id as string);
      const c = analysis.options.comparisons;
      const pair = (a: string, b: string): Pair => ({ key: pairKey(analysis.id, a, b), a, b });
      switch (analysis.options.family) {
        case 'within-rows':
          return rows.flatMap((r) =>
            among(ids, c).map(([a, b]) => pair(cellId(r, a), cellId(r, b))),
          );
        case 'within-columns':
          return ids.flatMap((d) =>
            among(rows, c).map(([a, b]) => pair(cellId(a, d), cellId(b, d))),
          );
        case 'all-cells':
          return among(
            rows.flatMap((r) => ids.map((d) => cellId(r, d))),
            c,
          ).map(([a, b]) => pair(a, b));
        case 'main-columns':
        case 'main-rows':
          // Marginal means, which no bar shows (note 07).
          return [];
      }
      break;
    }
    case 'descriptive':
    case 'normality':
    case 'graph-summary':
      return [];
  }
}

/** The comparisons in an analysis's result, with their P values. */
export function comparisons(analysis: Analysis, value: Json): readonly Comparison[] {
  switch (analysis.kind) {
    case 't-test':
    case 'nested-t-test':
    case 'rank-test': {
      const r = value as unknown as TTestResult | NestedTTestResult | RankTestResult;
      return [{ key: analysis.id, a: r.a.id, b: r.b.id, p: r.p }];
    }
    case 'one-way-anova':
    case 'nested-one-way-anova':
    case 'kruskal-wallis':
    case 'repeated-measures-anova':
    case 'friedman': {
      const r = value as unknown as
        | OneWayResult
        | NestedOneWayResult
        | KruskalWallisResult
        | RepeatedMeasuresResult
        | FriedmanResult;
      return r.pairs.map((c) => ({
        key: pairKey(analysis.id, c.a.id, c.b.id),
        a: c.a.id,
        b: c.b.id,
        p: c.p,
      }));
    }
    case 'two-way-anova': {
      const r = value as unknown as TwoWayResult;
      const fam = r.options.family;
      return r.families.flatMap((f) =>
        f.pairs.flatMap((c): Comparison[] => {
          let a: string;
          let b: string;
          if (fam === 'within-rows' && f.level) {
            a = cellId(f.level.id, c.a.id);
            b = cellId(f.level.id, c.b.id);
          } else if (fam === 'within-columns' && f.level) {
            a = cellId(c.a.id, f.level.id);
            b = cellId(c.b.id, f.level.id);
          } else if (fam === 'all-cells') {
            a = c.a.id;
            b = c.b.id;
          } else return [];
          return [{ key: pairKey(analysis.id, a, b), a, b, p: c.p }];
        }),
      );
    }
    case 'descriptive':
    case 'normality':
    case 'graph-summary':
      return [];
  }
}
