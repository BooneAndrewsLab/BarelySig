import { describe, expect, it } from 'vitest';

import { loadFixtures, mismatches } from './fixtures';

describe('mismatches', () => {
  it('accepts numbers within relative tolerance', () => {
    expect(mismatches(1.0000001, 1, 1e-6)).toEqual([]);
    expect(mismatches(1.00001, 1, 1e-6)).toHaveLength(1);
  });

  it('keeps very small p-values honest', () => {
    // 0 against 1.7e-18 is a 100 % error, whatever the absolute difference.
    expect(mismatches(0, 1.7e-18, 1e-6)).toHaveLength(1);
    expect(mismatches(1.7000001e-18, 1.7e-18, 1e-6)).toEqual([]);
  });

  it('compares an expected 0 absolutely', () => {
    expect(mismatches(1e-9, 0, 1e-6)).toEqual([]);
    expect(mismatches(1e-3, 0, 1e-6)).toHaveLength(1);
  });

  it('tells missing (null) from zero and from NaN', () => {
    expect(mismatches(0, null, 1e-6)).toHaveLength(1);
    expect(mismatches(null, 0, 1e-6)).toHaveLength(1);
    expect(mismatches(Number.NaN, Number.NaN, 1e-6)).toEqual([]);
    expect(mismatches(null, Number.NaN, 1e-6)).toHaveLength(1);
    expect(mismatches(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 1e-6)).toEqual([]);
  });

  it('walks arrays and objects, naming the path', () => {
    expect(mismatches({ ci: [1, 2.1] }, { ci: [1, 2] }, 1e-6)).toEqual([
      '$.ci[1]: expected 2, got 2.1 (relative error 5.00e-2)',
    ]);
    expect(mismatches({ p: 0.5 }, { p: 0.5, t: 1 }, 1e-6)).toEqual(['$.t: missing']);
    expect(mismatches({ p: 0.5, extra: 1 }, { p: 0.5 }, 1e-6)).toEqual([]);
    expect(mismatches([1], [1, 2], 1e-6)).toHaveLength(1);
  });
});

describe('loadFixtures', () => {
  it('reads the t-test fixtures with their empty cells', () => {
    const missing = loadFixtures('ttest').find((f) => f.id === 'ttest/unpaired-missing');
    expect(missing?.input['a']).toEqual([1, 2, null, 4, 6]);
    expect(missing?.reference.r).toMatch(/^R version 4\.6\.0/);
  });
});
