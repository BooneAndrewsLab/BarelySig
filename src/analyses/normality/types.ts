/** Normality tests of each group (item 06, #28): request and result. */
import type { Dropped } from '@/model/selectors';

import type { Named } from '../ttest/types';

export interface NormalityRequest {
  readonly groups: readonly Named[];
  readonly values: readonly (readonly number[])[];
  readonly dropped: readonly (Dropped | null)[];
}

/** A test's result, or why it couldn't run: too few values (below `minimum`), too many, or all the same. */
export type TestOutcome<T> =
  | ({ readonly ran: true } & T)
  | { readonly ran: false; readonly why: 'few' | 'many' | 'same'; readonly limit: number | null };

export interface NormalityGroup extends Named {
  readonly n: number;
  readonly dropped: Dropped | null;
  readonly shapiroWilk: TestOutcome<{ readonly w: number; readonly p: number }>;
  readonly dagostino: TestOutcome<{
    readonly k2: number;
    readonly p: number;
    readonly zSkewness: number;
    readonly zKurtosis: number;
  }>;
}

export interface NormalityResult {
  readonly groups: readonly NormalityGroup[];
  readonly warnings: readonly string[];
}
