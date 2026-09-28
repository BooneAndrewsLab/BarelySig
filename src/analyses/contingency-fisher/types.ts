/** Fisher's exact test on a Contingency table (item 28, #39). */
import type { Named } from '../ttest/types';

export interface ContingencyRequest {
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  /** Row-major: `counts[r * columns.length + c]`. */
  readonly counts: readonly number[];
  readonly nrow: number;
  readonly ncol: number;
}

export interface ContingencyFisherResult {
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  /** Row-major counts, as analysed: `counts[r][c]`. */
  readonly counts: readonly (readonly number[])[];
  readonly n: number;
  /** Two-tailed always (R's default `alternative = "two.sided"`; no option offered). */
  readonly p: number;
  /** Only for a 2×2 table: R gives no estimate for a larger one. */
  readonly oddsRatio: number | null;
  readonly oddsRatioLower: number | null;
  readonly oddsRatioUpper: number | null;
  readonly warnings: readonly string[];
}
