/**
 * Growth curve analysis of an XY table's Y data sets (item 33, #94):
 * Zwietering's reparameterized Gompertz growth model, fit one series at a
 * time, with lag/exponential/stationary phases read off the fit. Request
 * and result.
 */
import type { RegressionBand, Residual, RunsOutcome } from '../linear-regression/types';
import type { Named } from '../ttest/types';

export interface GrowthCurveRequest {
  readonly series: readonly Named[];
  /** Each series' (time, Y) points, X as entered in the table. */
  readonly points: readonly (readonly { readonly x: number; readonly y: number }[])[];
}

/** A fitted or derived quantity with its asymptotic 95% CI. */
export interface FitQuantity {
  readonly value: number;
  readonly se: number;
  readonly lower: number;
  readonly upper: number;
}

export type GrowthCurveOutcome =
  | {
      readonly ran: true;
      readonly n: number;
      readonly asymptote: FitQuantity;
      readonly growthRate: FitQuantity;
      readonly lag: FitQuantity;
      /** ln 2 / growth rate, by the delta method. */
      readonly doublingTime: FitQuantity;
      /** Where the tangent at the steepest point reaches the asymptote: lag + asymptote / growth rate. */
      readonly exponentialEnd: FitQuantity;
      readonly df: number;
      readonly ss: number;
      readonly syx: number;
      readonly r2: number;
      /** In the table's own X (time) units, sorted by X. */
      readonly residuals: readonly Residual[];
      readonly runs: RunsOutcome;
      /** The curve and its bands, X in the table's own time units. */
      readonly band: RegressionBand;
    }
  | {
      readonly ran: false;
      readonly n: number;
      readonly why: 'few' | 'few-t' | 'constant-y' | 'no-fit';
      readonly minimum: number | null;
    };

export interface GrowthCurveSeries extends Named {
  readonly outcome: GrowthCurveOutcome;
}

export interface GrowthCurveResult {
  readonly series: readonly GrowthCurveSeries[];
  readonly warnings: readonly string[];
}
