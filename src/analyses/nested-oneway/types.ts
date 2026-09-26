/**
 * Nested one-way ANOVA (item 13, #67): the nested t test's REML mixed
 * model, generalised to three or more groups. Post-hoc comparisons via
 * emmeans on the fitted model; no Welch/Brown-Forsythe variant, since
 * the model already separates between- and within-replicate variance.
 */
import type { NestedComparisons } from '@/model/project';

export interface Named {
  readonly id: string;
  readonly title: string;
}

export interface NestedOneWayGroupData {
  readonly replicates: readonly (readonly number[])[];
}

export interface NestedOneWayRequest {
  readonly groups: readonly Named[];
  readonly comparisons: NestedComparisons;
  readonly control: number | null;
  readonly data: readonly NestedOneWayGroupData[];
  readonly droppedReplicates: readonly number[];
}

export interface NestedOneWayGroup extends Named {
  readonly nReplicates: number;
  readonly nValues: number;
  readonly mean: number;
  readonly dropped: number;
}

export interface NestedOneWayPair {
  readonly a: Named;
  readonly b: Named;
  readonly diff: number;
  readonly se: number;
  readonly df: number;
  readonly statistic: number;
  readonly ciLower: number;
  readonly ciUpper: number;
  readonly p: number;
}

export interface NestedOneWayResult {
  readonly groups: readonly NestedOneWayGroup[];
  readonly anova: {
    readonly f: number;
    readonly dfn: number;
    readonly dfd: number;
    readonly p: number;
  };
  readonly betweenReplicateSd: number;
  readonly withinReplicateSd: number;
  readonly comparisons: NestedComparisons;
  readonly pairs: readonly NestedOneWayPair[];
  readonly warnings: readonly string[];
}
