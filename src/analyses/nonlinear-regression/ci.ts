/**
 * Which kind of 95% CI a nonlinear regression can give (item 41, #99): the
 * profile-likelihood CIs are for independent fits with no limits and no
 * parameter-dependent weights; anything else keeps the asymptotic ones, and
 * the results say why.
 */
import type { CiMethod } from '@/model/project';

import { anyShared } from './constraints';
import type { NonlinearRegressionRequest } from './types';

/** Why profile CIs were asked for but not used. */
export type CiFallback = 'shared' | 'y-weights' | 'limits';

type Basis = Pick<
  NonlinearRegressionRequest,
  'ci' | 'shared' | 'alternative' | 'weighting' | 'constraints'
>;

/** What stops profile CIs for these settings (null when nothing does or none were asked for). */
export function ciFallback(r: Basis): CiFallback | null {
  if (r.ci !== 'profile') return null;
  // The stacked fit is also used when only the comparison's other fit shares (note 39).
  if (anyShared(r.shared) || (r.alternative !== null && anyShared(r.alternative.shared))) {
    return 'shared';
  }
  if (r.weighting === 'y' || r.weighting === 'y2') return 'y-weights';
  const { bottom, top, hillSlope } = r.constraints;
  if ([bottom, top, hillSlope].some((c) => c.kind === 'bounded')) return 'limits';
  return null;
}

/** The kind of CI the engine will compute. */
export const ciUsed = (r: Basis): CiMethod =>
  r.ci === 'profile' && ciFallback(r) === null ? 'profile' : 'wald';

export const CI_FALLBACK_SHORT: Readonly<Record<CiFallback, string>> = {
  shared: 'when data sets are fitted together',
  'y-weights': 'with 1/Y or 1/Y² weights',
  limits: 'when a parameter is kept within limits',
};

export const CI_FALLBACK_TEXT: Readonly<Record<CiFallback, string>> = {
  shared:
    'Profile-likelihood CIs are not available when data sets are fitted together (shared parameters), so the CIs are asymptotic.',
  'y-weights':
    'Profile-likelihood CIs are not available with 1/Y or 1/Y² weights (the weights change with the curve), so the CIs are asymptotic.',
  limits:
    'Profile-likelihood CIs are not available when a parameter is kept within limits, so the CIs are asymptotic. Holding it at one value is fine.',
};
