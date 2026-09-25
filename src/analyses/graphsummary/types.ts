/** A graph's statistics (note 07, #31): request and result. */
import type { GraphSummaryOptions } from '@/model/project';
import type { GroupData } from '@/model/selectors';

import type { DescribedGroup } from '../descriptive/types';

export interface GraphSummaryRequest {
  /** The cells plotted: a Column table's data sets (a Grouped table's cells later). */
  readonly cells: readonly {
    readonly id: string;
    readonly title: string;
    readonly data: GroupData;
  }[];
  readonly options: GraphSummaryOptions;
}

export interface Kde {
  /** The bandwidth used (Silverman's rule × smoothing), in the values' units (log₁₀ units on a log axis). */
  readonly bw: number;
  /** Where the density was evaluated, smallest to largest value, in data units. */
  readonly y: readonly number[];
  readonly density: readonly number[];
}

export interface SummaryCell extends DescribedGroup {
  /** Box plots: where the whiskers end and the values beyond them, ascending. */
  readonly whiskers: {
    readonly low: number;
    readonly high: number;
    readonly beyond: readonly number[];
  } | null;
  /** Violins; null when there are fewer than 3 values or they are all the same. */
  readonly kde: Kde | null;
}

export interface GraphSummaryResult {
  readonly cells: readonly SummaryCell[];
  readonly warnings: readonly string[];
}
