/**
 * Constraints on the dose-response curve's parameters (item 35, #96): what
 * makes one unusable, in words, and how many parameters it leaves to
 * estimate. Shared by the fit's `prepare` and the Analyze dialog, so the
 * dialog can say so before anything runs.
 */
import type { NonlinearRegressionOptions, ParameterConstraint } from '@/model/project';

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
  o: Pick<NonlinearRegressionOptions, 'bottom' | 'top' | 'hillSlope' | 'compare'>,
): string | null {
  const c = o.compare;
  if (c === null) return null;
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
    if (o[k].kind !== 'free') {
      return `${name} is already held or limited in the fit itself. The simpler model can only hold a parameter that the fit estimates.`;
    }
  }
  if (held.length === 3) {
    return 'The simpler model would hold Bottom, Top and HillSlope, leaving only the EC50 to estimate. Free at least one of them in the simpler model.';
  }
  return null;
}

/** The first problem with the options’ constraints or comparison, or null. */
export function optionsProblem(
  o: Pick<NonlinearRegressionOptions, 'bottom' | 'top' | 'hillSlope' | 'compare'>,
): string | null {
  return (
    constraintProblem(o.bottom, 'Bottom', false) ??
    constraintProblem(o.top, 'Top', false) ??
    constraintProblem(o.hillSlope, 'HillSlope', true) ??
    comparisonProblem(o)
  );
}
