/**
 * Nested t test (item 13, #66): a REML mixed model (note 13), not a plain
 * t test on averaged replicates. Group A is the first data set, B the
 * second; the difference is B - A, as the other t tests report it.
 */
import type { NestedTTestOptions } from '@/model/project';

export interface Named {
  readonly id: string;
  readonly title: string;
}

/** One group's usable replicates, each an array of individual values (ragged, never empty). */
export interface NestedGroupData {
  readonly replicates: readonly (readonly number[])[];
}

export interface NestedTTestRequest {
  readonly a: Named;
  readonly b: Named;
  readonly options: NestedTTestOptions;
  readonly data: { readonly a: NestedGroupData; readonly b: NestedGroupData };
  /** Replicates dropped for having no usable value, per group, for "Data analyzed". */
  readonly droppedReplicates: { readonly a: number; readonly b: number };
}

export interface NestedTTestGroup extends Named {
  /** Replicates with at least one usable value (what n means for this test). */
  readonly nReplicates: number;
  /** Individual values folded into those replicates. */
  readonly nValues: number;
  /** The mixed model's estimated mean for this group (not a simple average: see betweenReplicateSd). */
  readonly mean: number;
}

export interface NestedTTestResult {
  readonly tails: 'two' | 'one';
  readonly a: NestedTTestGroup;
  readonly b: NestedTTestGroup;
  readonly t: number;
  readonly df: number;
  readonly pTwo: number;
  /** Half the two-tailed P, as the other t tests report it. */
  readonly pOne: number;
  /** The P the options ask for. */
  readonly p: number;
  /** Mean of B minus mean of A. */
  readonly difference: number;
  readonly seDifference: number;
  readonly ciLower: number;
  readonly ciUpper: number;
  /** SD of replicate means around their group mean (the between-replicate variance component). */
  readonly betweenReplicateSd: number;
  /** SD of individual values around their own replicate's mean (the within-replicate/residual component). */
  readonly withinReplicateSd: number;
  readonly droppedReplicates: NestedTTestRequest['droppedReplicates'];
  readonly warnings: readonly string[];
}
