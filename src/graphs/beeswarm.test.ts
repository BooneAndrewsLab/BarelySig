import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { beeswarm } from './beeswarm';

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

  it('squeezes a swarm wider than its slot, and says so', () => {
    const s = beeswarm(Array<number>(30).fill(0), 4, 10);
    expect(s.squeezed).toBe(true);
    expect(Math.max(...s.offsets.map(Math.abs))).toBeCloseTo(10);
  });
});
