/**
 * Nonlinear regression of an XY table's Y data sets (item 32, #37):
 * Prism's "log(agonist) vs. response — Variable slope" four-parameter
 * logistic, one fit per series. Request and result.
 */
import type { RegressionBand, Residual, RunsOutcome } from '../linear-regression/types';
import type {
  DoseResponseModelId,
  ParameterConstraint,
  SharedParameters,
  SimplerModel,
} from '@/model/project';
import type { Named } from '../ttest/types';

export interface NonlinearRegressionRequest {
  /** Which dose-response model (item 37, #95); it names the potency and holds some parameters. */
  readonly model: DoseResponseModelId;
  readonly series: readonly Named[];
  /** Each series' (x, y) points, X as entered in the table. */
  readonly points: readonly (readonly { readonly x: number; readonly y: number }[])[];
  /** X is already log10(dose) (Prism's model); otherwise a dose, fit against its log10. */
  readonly logX: boolean;
  /**
   * Bottom, Top and HillSlope as the fit uses them: estimated, held at a
   * constant, or kept within limits (#96); the model's own holds (a standard
   * slope, a normalized response) are already in here as `fixed`.
   */
  readonly constraints: {
    readonly bottom: ParameterConstraint;
    readonly top: ParameterConstraint;
    readonly hillSlope: ParameterConstraint;
  };
  /** The simpler model to compare each fit with (item 36, #98), or null. */
  readonly compare: SimplerModel | null;
  /**
   * Parameters shared by every data set (item 38, #97), one stacked fit; all
   * false for independent fits (also whenever there is only one data set).
   */
  readonly shared: SharedParameters;
}

/**
 * A fit compared with the simpler model that holds some of its parameters
 * (item 36, #98): the extra sum-of-squares F test and AICc. Either half can
 * be unavailable (`ok: false`) without the other.
 */
export interface ModelComparison {
  /** The simpler model's own best-fit values. */
  readonly simpler: {
    readonly bottom: number;
    readonly top: number;
    readonly logEc50: number;
    readonly hillSlope: number;
    readonly ec50: number;
    readonly ss: number;
    readonly df: number;
  };
  readonly fTest:
    | {
        readonly ok: true;
        readonly f: number;
        /** Extra parameters the fit estimates: simpler df − fit df. */
        readonly dfNumerator: number;
        readonly dfDenominator: number;
        readonly p: number;
      }
    | { readonly ok: false; readonly why: 'exact-fit' | 'no-extra' };
  readonly aicc:
    | {
        readonly ok: true;
        readonly fit: number;
        readonly simpler: number;
        /** Chance (0 to 1) that the fit, not the simpler model, is the better one. */
        readonly probabilityFit: number;
        readonly probabilitySimpler: number;
      }
    | { readonly ok: false };
}

/** Why a comparison could not be made for a data set (its fit itself is fine). */
export type ComparisonOutcome =
  | ({ readonly ran: true } & ModelComparison)
  | { readonly ran: false; readonly why: 'no-fit' | 'worse' };

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
      /** Named EC50 or IC50 by the model; the numbers are the same. */
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
      /** The comparison with the simpler model, when one was asked for. */
      readonly comparison: ComparisonOutcome | null;
    }
  | {
      readonly ran: false;
      readonly n: number;
      readonly dropped: number;
      readonly why: 'few' | 'few-x' | 'constant-y' | 'no-fit';
      readonly minimum: number | null;
    };

/**
 * The whole of a global fit (item 38, #97), which no single data set owns:
 * what an extra sum-of-squares comparison of two global fits needs (#105).
 * A data set's own `ss` and `n` are in its outcome.
 */
export interface GlobalFit {
  /** Points fitted across all the data sets. */
  readonly n: number;
  /** Parameters estimated: a shared one counts once, an unshared one once per data set. */
  readonly parameters: number;
  /** n − parameters. */
  readonly df: number;
  readonly ss: number;
  readonly syx: number;
}

export interface NonlinearRegressionSeries extends Named {
  readonly outcome: DoseResponseOutcome;
}

export interface NonlinearRegressionResult {
  readonly model: DoseResponseModelId;
  readonly logX: boolean;
  readonly constraints: NonlinearRegressionRequest['constraints'];
  readonly compare: SimplerModel | null;
  readonly shared: SharedParameters;
  /** The stacked fit's totals when parameters were shared and the fit ran; else null. */
  readonly global: GlobalFit | null;
  readonly series: readonly NonlinearRegressionSeries[];
  readonly warnings: readonly string[];
}
