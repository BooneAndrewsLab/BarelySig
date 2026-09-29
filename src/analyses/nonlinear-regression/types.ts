/**
 * Nonlinear regression of an XY table's Y data sets (item 32, #37):
 * Prism's "log(agonist) vs. response — Variable slope" four-parameter
 * logistic, one fit per series. Request and result.
 */
import type { RegressionBand, Residual, RunsOutcome } from '../linear-regression/types';
import type { ParameterConstraint } from '@/model/project';
import type { Named } from '../ttest/types';

export interface NonlinearRegressionRequest {
  readonly series: readonly Named[];
  /** Each series' (x, y) points, X as entered in the table. */
  readonly points: readonly (readonly { readonly x: number; readonly y: number }[])[];
  /** X is already log10(dose) (Prism's model); otherwise a dose, fit against its log10. */
  readonly logX: boolean;
  /** Bottom, Top and HillSlope: estimated, held at a constant, or kept within limits (#96). */
  readonly constraints: {
    readonly bottom: ParameterConstraint;
    readonly top: ParameterConstraint;
    readonly hillSlope: ParameterConstraint;
  };
}

/**
 * A curve parameter: fitted, with its asymptotic 95% CI and Prism's
 * dependency; or held (`fixed` by the user, or `at-bound`: the best fit
 * inside the limits sits on one, so it is treated as fixed there), in which
 * case nothing about it was estimated and se, CI and dependency are null.
 */
export interface FitParameter {
  readonly value: number;
  readonly status: 'fitted' | 'fixed' | 'at-bound';
  readonly se: number | null;
  readonly lower: number | null;
  readonly upper: number | null;
  /** 1 − (SE with the other parameters fixed / SE)²; near 1 = the data barely pin this down. */
  readonly dependency: number | null;
  /** Dependency above 0.9999, Prism's "ambiguous" (shown with "~", CI "very wide"). */
  readonly ambiguous: boolean;
}

export type DoseResponseOutcome =
  | {
      readonly ran: true;
      /** Points fitted. */
      readonly n: number;
      /** Points left out because their dose was ≤ 0 (concentration X only). */
      readonly dropped: number;
      readonly bottom: FitParameter;
      readonly top: FitParameter;
      readonly logEc50: FitParameter;
      readonly hillSlope: FitParameter;
      readonly ec50: number;
      readonly ec50Lower: number;
      readonly ec50Upper: number;
      /** n − the parameters actually estimated (fixed and at-bound ones don't count). */
      readonly df: number;
      readonly ss: number;
      readonly syx: number;
      readonly r2: number;
      /** In the table's own X units, sorted by X. */
      readonly residuals: readonly Residual[];
      readonly runs: RunsOutcome;
      /** The curve and its bands, X in the table's own units. */
      readonly band: RegressionBand;
    }
  | {
      readonly ran: false;
      readonly n: number;
      readonly dropped: number;
      readonly why: 'few' | 'few-x' | 'constant-y' | 'no-fit';
      readonly minimum: number | null;
    };

export interface NonlinearRegressionSeries extends Named {
  readonly outcome: DoseResponseOutcome;
}

export interface NonlinearRegressionResult {
  readonly logX: boolean;
  readonly constraints: NonlinearRegressionRequest['constraints'];
  readonly series: readonly NonlinearRegressionSeries[];
  readonly warnings: readonly string[];
}
