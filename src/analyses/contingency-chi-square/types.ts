/** Chi-square test of independence on a Contingency table (item 28, #39). */
import type { Named } from '../ttest/types';

export interface ContingencyRequest {
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  /** Row-major: `counts[r * columns.length + c]`. */
  readonly counts: readonly number[];
  readonly nrow: number;
  readonly ncol: number;
}

export interface ContingencyChiSquareResult {
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  /** Row-major counts, as analysed: `counts[r][c]`. */
  readonly counts: readonly (readonly number[])[];
  readonly n: number;
  readonly chiSq: number;
  readonly df: number;
  readonly p: number;
  /** Yates' continuity correction, which R applies only to a 2×2 table. */
  readonly corrected: boolean;
  /** Any expected count under 5 (the traditional threshold this project surfaces). */
  readonly lowExpected: boolean;
  readonly warnings: readonly string[];
}
