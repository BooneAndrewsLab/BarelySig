/** Descriptive statistics (item 04, #16): request and result. */
import type { Dropped, GroupData } from '@/model/selectors';

export interface DescriptiveRequest {
  readonly groups: readonly {
    readonly id: string;
    readonly title: string;
    readonly data: GroupData;
  }[];
}

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

export interface DescriptiveResult {
  readonly groups: readonly DescribedGroup[];
  readonly warnings: readonly string[];
}
