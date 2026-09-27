/** Descriptive statistics (item 04, #16; Grouped tables item 18, #54): request and result. */
import type { Dropped, GroupData, RawGroupData } from '@/model/selectors';

import type { Named } from '../ttest/types';

export interface DescriptiveColumnRequest {
  readonly kind: 'column';
  readonly groups: readonly {
    readonly id: string;
    readonly title: string;
    readonly data: GroupData;
  }[];
}

export interface DescriptiveGroupedRequest {
  readonly kind: 'grouped';
  /** Row-factor levels, in table order. */
  readonly rows: readonly Named[];
  /** Column-factor levels (the table's data sets). */
  readonly columns: readonly Named[];
  /** `cells[r][c]`: row r, data set c. */
  readonly cells: readonly (readonly GroupData[])[];
  /**
   * Each data set's values pooled over every row, one per column; `null`
   * for a summary-format table, from which a pooled group's percentiles
   * can't be recovered (note 18).
   */
  readonly pooled: readonly RawGroupData[] | null;
}

export type DescriptiveRequest = DescriptiveColumnRequest | DescriptiveGroupedRequest;

/**
 * One group's statistics. `null` means not available: undefined for these
 * values (SD of one value) or not computable from what was entered
 * (percentiles of summary data). `from` says which.
 */
export interface DescribedGroup {
  readonly id: string;
  readonly title: string;
  readonly from: 'values' | 'summary';
  readonly n: number | null;
  readonly dropped: Dropped | null;
  readonly min: number | null;
  readonly q1: number | null;
  readonly median: number | null;
  readonly q3: number | null;
  readonly max: number | null;
  readonly range: number | null;
  readonly mean: number | null;
  readonly sd: number | null;
  readonly sem: number | null;
  readonly ciLower: number | null;
  readonly ciUpper: number | null;
  readonly cv: number | null;
  readonly geomean: number | null;
  readonly sum: number | null;
}

export type DescriptiveResult =
  | {
      readonly kind: 'column';
      readonly groups: readonly DescribedGroup[];
      readonly warnings: readonly string[];
    }
  | {
      readonly kind: 'grouped';
      readonly rows: readonly Named[];
      readonly columns: readonly Named[];
      readonly cells: readonly (readonly DescribedGroup[])[];
      readonly pooled: readonly DescribedGroup[] | null;
      readonly warnings: readonly string[];
    };
