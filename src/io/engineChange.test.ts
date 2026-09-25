import { describe, expect, it } from 'vitest';

import type { Json } from '@/model/json';

import { changedNumbers, engineDiffers, shown } from './engineChange';

describe('comparing results across engines (#46)', () => {
  const tTest = (p: number, t = 2.5): Json => ({
    a: { id: 'x', title: 'WT', mean: 1.5 },
    b: { id: 'y', title: 'KO', mean: 3 },
    t,
    df: 8,
    p,
    warnings: ['Ties'],
  });

  it('finds nothing within the fixtures’ tolerance, and ignores text', () => {
    expect(changedNumbers(tTest(0.0213), tTest(0.0213 * (1 + 5e-7)))).toEqual([]);
    expect(changedNumbers(tTest(0.0213), { ...(tTest(0.0213) as object), warnings: [] })).toEqual(
      [],
    );
  });

  it('names what changed, by group and comparison', () => {
    expect(changedNumbers(tTest(0.0213), tTest(0.0214, 2.6))).toEqual([
      { what: 't', old: 2.5, now: 2.6 },
      { what: 'P', old: 0.0213, now: 0.0214 },
    ]);
    const post = (p: number): Json => ({
      pairs: [{ a: { title: 'WT' }, b: { title: 'KO' }, p, pUnadjusted: 0.01 }],
    });
    expect(changedNumbers(post(0.03), post(0.04))).toEqual([
      { what: 'WT vs. KO: P', old: 0.03, now: 0.04 },
    ]);
  });

  it('keeps tiny P values honest, and counts a number that appeared or went away', () => {
    expect(changedNumbers({ p: 1e-18 }, { p: 0 })).toEqual([{ what: 'P', old: 1e-18, now: 0 }]);
    expect(changedNumbers({ p: 0 }, { p: 1e-7 })).toEqual([]);
    expect(changedNumbers({ sd: null }, { sd: 1.2 })).toEqual([
      { what: 'SD', old: null, now: 1.2 },
    ]);
  });

  it('reports a changed long vector (a violin’s density) once', () => {
    const d = Array.from({ length: 64 }, (_, i) => i / 64);
    const e = d.map((x, i) => (i === 10 ? x * 1.01 : x));
    expect(changedNumbers({ kde: { density: d } }, { kde: { density: e } })).toEqual([
      { what: 'violin: density', old: null, now: null },
    ]);
  });

  it('tells engines apart whatever the key order', () => {
    const a = { webr: '0.6.0', r: '4.6.0', packages: { a: '1', b: '2' } };
    expect(engineDiffers(a, { r: '4.6.0', webr: '0.6.0', packages: { b: '2', a: '1' } })).toBe(
      false,
    );
    expect(engineDiffers(a, { ...a, packages: { a: '1', b: '3' } })).toBe(true);
    expect(shown(0.02140000001)).toBe('0.0214');
    expect(shown(3e-12)).toBe('3.000000e-12');
  });
});
