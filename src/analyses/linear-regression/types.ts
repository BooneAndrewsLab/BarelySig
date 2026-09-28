/**
 * Simple linear regression of an XY table's Y data sets against its
 * shared X (item 29, #38): request and result.
 */
import type { Named } from '../ttest/types';

export interface LinearRegressionRequest {
  readonly series: readonly Named[];
  /** Each series' (x, y) points, in whatever row order the table has them. */
  readonly points: readonly (readonly { readonly x: number; readonly y: number }[])[];
}

export interface Residual {
  readonly x: number;
  readonly y: number;
  readonly fitted: number;
  readonly residual: number;
}

/** The runs test for lack of fit, or why it couldn't run: too few signed residuals, or all one sign. */
export type RunsOutcome =
  | {
      readonly ran: true;
      readonly nRuns: number;
      readonly nPositive: number;
      readonly nNegative: number;
      readonly z: number;
      readonly p: number;
    }
  | {
      readonly ran: false;
      readonly why: 'few' | 'same';
      readonly nPositive: number;
      readonly nNegative: number;
    };

/**
 * The pointwise confidence/prediction band around a fit (#87): a fixed
 * 100-point grid across the series' observed X range, sharing one `fit`
 * value per grid point between both intervals.
 */
export interface RegressionBand {
  readonly x: readonly number[];
  readonly fit: readonly number[];
  readonly confidenceLower: readonly number[];
  readonly confidenceUpper: readonly number[];
  readonly predictionLower: readonly number[];
  readonly predictionUpper: readonly number[];
}

/** A series' regression, or why it couldn't run: too few points, or X has no variance. */
export type RegressionOutcome =
  | {
      readonly ran: true;
      readonly n: number;
      readonly slope: number;
      readonly slopeLower: number;
      readonly slopeUpper: number;
      readonly intercept: number;
      readonly interceptLower: number;
      readonly interceptUpper: number;
      readonly r2: number;
      readonly f: number;
      readonly dfNum: number;
      readonly dfDen: number;
      readonly p: number;
      readonly residuals: readonly Residual[];
      readonly runs: RunsOutcome;
      readonly band: RegressionBand;
    }
  | {
      readonly ran: false;
      readonly n: number;
      readonly why: 'few' | 'constant-x' | 'constant-y';
      readonly minimum: number | null;
    };

export interface LinearRegressionSeries extends Named {
  readonly outcome: RegressionOutcome;
}

export interface LinearRegressionResult {
  readonly series: readonly LinearRegressionSeries[];
  readonly warnings: readonly string[];
}
