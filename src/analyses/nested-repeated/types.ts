/**
 * Matched nested one-way ANOVA (note 21, #71): note 14's matched nested t
 * test past two groups, feeding the replicate means to the
 * repeated-measures ANOVA (`repeated/types.ts`) rather than reimplementing
 * its statistics. Request and result mirror `repeated`'s, with nested
 * wording ("replicate", not "row" or "subject").
 */
import type { RepeatedMeasuresOptions } from '@/model/project';

import type { PairComparison } from '../oneway/types';

export interface Named {
  readonly id: string;
  readonly title: string;
}

export interface NestedRepeatedRequest {
  readonly groups: readonly Named[];
  readonly options: RepeatedMeasuresOptions;
  /** One row per matched replicate, each group's mean at that replicate; subject-major. */
  readonly rows: readonly (readonly number[])[];
  readonly control: number | null;
  /** Replicates with no usable value in any group: uninteresting, just counted. */
  readonly droppedReplicates: number;
  /** Replicates with a usable value in some groups but not every group: left out of all, named. */
  readonly unmatched: readonly string[];
}

export interface NestedRepeatedGroup extends Named {
  readonly mean: number;
}

export interface NestedRepeatedResult {
  readonly groups: readonly NestedRepeatedGroup[];
  /** Matched replicates kept (the number of rows the ANOVA ran on). */
  readonly n: number;
  readonly droppedReplicates: number;
  readonly unmatched: readonly string[];
  readonly anova: {
    readonly ssTreatment: number;
    readonly ssSubjects: number;
    readonly ssResidual: number;
    readonly ssTotal: number;
    readonly dfTreatment: number;
    readonly dfSubjects: number;
    readonly dfResidual: number;
    readonly dfTotal: number;
    readonly msTreatment: number;
    readonly msSubjects: number;
    readonly msResidual: number;
    readonly f: number;
    /** Uncorrected P. Prism's default is the Geisser-Greenhouse-corrected one, below. */
    readonly p: number;
    readonly rSquaredTreatment: number;
    readonly rSquaredSubjects: number;
  };
  /** Both 1.0 (and every P below identical) with exactly two groups. */
  readonly ggEpsilon: number;
  readonly hfEpsilon: number;
  readonly ggP: number;
  readonly hfP: number;
  readonly comparisons: RepeatedMeasuresOptions['comparisons'];
  readonly pairs: readonly PairComparison[];
  readonly warnings: readonly string[];
}
