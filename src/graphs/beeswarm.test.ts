import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { beeswarm } from './beeswarm';

/** The first implementation, checking every point against every other: the reference. */
function reference(ys: readonly number[], diameter: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const placed: { x: number; y: number }[] = [];
  const offsets = new Array<number>(ys.length).fill(0);
  const eps = diameter * 1e-9;
  const side = (x: number) =>
    x === 0 ? 0 : placed.filter((p) => Math.sign(p.x) === Math.sign(x)).length;
  for (const { y, i } of order) {
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
      .sort((a, b) => Math.abs(a) - Math.abs(b) || side(a) - side(b) || a - b);
    const x = candidates[0] ?? 0;
    placed.push({ x, y });
    offsets[i] = x;
  }
  return offsets;
}

describe('beeswarm', () => {
  it('keeps one point, and well-separated points, on the centre line', () => {
    expect(beeswarm([5], 4, 20).offsets).toEqual([0]);
    expect(beeswarm([0, 10, 20], 4, 20).offsets).toEqual([0, 0, 0]);
  });

  it('spreads equal values side by side, alternating', () => {
    const { offsets } = beeswarm([1, 1, 1], 4, 20);
    expect([...offsets].sort((a, b) => a - b)).toEqual([-4, 0, 4]);
  });

  it('never overlaps two points unless it had to squeeze, and is deterministic', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 60, noNaN: true }), { maxLength: 40 }),
        (ys) => {
          const d = 4;
          const s = beeswarm(ys, d, 1000);
          expect(s.squeezed).toBe(false);
          for (let i = 0; i < ys.length; i += 1) {
            for (let j = i + 1; j < ys.length; j += 1) {
              const dx = (s.offsets[i] ?? 0) - (s.offsets[j] ?? 0);
              const dy = (ys[i] ?? 0) - (ys[j] ?? 0);
              expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(d * (1 - 1e-6));
            }
          }
          expect(beeswarm(ys, d, 1000)).toEqual(s);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('places every point where the first implementation did', () => {
    const value = fc.oneof(
      fc.double({ min: 0, max: 30, noNaN: true }),
      // Ties and near-ties, the dense case.
      fc.integer({ min: 0, max: 12 }).map((n) => n / 2),
    );
    fc.assert(
      fc.property(fc.array(value, { maxLength: 80 }), fc.constantFrom(1, 4, 4.4), (ys, d) => {
        expect(beeswarm(ys, d, 1e9).offsets).toEqual(reference(ys, d));
      }),
      { numRuns: 400 },
    );
  });

  it('lays out thousands of close values quickly', () => {
    // 3,650 values in a narrow band froze the page (#60's file): the
    // first implementation was cubic.
    const ys = Array.from({ length: 3650 }, (_, i) => 250 + 40 * Math.sin(i * 7.3) ** 3);
    const t = performance.now();
    beeswarm(ys, 4.4, 30);
    expect(performance.now() - t).toBeLessThan(2000);
  });

  it('squeezes a swarm wider than its slot, and says so', () => {
    const s = beeswarm(Array<number>(30).fill(0), 4, 10);
    expect(s.squeezed).toBe(true);
    expect(Math.max(...s.offsets.map(Math.abs))).toBeCloseTo(10);
  });
});
