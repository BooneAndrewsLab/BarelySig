import { describe, expect, it } from 'vitest';

import { fromR } from './convert';

const dbl = (values: (number | null)[], names: (string | null)[] | null = null) => ({
  type: 'double',
  names,
  values,
});

describe('fromR', () => {
  it('unboxes length-1 vectors, as jsonlite auto_unbox does', () => {
    expect(fromR(dbl([0.5]))).toBe(0.5);
    expect(fromR(dbl([1, 2]))).toEqual([1, 2]);
  });

  it('keeps NA as null and NaN as NaN', () => {
    expect(fromR(dbl([1, null, Number.NaN]))).toEqual([1, null, Number.NaN]);
  });

  it('turns fully named vectors and lists into objects', () => {
    expect(fromR(dbl([1, 2], ['lower', 'upper']))).toEqual({ lower: 1, upper: 2 });
    expect(fromR({ type: 'list', names: ['p', 'ci'], values: [dbl([0.01]), dbl([1, 2])] })).toEqual(
      { p: 0.01, ci: [1, 2] },
    );
  });

  it('keeps partly named vectors positional', () => {
    expect(fromR(dbl([1, 2], ['a', '']))).toEqual([1, 2]);
  });

  it('maps NULL to null and rejects what results never hold', () => {
    expect(fromR({ type: 'null' })).toBeNull();
    expect(() => fromR({ type: 'closure', names: null, values: [] })).toThrow(/unsupported/);
  });
});
