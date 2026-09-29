/**
 * Constraints on the dose-response curve's parameters (item 35, #96): what
 * makes one unusable, in words, and how many parameters it leaves to
 * estimate. Shared by the fit's `prepare` and the Analyze dialog, so the
 * dialog can say so before anything runs.
 */
import type {
  NonlinearRegressionOptions,
  ParameterConstraint,
  SharedParameters,
} from '@/model/project';

import { effectiveConstraints } from './models';

/** Why one parameter's constraint can't be used, in words; null when it is fine. */
export function constraintProblem(
  c: ParameterConstraint,
  what: string,
  isHillSlope: boolean,
): string | null {
  if (c.kind === 'fixed') {
    if (!Number.isFinite(c.value)) return `Type the number to hold ${what} at.`;
    if (isHillSlope && c.value === 0) {
      return 'A HillSlope of 0 makes the curve a flat line halfway between Bottom and Top, with no EC50 to find. Hold it at another value, or leave it free.';
    }
  }
  if (c.kind === 'bounded') {
    const { lower, upper } = c;
    if (lower === null && upper === null) {
      return `Type a lower or an upper limit for ${what}, or leave it free.`;
    }
    if (
      (lower !== null && !Number.isFinite(lower)) ||
      (upper !== null && !Number.isFinite(upper))
    ) {
      return `The limits on ${what} must be numbers.`;
    }
    if (lower !== null && upper !== null && lower >= upper) {
      return `${what}’s lower limit must be below its upper limit.`;
    }
  }
  return null;
}

/**
 * What makes the simpler model of a comparison (#98) unusable, in words; null
 * when it is fine. It holds parameters the fit estimates freely, so it is
 * always a special case of the fit (the F test needs that).
 */
export function comparisonProblem(
  o: Pick<NonlinearRegressionOptions, 'model' | 'bottom' | 'top' | 'hillSlope' | 'compare'>,
): string | null {
  const c = o.compare;
  if (c === null) return null;
  const fit = effectiveConstraints(o);
  const held = (
    [
      ['bottom', 'Bottom'],
      ['top', 'Top'],
      ['hillSlope', 'HillSlope'],
    ] as const
  ).filter(([k]) => c[k] !== null);
  if (held.length === 0) {
    return 'Choose at least one parameter to hold at a constant in the simpler model, or turn the comparison off.';
  }
  for (const [k, name] of held) {
    const v = c[k];
    if (v === null || !Number.isFinite(v)) return `Type the number to hold ${name} at.`;
    if (k === 'hillSlope' && v === 0) {
      return 'A HillSlope of 0 makes the curve a flat line with no EC50 to find. Hold it at another value.';
    }
    if (fit[k].kind !== 'free') {
      return `${name} is already held or limited in the fit itself. The simpler model can only hold a parameter that the fit estimates.`;
    }
  }
  if (held.length === 3) {
    return 'The simpler model would hold Bottom, Top and HillSlope, leaving only the EC50 to estimate. Free at least one of them in the simpler model.';
  }
  return null;
}

export const anyShared = (s: SharedParameters): boolean =>
  s.bottom || s.top || s.hillSlope || s.logEc50;

/**
 * What the fit shares between `dataSets` data sets: what was ticked when
 * there are two or more, nothing for one (item 38, #97).
 */
export function effectiveShared(s: SharedParameters, dataSets: number): SharedParameters {
  return dataSets >= 2 ? s : { bottom: false, top: false, hillSlope: false, logEc50: false };
}

/**
 * What makes sharing parameters unusable with the rest of the options, in
 * words; null when it is fine. Limits and the comparison with a simpler
 * model are not combined with sharing (note 38).
 */
export function sharingProblem(
  o: Pick<
    NonlinearRegressionOptions,
    'model' | 'bottom' | 'top' | 'hillSlope' | 'compare' | 'shared'
  >,
  dataSets: number,
): string | null {
  if (!anyShared(effectiveShared(o.shared, dataSets))) return null;
  const fit = effectiveConstraints(o);
  if (Object.values(fit).some((c) => c.kind === 'bounded')) {
    return 'Limits on a parameter can’t be combined with sharing parameters between data sets yet. Hold the parameter at a value, or leave it free, or turn sharing off.';
  }
  if (o.compare !== null) {
    return 'The comparison with a simpler model can’t be combined with sharing parameters between data sets. Turn one of them off.';
  }
  return null;
}

/** The first problem with the options’ constraints, sharing or comparison, or null. */
export function optionsProblem(
  o: Pick<
    NonlinearRegressionOptions,
    'model' | 'bottom' | 'top' | 'hillSlope' | 'compare' | 'shared'
  >,
  dataSets = 2,
): string | null {
  const fit = effectiveConstraints(o);
  return (
    constraintProblem(fit.bottom, 'Bottom', false) ??
    constraintProblem(fit.top, 'Top', false) ??
    constraintProblem(fit.hillSlope, 'HillSlope', true) ??
    sharingProblem(o, dataSets) ??
    comparisonProblem(o)
  );
}
