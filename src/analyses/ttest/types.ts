/** t tests (item 04, #17): request and result. Group A is the first data set, B the second. */
import type { TTestOptions } from '@/model/project';
import type { Dropped } from '@/model/selectors';

export interface Summary {
  readonly mean: number | null;
  readonly sd: number | null;
  readonly n: number | null;
}

export type TTestData =
  | { readonly kind: 'unpaired'; readonly a: readonly number[]; readonly b: readonly number[] }
  | { readonly kind: 'summary'; readonly a: Summary; readonly b: Summary }
  | { readonly kind: 'paired'; readonly a: readonly number[]; readonly b: readonly number[] };

export interface Named {
  readonly id: string;
  readonly title: string;
}

export interface TTestRequest {
  readonly a: Named;
  readonly b: Named;
  readonly options: TTestOptions;
  readonly data: TTestData;
  /** What was left out before the test, for "Data analyzed". */
  readonly dropped: {
    readonly a: Dropped | null;
    readonly b: Dropped | null;
    readonly rows: number | null;
  };
}

export interface TTestGroup extends Named {
  readonly n: number;
  readonly mean: number;
  /** null for a paired test, which reports the SD of the differences instead. */
  readonly sd: number | null;
}

export interface TTestResult {
  readonly test: 'unpaired' | 'welch' | 'paired';
  readonly tails: 'two' | 'one';
  readonly from: 'values' | 'summary';
  readonly a: TTestGroup;
  readonly b: TTestGroup;
  readonly t: number;
  readonly df: number;
  readonly pTwo: number;
  /** Half the two-tailed P, as Prism reports it (valid only for a direction predicted in advance). */
  readonly pOne: number;
  /** The P the options ask for. */
  readonly p: number;
  /** Mean of B minus mean of A (Prism's convention); for a paired test, the mean of the differences. */
  readonly difference: number;
  readonly seDifference: number;
  readonly ciLower: number;
  readonly ciUpper: number;
  readonly rSquared: number;
  /** F test for equal variances (unpaired only); null when not defined (a group without variation). */
  readonly fTest: {
    readonly f: number;
    readonly dfn: number;
    readonly dfd: number;
    readonly p: number;
  } | null;
  readonly pairing: {
    readonly pairs: number;
    readonly sdDifference: number;
    /** Pearson r between A and B, and its one-tailed P for r > 0; null with fewer than three pairs. */
    readonly r: number | null;
    readonly p: number | null;
  } | null;
  readonly dropped: TTestRequest['dropped'];
  readonly warnings: readonly string[];
}
