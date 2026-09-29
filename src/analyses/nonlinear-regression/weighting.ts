/**
 * Weights for the dose-response fit (item 40, #100): which points count how
 * much, worked out from the table. 1/Y and 1/Y² weights depend on the fitted
 * curve, so they are not here; the engine iterates them (`yPower`).
 */
import type { Id } from '@/model/ids';
import type { NonlinearRegressionOptions, WeightingId } from '@/model/project';
import { xyRowSummaries, xySeries } from '@/model/selectors';
import type { XyTable } from '@/model/table';

export const WEIGHTING_LABELS: Readonly<Record<WeightingId, string>> = {
  none: 'None (every point counts the same)',
  y: '1/Y (for counts: the scatter grows with the signal)',
  y2: '1/Y² (relative: the scatter is a constant percent of the signal)',
  x: '1/X (points at low X count more)',
  x2: '1/X² (points at low X count much more)',
  sd2: '1/SD² of the replicates at each X (fits the mean at each X)',
};

/** 1 or 2 for weights from the fitted curve (1/Y, 1/Y²), else 0. */
export function yPower(w: WeightingId): 0 | 1 | 2 {
  return w === 'y' ? 1 : w === 'y2' ? 2 : 0;
}

/**
 * Why the weighting can't go with the rest of the options, in words; null when fine.
 * A comparison of two fits needs both on the same footing: weights from each
 * fitted curve would differ between the fits and their sums of squares
 * could not be compared.
 */
export function weightingProblem(
  o: Pick<NonlinearRegressionOptions, 'weighting' | 'compare' | 'compareWith'>,
): string | null {
  if (yPower(o.weighting) > 0 && (o.compare !== null || o.compareWith !== null)) {
    return '1/Y and 1/Y² weights come from each fitted curve, so two fits would be weighted differently and their sums of squares could not be compared. Choose another weighting (none, 1/X, 1/X² or 1/SD²), or turn the comparison off.';
  }
  return null;
}

export interface WeightedSeries {
  readonly id: Id;
  readonly title: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  /** One weight per point (all 1 unless the weighting is 1/X, 1/X² or 1/SD²). */
  readonly weights: readonly number[];
}

export type WeightedData =
  | { readonly ok: true; readonly series: readonly WeightedSeries[] }
  | { readonly ok: false; readonly reason: string };

/** Each chosen data set's points and their weights, or why the weighting can't be applied. */
export function weightedSeries(
  table: XyTable,
  dataSets: readonly Id[],
  weighting: WeightingId,
  logX: boolean,
): WeightedData {
  if (weighting === 'sd2') {
    const out: WeightedSeries[] = [];
    for (const s of xyRowSummaries(table, dataSets)) {
      const points: { x: number; y: number }[] = [];
      const weights: number[] = [];
      for (const r of s.rows) {
        if (r.sd === null) {
          return {
            ok: false,
            reason: `"${s.title}" has no SD at X = ${String(r.x)}: weighting by 1/SD² needs at least two replicates at every X, or a table that gives the SD (or SEM, or CV).`,
          };
        }
        if (!(r.sd > 0)) {
          return {
            ok: false,
            reason: `"${s.title}" has an SD of 0 at X = ${String(r.x)} (identical replicates), which would give that point an infinite weight. Choose another weighting.`,
          };
        }
        points.push({ x: r.x, y: r.mean });
        weights.push(1 / (r.sd * r.sd));
      }
      out.push({ id: s.id, title: s.title, points, weights });
    }
    return { ok: true, series: out };
  }
  const power = weighting === 'x' ? 1 : weighting === 'x2' ? 2 : 0;
  const out: WeightedSeries[] = [];
  for (const s of xySeries(table, dataSets)) {
    const points = s.points.map((p) => ({ x: p.x, y: p.y }));
    if (power > 0) {
      // A dose of 0 or less is left out of a concentration fit anyway; it has no weight to give.
      const bad = points.find((p) => (logX || p.x > 0) && !(p.x > 0));
      if (bad) {
        return {
          ok: false,
          reason: `Weighting by 1/X needs X above 0, but "${s.title}" has X = ${String(bad.x)}${logX ? ' (your X are log doses, so 1/X is not meaningful; choose another weighting)' : ''}.`,
        };
      }
    }
    out.push({
      id: s.id,
      title: s.title,
      points,
      weights: points.map((p) => (power === 0 ? 1 : p.x > 0 ? p.x ** -power : 1)),
    });
  }
  return { ok: true, series: out };
}
