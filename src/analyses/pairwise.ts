/**
 * The pairwise comparisons an analysis's result holds, in one form, for
 * significance brackets (note 05; item 06, "Brackets"). A single
 * comparison is keyed by the analysis id; one of several (post-hoc tests)
 * by `<analysis>/<data set A>/<data set B>`.
 */
import type { Json } from '@/model/json';
import type { Analysis, AnalysisKind } from '@/model/project';

import type { RankTestResult } from './ranktest/types';
import type { TTestResult } from './ttest/types';

export interface Comparison {
  readonly key: string;
  /** Data set ids. */
  readonly a: string;
  readonly b: string;
  /** The P the analysis reports for it (adjusted, for multiple comparisons). */
  readonly p: number;
}

/** Kinds whose results can give brackets. */
export const BRACKET_KINDS: ReadonlySet<AnalysisKind> = new Set<AnalysisKind>([
  't-test',
  'rank-test',
]);

export const gives = (a: Analysis): boolean => BRACKET_KINDS.has(a.kind);

export function comparisons(analysis: Analysis, value: Json): readonly Comparison[] {
  switch (analysis.kind) {
    case 't-test':
    case 'rank-test': {
      const r = value as unknown as TTestResult | RankTestResult;
      return [{ key: analysis.id, a: r.a.id, b: r.b.id, p: r.p }];
    }
    case 'descriptive':
      return [];
  }
}
