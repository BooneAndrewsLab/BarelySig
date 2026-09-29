/**
 * A standard-slope dose-response fit that runs the wrong way (item 37,
 * #108): an agonist fit (HillSlope = +1) of falling data, or an inhibitor
 * fit (HillSlope = −1) of rising data. The slope is held, so the fit can
 * only run the wrong way by putting Bottom above Top (or, for a normalized
 * model whose plateaus are held, by fitting a curve the data don't follow).
 * It is not an error, so the results get a line pointing at the other model.
 */
import { doseResponseModel } from './models';
import type { DoseResponseModelId } from '@/model/project';
import type { DoseResponseOutcome } from './types';

/** Sign of the correlation of Y with X: +1 rising, −1 falling, 0 flat or too few points. */
function trend(points: readonly { readonly x: number; readonly y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const c = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  return Math.sign(c);
}

/** The model of the opposite direction, same shape otherwise. */
function otherDirection(id: DoseResponseModelId): DoseResponseModelId {
  return (
    id.includes('agonist') ? id.replace('agonist', 'inhibitor') : id.replace('inhibitor', 'agonist')
  ) as DoseResponseModelId;
}

/** The warning for one data set, or null when its fit runs the right way (or is not a standard-slope one). */
export function wrongWayWarning(
  model: DoseResponseModelId,
  title: string,
  points: readonly { readonly x: number; readonly y: number }[],
  outcome: DoseResponseOutcome,
): string | null {
  const m = doseResponseModel(model);
  if (m.hillSlope === null || !outcome.ran) return null;
  const normalized = m.bottom !== null && m.top !== null;
  const falling = normalized
    ? trend(points) === (m.inhibitor ? 1 : -1)
    : outcome.top.value < outcome.bottom.value;
  if (!falling) return null;
  const other = doseResponseModel(otherDirection(model));
  return (
    `${title}: this ${m.shortLabel} fit runs the wrong way. The data ` +
    `${m.inhibitor ? 'rise' : 'fall'} with dose, but the slope is held at ${m.hillSlope < 0 ? '−1' : '1'}, ` +
    `so the curve ${normalized ? 'cannot follow them' : 'has Bottom above Top'}. ` +
    `Try "${other.label}" instead.`
  );
}
