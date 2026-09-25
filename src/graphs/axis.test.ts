import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { powerLabel, valueAxis } from './axis';

const texts = (a: ReturnType<typeof valueAxis>) => a.ticks.map((t) => t.text);

describe('valueAxis', () => {
  it('ticks a linear axis at the interval asked for, extending an automatic range to it', () => {
    const a = valueAxis(0, 103, { step: 25 }, 6);
    expect(a.domain).toEqual([0, 125]);
    expect(texts(a)).toEqual(['0', '25', '50', '75', '100', '125']);
  });

  it('writes the interval’s decimals, and the user’s when set', () => {
    expect(texts(valueAxis(0, 1, { step: 0.25 }, 6))).toEqual([
      '0.00',
      '0.25',
      '0.50',
      '0.75',
      '1.00',
    ]);
    expect(texts(valueAxis(0, 0.3, { step: 0.1 }, 6))).toEqual(['0.0', '0.1', '0.2', '0.3']);
    expect(texts(valueAxis(-2, 2, { decimals: 1 }, 5))).toContain('−2.0');
    expect(texts(valueAxis(-1, 1, { step: 0.5, decimals: 0 }, 5))).not.toContain('−0');
  });

  it('ignores an interval that would give too many ticks, and says so', () => {
    const a = valueAxis(0, 1000, { step: 0.001 }, 6);
    expect(a.ticks.length).toBeLessThan(20);
    expect(a.notes).toHaveLength(1);
  });

  it('keeps a fixed range as given', () => {
    const a = valueAxis(0, 103, { min: -10, max: 110 }, 6);
    expect(a.domain).toEqual([-10, 110]);
  });

  it('puts a log axis on whole decades, with minor ticks and powers of ten as labels', () => {
    const a = valueAxis(0.03, 450, { scale: 'log10' }, 6);
    expect(a.domain[0]).toBeCloseTo(0.01, 12);
    expect(a.domain[1]).toBeCloseTo(1000, 9);
    expect(texts(a)).toEqual(['0.01', '0.1', '1', '10', '100', '1000']);
    expect(a.minor).toHaveLength(8 * 5);
    expect(a.frac(0)).toBeNull();
    expect(a.frac(-1)).toBeNull();
    expect(a.frac(1)).toBeCloseTo(0.4, 12);
  });

  it('labels only some decades of a very wide log axis', () => {
    const a = valueAxis(1e-30, 1e30, { scale: 'log10' }, 6);
    expect(a.ticks.length).toBeLessThanOrEqual(11);
    expect(a.minor).toHaveLength(0);
  });

  it('writes powers of ten in full near 1 and with superscripts beyond', () => {
    expect([-5, -3, -1, 0, 2, 4, 5].map(powerLabel)).toEqual([
      '10⁻⁵',
      '0.001',
      '0.1',
      '1',
      '100',
      '10000',
      '10⁵',
    ]);
  });

  it('always gives an increasing range with ticks inside it', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.option(fc.double({ min: 1e-3, max: 1e5, noNaN: true }), { nil: undefined }),
        fc.boolean(),
        (x, y, step, log) => {
          const lo = log ? Math.abs(x) + 1e-3 : Math.min(x, y);
          const hi = log ? Math.abs(y) + 1e-3 : Math.max(x, y);
          const a = valueAxis(
            Math.min(lo, hi),
            Math.max(lo, hi),
            log ? { scale: 'log10' } : { step },
            6,
          );
          expect(a.domain[1]).toBeGreaterThan(a.domain[0]);
          expect(a.ticks.length).toBeLessThanOrEqual(51);
          for (const t of a.ticks) {
            const f = a.frac(t.v);
            expect(f).not.toBeNull();
            expect(f ?? 0).toBeGreaterThanOrEqual(-1e-6);
            expect(f ?? 0).toBeLessThanOrEqual(1 + 1e-6);
          }
        },
      ),
    );
  });
});
