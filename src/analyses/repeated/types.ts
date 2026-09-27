/** Repeated-measures one-way ANOVA (item 17, #50): request and result. */
import type { RepeatedMeasuresOptions } from '@/model/project';

import type { PairComparison } from '../oneway/types';
import type { Named } from '../ttest/types';

export interface RepeatedMeasuresRequest {
  readonly groups: readonly Named[];
  readonly options: RepeatedMeasuresOptions;
  /** Complete rows only (a value missing anywhere drops the whole row), subject-major. */
  readonly rows: readonly (readonly number[])[];
  /** The control's position among the groups (0-based), for comparisons with a control. */
  readonly control: number | null;
  /** Rows with a value missing in at least one chosen group. */
  readonly droppedRows: number;
}

export interface RepeatedMeasuresGroup extends Named {
  readonly mean: number;
}

export interface RepeatedMeasuresResult {
  readonly groups: readonly RepeatedMeasuresGroup[];
  /** Complete rows kept (the number of subjects). */
  readonly n: number;
  readonly droppedRows: number;
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
  /** Both 1.0 (and every P below identical) with exactly two treatments. */
  readonly ggEpsilon: number;
  readonly hfEpsilon: number;
  readonly ggP: number;
  readonly hfP: number;
  readonly comparisons: RepeatedMeasuresOptions['comparisons'];
  readonly pairs: readonly PairComparison[];
  readonly warnings: readonly string[];
}
