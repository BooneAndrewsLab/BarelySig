import { describe, expect, it } from 'vitest';

import { tQuantile } from './tdist';

// Reference values from R 4.6: qt(p, df).
const R: readonly (readonly [number, number, number])[] = [
  [0.975, 1, 12.7062047361747],
  [0.975, 2, 4.30265272974946],
  [0.975, 3, 3.18244630528371],
  [0.975, 4, 2.77644510519779],
  [0.975, 5, 2.57058183563631],
  [0.975, 9, 2.2621571627982],
  [0.975, 10, 2.22813885198627],
  [0.975, 29, 2.0452296421327],
  [0.975, 99, 1.98421695158642],
  [0.975, 1000, 1.96233908082641],
  [0.995, 1, 63.6567411628715],
  [0.995, 5, 4.03214298355523],
  [0.995, 29, 2.7563859036706],
];

describe('tQuantile', () => {
  it.each(R)('p = %f, df = %i matches R qt to 1e-6', (p, df, expected) => {
    expect(Math.abs(tQuantile(p, df) - expected) / expected).toBeLessThan(1e-6);
  });
  it('refuses what is undefined', () => {
    expect(tQuantile(0.975, 0)).toBeNaN();
    expect(tQuantile(1, 5)).toBeNaN();
    expect(tQuantile(0.3, 5)).toBeNaN();
  });
});
