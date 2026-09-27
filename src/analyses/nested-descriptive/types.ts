/**
 * Descriptive statistics of a Nested table (item 25, #75): per replicate
 * (n, mean, SD, SEM), per group from the replicate means — the primary,
 * SuperPlot-correct summary a figure legend wants (Lord et al. 2020) —
 * and, for reference only, pooled over every individual value ignoring
 * the replicate structure (shown with a pseudoreplication caution, never
 * for inference; see the design note for why it's kept at all).
 */
import type { Named } from '../ttest/types';

export interface NestedDescriptiveGroupRequest extends Named {
  /** Replicates with at least one usable value, raw values only. */
  readonly replicates: readonly (readonly number[])[];
  /** One title per entry of `replicates`, in the same order. */
  readonly replicateTitles: readonly string[];
  /**
   * Each of those replicates' own mean, in the same order — from
   * `nestedReplicateMeans` (note 07's graph statistic), so the group-
   * level summary below and a SuperPlot's error bar can never disagree
   * on what a "replicate mean" is.
   */
  readonly replicateMeans: readonly number[];
  /** Replicates with no usable value at all, dropped and counted. */
  readonly droppedReplicates: number;
}

export interface NestedDescriptiveRequest {
  readonly groups: readonly NestedDescriptiveGroupRequest[];
}

/** One replicate's own numbers: `null` when undefined (SD/SEM of a single value). */
export interface DescribedReplicate {
  readonly title: string;
  readonly n: number;
  readonly mean: number | null;
  readonly sd: number | null;
  readonly sem: number | null;
}

/** From the replicate means: the number a figure legend or a test actually uses. */
export interface NestedGroupSummary {
  /** Replicates with a usable value — what n means here. */
  readonly n: number;
  readonly mean: number | null;
  readonly sd: number | null;
  readonly sem: number | null;
  readonly ciLower: number | null;
  readonly ciUpper: number | null;
}

/**
 * Pooled over every individual value, ignoring the replicate structure —
 * for reference only. Deliberately minimal (no percentiles, no CI):
 * never meant to be read as the analysis's real summary.
 */
export interface NestedPooledSummary {
  readonly n: number;
  readonly mean: number | null;
  readonly sd: number | null;
}

export interface NestedDescribedGroup extends Named {
  readonly droppedReplicates: number;
  readonly replicates: readonly DescribedReplicate[];
  readonly group: NestedGroupSummary;
  readonly pooled: NestedPooledSummary;
}

export interface NestedDescriptiveResult {
  readonly groups: readonly NestedDescribedGroup[];
  readonly warnings: readonly string[];
}
