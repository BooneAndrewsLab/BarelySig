import { describe, expect, it } from 'vitest';

import type { TTestResult } from '@/analyses/ttest/types';

import { tTestMethod, tTestReading } from './reading';

const base: TTestResult = {
  test: 'unpaired',
  tails: 'two',
  from: 'values',
  a: { id: 'a', title: 'WT', n: 5, mean: 3.2, sd: 1.9 },
  b: { id: 'b', title: 'KO', n: 5, mean: 5.6, sd: 2.4 },
  t: 3.162,
  df: 8,
  pTwo: 0.0021,
  pOne: 0.00105,
  p: 0.0021,
  difference: 2.4,
  seDifference: 0.76,
  ciLower: 0.65,
  ciUpper: 4.15,
  rSquared: 0.55,
  fTest: { f: 1.6, dfn: 4, dfd: 4, p: 0.66 },
  pairing: null,
  dropped: { a: null, b: null, rows: null },
  warnings: [],
};

describe('plain-language readings', () => {
  it('reads a significant unpaired result with the direction and how often chance would do it', () => {
    expect(tTestReading(base)).toBe(
      'The mean of KO is higher than the mean of WT (P = 0.0021). If the two groups truly had the same mean, a difference at least this large (in either direction) would turn up in about 0.2% of experiments like this one.',
    );
  });

  it('never calls a non-significant result "the same"', () => {
    const text = tTestReading({ ...base, p: 0.2345, pTwo: 0.2345, difference: -0.4 });
    expect(text).toMatch(
      /^There is no evidence that the means of WT and KO differ \(P = 0\.2345\)/,
    );
    expect(text).toContain('doesn’t show the means are the same');
    expect(text).toContain('would turn up in about 23% of experiments.');
  });

  it('adds the caveat to a one-tailed P', () => {
    const text = tTestReading({ ...base, tails: 'one', p: base.pOne });
    expect(text).toContain('a difference at least this large in that direction');
    expect(text).toContain(
      'only valid if you predicted, before collecting the data, that KO would be higher than WT',
    );
  });

  it('reads paired results within subjects', () => {
    const text = tTestReading({ ...base, test: 'paired', difference: -1.2, p: 1e-7 });
    expect(text).toMatch(/^KO is lower than WT within the same subjects \(P < 0\.0001\)/);
    expect(text).toContain('in fewer than 1 in 10,000 experiments like this one.');
  });

  it('names the test and its assumptions', () => {
    expect(tTestMethod(base)).toBe(
      'Unpaired t test, assuming both groups have the same SD, two-tailed.',
    );
    expect(tTestMethod({ ...base, test: 'welch', from: 'summary' })).toBe(
      'Welch’s unpaired t test (not assuming the two groups have the same SD), two-tailed. Computed from summary data (mean, SD and n).',
    );
  });
});
