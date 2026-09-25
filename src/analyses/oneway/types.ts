/** One-way ANOVA with multiple comparisons (item 06, #25): request and result. */
import type { OneWayOptions } from '@/model/project';
import type { Dropped } from '@/model/selectors';

import type { Named } from '../ttest/types';

export type OneWayData =
  | { readonly kind: 'values'; readonly groups: readonly (readonly number[])[] }
  | {
      readonly kind: 'summary';
      readonly means: readonly number[];
      readonly sds: readonly number[];
      readonly ns: readonly number[];
    };

export interface OneWayRequest {
  readonly groups: readonly Named[];
  readonly options: OneWayOptions;
  readonly data: OneWayData;
  /** The control's position among the groups (0-based), for comparisons with a control. */
  readonly control: number | null;
  readonly dropped: readonly (Dropped | null)[];
}

export interface FTest {
  readonly f: number;
  readonly dfn: number;
  readonly dfd: number;
  readonly p: number;
}

export interface OneWayGroup extends Named {
  readonly n: number;
  readonly mean: number;
  /** null with one value. */
  readonly sd: number | null;
  /** null from summary data. */
  readonly median: number | null;
  readonly dropped: Dropped | null;
}

/** One comparison, "A vs. B": diff = mean A − mean B (Prism). */
export interface PairComparison {
  readonly a: Named;
  readonly b: Named;
  readonly diff: number;
  readonly se: number;
  readonly df: number;
  /** q for Tukey and Games-Howell, t otherwise (Dunnett's q is a t). */
  readonly statistic: number;
  readonly ciLower: number;
  readonly ciUpper: number;
  /** Adjusted for the number of comparisons. */
  readonly p: number;
}

export interface OneWayResult {
  readonly from: 'values' | 'summary';
  readonly welch: boolean;
  readonly groups: readonly OneWayGroup[];
  readonly anova: {
    readonly ssBetween: number;
    readonly ssWithin: number;
    readonly ssTotal: number;
    readonly dfBetween: number;
    readonly dfWithin: number;
    readonly dfTotal: number;
    readonly msBetween: number;
    readonly msWithin: number;
    readonly f: number;
    readonly p: number;
    readonly rSquared: number;
  };
  /** Only when every group has at least five values and some scatter (Prism). */
  readonly bartlett: { readonly statistic: number; readonly df: number; readonly p: number } | null;
  /** Brown-Forsythe test of equal SDs; null from summary data or without scatter. */
  readonly brownForsythe: FTest | null;
  /** Welch's and the Brown-Forsythe ANOVA, when not assuming equal SDs. */
  readonly welchAnova: FTest | null;
  readonly brownForsytheAnova: FTest | null;
  readonly comparisons: OneWayOptions['comparisons'];
  readonly pairs: readonly PairComparison[];
  readonly warnings: readonly string[];
}
