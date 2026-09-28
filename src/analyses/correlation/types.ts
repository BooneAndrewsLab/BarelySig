/**
 * Pearson or Spearman correlation of an XY table's Y data sets against
 * its shared X (item 29, #38): request and result.
 */
import type { Named } from '../ttest/types';

export type CorrelationMethod = 'pearson' | 'spearman';

export interface CorrelationRequest {
  readonly method: CorrelationMethod;
  readonly series: readonly Named[];
  readonly points: readonly (readonly { readonly x: number; readonly y: number }[])[];
}

/** A series' correlation, or why it couldn't run: too few points (below 3, both methods). */
export type CorrelationOutcome =
  | {
      readonly ran: true;
      readonly n: number;
      /** Pearson's r, or Spearman's rho. */
      readonly r: number;
      /** Pearson only (Fisher z-transform); null for Spearman. */
      readonly lower: number | null;
      readonly upper: number | null;
      readonly statistic: number;
      /** Pearson's t test df; null for Spearman (its S statistic has none). */
      readonly df: number | null;
      readonly p: number;
      /** Spearman only: whether R used the exact algorithm (null for Pearson, always exact). */
      readonly exact: boolean | null;
      /** Spearman only: whether x or y has a tied value, which rules out the exact P. */
      readonly ties: boolean | null;
    }
  | {
      readonly ran: false;
      readonly n: number;
      readonly why: 'few' | 'constant';
      readonly minimum: number | null;
    };

export interface CorrelationSeries extends Named {
  readonly outcome: CorrelationOutcome;
}

export interface CorrelationResult {
  readonly method: CorrelationMethod;
  readonly series: readonly CorrelationSeries[];
  readonly warnings: readonly string[];
}
