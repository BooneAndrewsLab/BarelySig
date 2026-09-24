/**
 * Beeswarm layout (note 05), seaborn's swarm algorithm: points are placed
 * in order of value, each at the horizontal offset closest to the centre
 * that doesn't overlap any point already placed. Deterministic: the same
 * values always give the same picture.
 */

export interface Swarm {
  /** Horizontal offset of each input point from the centre, in the same units as `diameter`. */
  readonly offsets: readonly number[];
  /** True when the swarm was wider than `maxHalfWidth` and was squeezed (points may then touch). */
  readonly squeezed: boolean;
}

/**
 * @param ys vertical positions (same units as `diameter`), in input order
 * @param diameter point diameter plus any gap wanted between points
 * @param maxHalfWidth how far from the centre points may go
 */
export function beeswarm(ys: readonly number[], diameter: number, maxHalfWidth: number): Swarm {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const placed: { x: number; y: number }[] = [];
  const offsets = new Array<number>(ys.length).fill(0);
  const eps = diameter * 1e-9;
  for (const { y, i } of order) {
    // Intervals of x where this point would overlap one already placed.
    const blocked: [number, number][] = [];
    for (const p of placed) {
      const dy = Math.abs(p.y - y);
      if (dy >= diameter) continue;
      const half = Math.sqrt(diameter * diameter - dy * dy);
      blocked.push([p.x - half, p.x + half]);
    }
    const free = (x: number) => blocked.every(([lo, hi]) => x <= lo + eps || x >= hi - eps);
    const candidates = [0, ...blocked.flatMap(([lo, hi]) => [lo, hi])]
      .filter(free)
      // Closest to the centre; on a tie, the side with fewer points so far.
      .sort((a, b) => Math.abs(a) - Math.abs(b) || side(a, placed) - side(b, placed) || a - b);
    const x = candidates[0] ?? 0;
    placed.push({ x, y });
    offsets[i] = x;
  }
  const widest = Math.max(0, ...offsets.map(Math.abs));
  if (widest <= maxHalfWidth || widest === 0) return { offsets, squeezed: false };
  const k = maxHalfWidth / widest;
  return { offsets: offsets.map((x) => x * k), squeezed: true };
}

function side(x: number, placed: readonly { x: number }[]): number {
  if (x === 0) return 0;
  return placed.filter((p) => Math.sign(p.x) === Math.sign(x)).length;
}
