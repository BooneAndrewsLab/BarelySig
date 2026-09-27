/** The Friedman test with Dunn's comparisons (item 17, #50): request and result. */
import type { FriedmanOptions } from '@/model/project';

import type { Named } from '../ttest/types';

export interface FriedmanRequest {
  readonly groups: readonly Named[];
  readonly options: FriedmanOptions;
  /** Complete rows only (a value missing anywhere drops the whole row), subject-major. */
  readonly rows: readonly (readonly number[])[];
  /** The control's position among the groups (0-based), for comparisons with a control. */
  readonly control: number | null;
  /** Rows with a value missing in at least one chosen group. */
  readonly droppedRows: number;
}

export interface FriedmanGroup extends Named {
  readonly rankSum: number;
  readonly meanRank: number;
}

/** One of Dunn's comparisons, "A vs. B": diff = mean rank A − mean rank B. */
export interface DunnComparison {
  readonly a: Named;
  readonly b: Named;
  readonly diff: number;
  readonly z: number;
  readonly pUnadjusted: number;
  /** Multiplied by the number of comparisons and capped at 1, unless uncorrected. */
  readonly p: number;
}

export interface FriedmanResult {
  readonly groups: readonly FriedmanGroup[];
  /** Complete rows kept. */
  readonly n: number;
  readonly droppedRows: number;
  /** The chi-square approximation, with the standard tie correction. */
  readonly statistic: number;
  readonly df: number;
  /** Exact (counted over every way the ranks could be reassigned by row), or from the chi-square approximation. */
  readonly p: number;
  /** Whether P is exact: small tables, note 17's #82 section. */
  readonly exact: boolean;
  readonly comparisons: FriedmanOptions['comparisons'];
  readonly corrected: boolean;
  readonly pairs: readonly DunnComparison[];
  readonly warnings: readonly string[];
}
