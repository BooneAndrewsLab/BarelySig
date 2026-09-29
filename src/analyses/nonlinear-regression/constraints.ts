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

/** The first problem with the options’ constraints, or null. */
export function optionsProblem(
  o: Pick<NonlinearRegressionOptions, 'bottom' | 'top' | 'hillSlope'>,
): string | null {
  return (
    constraintProblem(o.bottom, 'Bottom', false) ??
    constraintProblem(o.top, 'Top', false) ??
    constraintProblem(o.hillSlope, 'HillSlope', true)
  );
}
