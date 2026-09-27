/**
 * Normality of a Nested table's replicate means (item 26, #77): the same
 * two tests as `normality` (D'Agostino-Pearson, Shapiro-Wilk), run once
 * per group on its replicate means (`nestedReplicateMeans`, note 26) --
 * what the matched nested t test, matched nested one-way ANOVA and
 * nested-descriptive's group summary actually assume, not the individual
 * values. With the typical handful of replicates per group these tests
 * have essentially no power; see design note 27 and the results reading.
 */
import type { TestOutcome } from '../normality/types';
import type { Named } from '../ttest/types';

export interface NestedNormalityGroupRequest extends Named {
  /** One mean per replicate with a usable value (`nestedReplicateMeans`). */
  readonly replicateMeans: readonly number[];
  /** Replicates with no usable value at all, dropped and counted. */
  readonly droppedReplicates: number;
}

export interface NestedNormalityRequest {
  readonly groups: readonly NestedNormalityGroupRequest[];
}

export interface NestedNormalityGroup extends Named {
  /** Replicates with a usable mean -- what n means here. */
  readonly n: number;
  readonly droppedReplicates: number;
  readonly shapiroWilk: TestOutcome<{ readonly w: number; readonly p: number }>;
  readonly dagostino: TestOutcome<{
    readonly k2: number;
    readonly p: number;
    readonly zSkewness: number;
    readonly zKurtosis: number;
  }>;
}

export interface NestedNormalityResult {
  readonly groups: readonly NestedNormalityGroup[];
  readonly warnings: readonly string[];
}
