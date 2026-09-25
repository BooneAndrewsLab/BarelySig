/**
 * Mann-Whitney and Wilcoxon matched-pairs tests (item 06, #24): request
 * and result. Group A is the first data set, B the second; differences are
 * B − A, as the t tests report them.
 */
import type { RankTestOptions } from '@/model/project';
import type { Dropped } from '@/model/selectors';

import type { Named } from '../ttest/types';

export type RankTestData =
  | { readonly kind: 'unpaired'; readonly a: readonly number[]; readonly b: readonly number[] }
  | { readonly kind: 'paired'; readonly a: readonly number[]; readonly b: readonly number[] };

export interface RankTestRequest {
  readonly a: Named;
  readonly b: Named;
  readonly options: RankTestOptions;
  readonly data: RankTestData;
  readonly dropped: {
    readonly a: Dropped | null;
    readonly b: Dropped | null;
    readonly rows: number | null;
  };
}

/** A confidence interval of a rank test: its level is never exactly 95%, so it is stated. */
export interface RankInterval {
  readonly lower: number;
  readonly upper: number;
  /** The level achieved, e.g. 0.9683; 0.95 for R's asymptotic interval. */
  readonly level: number;
}

interface Common {
  readonly tails: 'two' | 'one';
  readonly a: Named & { readonly median: number };
  readonly b: Named & { readonly median: number };
  /** Counted over every shuffle of the ranks (true), or the normal approximation. */
  readonly exact: boolean;
  readonly pTwo: number;
  /** The tail in the observed direction. */
  readonly pOne: number;
  /** The P the options ask for. */
  readonly p: number;
  /** Hodges-Lehmann estimate of the shift, B − A. */
  readonly hodgesLehmann: number;
  readonly ci: RankInterval;
  readonly dropped: RankTestRequest['dropped'];
  readonly warnings: readonly string[];
}

export interface MannWhitneyResult extends Common {
  readonly test: 'mann-whitney';
  /** The smaller of U and U′, as Prism reports it. */
  readonly u: number;
  readonly nA: number;
  readonly nB: number;
  readonly rankSumA: number;
  readonly rankSumB: number;
  readonly meanRankA: number;
  readonly meanRankB: number;
  /** Median of B minus median of A. */
  readonly difference: number;
}

export interface WilcoxonResult extends Common {
  readonly test: 'wilcoxon';
  readonly zeros: 'wilcoxon' | 'pratt';
  /** Sum of signed ranks. */
  readonly w: number;
  /** Ranks where B > A. */
  readonly sumPositive: number;
  /** Ranks where B < A, as a negative number (Prism). */
  readonly sumNegative: number;
  readonly pairs: number;
  /** Pairs with no difference. */
  readonly zeroPairs: number;
  readonly medianDifference: number;
  /** Spearman's r between A and B and its one-tailed P for r > 0; null with fewer than three pairs or no variation. */
  readonly pairing: { readonly r: number; readonly p: number } | null;
}

export type RankTestResult = MannWhitneyResult | WilcoxonResult;
