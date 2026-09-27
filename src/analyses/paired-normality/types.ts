/**
 * Normality of a paired t test's differences (item 18, #53): request and
 * result. The paired t test assumes the row-by-row differences (B - A,
 * Prism's convention) are Gaussian, not the two groups on their own, so
 * this runs the same two tests as `normality` on the differences instead.
 */
import type { Named } from '../ttest/types';
import type { TestOutcome } from '../normality/types';

export interface PairedNormalityRequest {
  readonly a: Named;
  readonly b: Named;
  /** B - A for every complete row (Prism's convention for the pairing). */
  readonly differences: readonly number[];
  /** Rows with a value on one side only, left out of the pairing. */
  readonly droppedRows: number;
}

export interface PairedNormalityResult {
  readonly a: Named;
  readonly b: Named;
  readonly n: number;
  readonly droppedRows: number;
  readonly shapiroWilk: TestOutcome<{ readonly w: number; readonly p: number }>;
  readonly dagostino: TestOutcome<{
    readonly k2: number;
    readonly p: number;
    readonly zSkewness: number;
    readonly zKurtosis: number;
  }>;
  readonly warnings: readonly string[];
}
