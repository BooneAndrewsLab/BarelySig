/**
 * The pairwise comparisons an analysis makes, in one form, for
 * significance brackets (note 05; item 06, "Brackets"). A single
 * comparison is keyed by the analysis id; one of several (post-hoc tests)
 * by `<analysis>/<data set A>/<data set B>`.
 */
import type { Json } from '@/model/json';
import type { Analysis, AnalysisKind } from '@/model/project';

import type { KruskalWallisResult } from './kruskal/types';
import type { OneWayResult } from './oneway/types';
import type { RankTestResult } from './ranktest/types';
import type { TTestResult } from './ttest/types';

export interface Pair {
  readonly key: string;
  /** Data set ids. */
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
  'rank-test',
  'one-way-anova',
  'kruskal-wallis',
]);

export const gives = (a: Analysis): boolean => BRACKET_KINDS.has(a.kind);

export const pairKey = (analysis: string, a: string, b: string): string => `${analysis}/${a}/${b}`;

/**
 * The pairs an analysis compares, from its settings alone (so a graph can
 * list them before the results are in): every pair of its groups in order,
 * or the control against each other group, as Prism orders them.
 */
export function pairsOf(analysis: Analysis): readonly Pair[] {
  if (analysis.input.kind !== 'table') return [];
  const ids = analysis.input.dataSets;
  switch (analysis.kind) {
    case 't-test':
    case 'rank-test': {
      const [a, b] = ids;
      return a !== undefined && b !== undefined && ids.length === 2
        ? [{ key: analysis.id, a, b }]
        : [];
    }
    case 'one-way-anova':
    case 'kruskal-wallis': {
      const c = analysis.options.comparisons;
      if (c.kind === 'none') return [];
      if (c.kind === 'control') {
        return ids
          .filter((x) => x !== c.control)
          .map((b) => ({ key: pairKey(analysis.id, c.control, b), a: c.control, b }));
      }
      return ids.flatMap((a, i) =>
        ids.slice(i + 1).map((b) => ({ key: pairKey(analysis.id, a, b), a, b })),
      );
    }
    case 'descriptive':
    case 'normality':
    case 'graph-summary':
    case 'two-way-anova':
      // Two-way brackets wait for grouped graphs (note 06).
      return [];
  }
}

/** The comparisons in an analysis's result, with their P values. */
export function comparisons(analysis: Analysis, value: Json): readonly Comparison[] {
  switch (analysis.kind) {
    case 't-test':
    case 'rank-test': {
      const r = value as unknown as TTestResult | RankTestResult;
      return [{ key: analysis.id, a: r.a.id, b: r.b.id, p: r.p }];
    }
    case 'one-way-anova':
    case 'kruskal-wallis': {
      const r = value as unknown as OneWayResult | KruskalWallisResult;
      return r.pairs.map((c) => ({
        key: pairKey(analysis.id, c.a.id, c.b.id),
        a: c.a.id,
        b: c.b.id,
        p: c.p,
      }));
    }
    case 'descriptive':
    case 'normality':
    case 'graph-summary':
    case 'two-way-anova':
      return [];
  }
}
