/**
 * Constraints on the dose-response curve's parameters (item 35, #96): what
 * makes one unusable, in words, and how many parameters it leaves to
 * estimate. Shared by the fit's `prepare` and the Analyze dialog, so the
 * dialog can say so before anything runs.
 */
import type {
  ComparisonWith,
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
    return 'The comparison with a simpler model that holds values can’t be combined with sharing parameters between data sets. Turn one of them off.';
  }
  return null;
}

type Held = 'bottom' | 'top' | 'hillSlope';

/** How a parameter enters a fit, for deciding whether one model is a special case of another. */
type Flex =
  | { readonly rank: 0; readonly value: number }
  | { readonly rank: 1 }
  | { readonly rank: 2; readonly limits: ParameterConstraint };

function flex(c: ParameterConstraint | null, shared: boolean): Flex {
  if (c?.kind === 'fixed') return { rank: 0, value: c.value };
  if (shared) return { rank: 1 };
  return { rank: 2, limits: c ?? { kind: 'free' } };
}

const sameLimits = (a: ParameterConstraint, b: ParameterConstraint): boolean =>
  a.kind === b.kind &&
  (a.kind !== 'bounded' || (b.kind === 'bounded' && a.lower === b.lower && a.upper === b.upper));

/** Whether the value `v` is allowed by the limits of a parameter (any value is when it is free). */
function within(v: number, c: ParameterConstraint): boolean {
  return (
    c.kind !== 'bounded' ||
    ((c.lower === null || v >= c.lower) && (c.upper === null || v <= c.upper))
  );
}

/** Whether `a` is no more flexible than `b` in this parameter, in the way that makes `a` a special case of `b`. */
function specialCase(a: Flex, b: Flex): boolean {
  if (a.rank > b.rank) return false;
  if (a.rank === 0 && b.rank === 2) return within(a.value, b.limits);
  if (a.rank < b.rank) return true;
  if (a.rank === 0 && b.rank === 0) return a.value === b.value;
  if (a.rank === 2 && b.rank === 2) return sameLimits(a.limits, b.limits);
  return true;
}

/** What the other fit of a comparison with a different model or sharing is (item 39, #105). */
export interface AlternativeFit {
  readonly model: NonlinearRegressionOptions['model'];
  readonly constraints: Record<Held, ParameterConstraint>;
  readonly shared: SharedParameters;
  /**
   * `alternative-simpler`: the other fit is a special case of this one;
   * `alternative-complex`: this one is a special case of the other;
   * `not-nested`: neither (only AICc applies).
   */
  readonly relation: 'alternative-simpler' | 'alternative-complex' | 'not-nested';
}

const SHARED_KEYS = ['bottom', 'top', 'hillSlope', 'logEc50'] as const;

/**
 * The other fit of a comparison with a different model or with the tested
 * parameters unshared (#105), or a plain-language reason it can’t be made.
 * The nesting is decided here, from the constraints and the sharing, not by
 * the optimiser; `null` when nothing is compared this way.
 */
export function alternativeFit(
  o: Pick<
    NonlinearRegressionOptions,
    'model' | 'bottom' | 'top' | 'hillSlope' | 'compare' | 'compareWith' | 'shared'
  >,
  dataSets: number,
): AlternativeFit | string | null {
  const w: ComparisonWith | null = o.compareWith;
  if (w === null) return null;
  if (o.compare !== null) {
    return 'Choose one comparison: with a simpler model that holds values, or with a different model or sharing, not both.';
  }
  const conf = effectiveConstraints(o);
  const shared = effectiveShared(o.shared, dataSets);
  let altModel = o.model;
  let altConstraints = conf;
  let altShared = shared;
  if (w.kind === 'model') {
    altModel = w.model;
    altConstraints = effectiveConstraints({ ...o, model: w.model });
  } else {
    if (dataSets < 2) {
      return 'Comparing shared with separate values needs two or more data sets. Choose more Y data sets, or compare something else.';
    }
    const tested = SHARED_KEYS.filter((k) => w.test[k]);
    if (tested.length === 0) {
      return 'Choose which shared parameter to ask about: whether its value differs between the data sets.';
    }
    for (const k of tested) {
      const held = k === 'logEc50' ? false : conf[k].kind === 'fixed';
      if (!shared[k] || held) {
        return 'Only a parameter you share between the data sets (and don’t hold at a constant) can be tested for a difference between them.';
      }
    }
    altShared = {
      bottom: shared.bottom && !w.test.bottom,
      top: shared.top && !w.test.top,
      hillSlope: shared.hillSlope && !w.test.hillSlope,
      logEc50: shared.logEc50 && !w.test.logEc50,
    };
  }
  const alt = { model: altModel, constraints: altConstraints, shared: altShared };
  const state = (c: Record<Held, ParameterConstraint>, s: SharedParameters) => [
    flex(c.bottom, s.bottom),
    flex(c.top, s.top),
    flex(null, s.logEc50),
    flex(c.hillSlope, s.hillSlope),
  ];
  const a = state(conf, shared);
  const b = state(altConstraints, altShared);
  const inside = (p: readonly Flex[], q: readonly Flex[]): boolean =>
    p.every((f, i) => {
      const g = q[i];
      return g !== undefined && specialCase(f, g);
    });
  const altInConf = inside(b, a);
  const confInAlt = inside(a, b);
  if (altInConf && confInAlt) {
    return 'These two models estimate the same things, so they give the same curve and there is nothing to compare. Choose a model that holds or estimates a different parameter (for example a standard slope against a variable one).';
  }
  return {
    ...alt,
    relation: altInConf ? 'alternative-simpler' : confInAlt ? 'alternative-complex' : 'not-nested',
  };
}

/** What makes the comparison with another model or sharing (#105) or its alpha unusable, in words; null when fine. */
export function comparisonWithProblem(
  o: Pick<
    NonlinearRegressionOptions,
    'model' | 'bottom' | 'top' | 'hillSlope' | 'compare' | 'compareWith' | 'compareAlpha' | 'shared'
  >,
  dataSets: number,
): string | null {
  if (o.compareWith === null && o.compare === null) return null;
  if (!(o.compareAlpha > 0 && o.compareAlpha < 1)) {
    return 'Alpha must be a number between 0 and 1 (0.05 is the usual choice).';
  }
  const alt = alternativeFit(o, dataSets);
  return typeof alt === 'string' ? alt : null;
}

/** The first problem with the options’ constraints, sharing or comparison, or null. */
export function optionsProblem(
  o: Pick<
    NonlinearRegressionOptions,
    'model' | 'bottom' | 'top' | 'hillSlope' | 'compare' | 'compareWith' | 'compareAlpha' | 'shared'
  >,
  dataSets = 2,
): string | null {
  const fit = effectiveConstraints(o);
  return (
    constraintProblem(fit.bottom, 'Bottom', false) ??
    constraintProblem(fit.top, 'Top', false) ??
    constraintProblem(fit.hillSlope, 'HillSlope', true) ??
    sharingProblem(o, dataSets) ??
    comparisonProblem(o) ??
    comparisonWithProblem(o, dataSets)
  );
}
