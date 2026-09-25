import { describe, expect, it } from 'vitest';

import type { KruskalWallisResult } from '@/analyses/kruskal/types';
import type { NormalityResult } from '@/analyses/normality/types';
import type { OneWayResult } from '@/analyses/oneway/types';
import type { MannWhitneyResult, WilcoxonResult } from '@/analyses/ranktest/types';
import type { TTestResult } from '@/analyses/ttest/types';
import type { TwoWayResult } from '@/analyses/twoway/types';

import {
  kruskalMethod,
  kruskalReading,
  normalityReading,
  oneWayMethod,
  oneWayReading,
  rankTestMethod,
  rankTestReading,
  tTestMethod,
  tTestReading,
  twoWayMethod,
  twoWayReading,
} from './reading';

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

const mw: MannWhitneyResult = {
  test: 'mann-whitney',
  tails: 'two',
  a: { id: 'a', title: 'WT', median: 2 },
  b: { id: 'b', title: 'KO', median: 5 },
  exact: true,
  pTwo: 0.0043,
  pOne: 0.00215,
  p: 0.0043,
  hodgesLehmann: 3,
  ci: { lower: 1, upper: 5, level: 0.9524 },
  dropped: { a: null, b: null, rows: null },
  warnings: [],
  u: 1,
  nA: 6,
  nB: 6,
  rankSumA: 22,
  rankSumB: 56,
  meanRankA: 3.667,
  meanRankB: 9.333,
  difference: 3,
};

describe('rank-test readings', () => {
  it('says which group tends to be higher, not that the means differ', () => {
    expect(rankTestReading(mw)).toBe(
      'Values in KO tend to be higher than in WT (P = 0.0043). If both groups came from the same distribution, ranks at least this far apart (in either direction) would turn up in about 0.4% of experiments like this one.',
    );
    expect(rankTestMethod(mw)).toBe(
      'Mann-Whitney test (nonparametric, compares ranks), two-tailed, exact P value.',
    );
  });

  it('warns when so few values can never be significant', () => {
    const small = { ...mw, nA: 3, nB: 3, p: 0.1, pTwo: 0.1 };
    expect(rankTestReading(small)).toMatch(
      /There is no evidence .* With only 3 and 3 values, this test can’t give P < 0\.05 however different the groups are\.$/,
    );
    // 4 and 4: complete separation gives 2/70 < 0.05, so no warning.
    expect(rankTestReading({ ...small, nA: 4, nB: 4 })).not.toMatch(/can’t give/);
    const wx: WilcoxonResult = {
      ...mw,
      test: 'wilcoxon',
      zeros: 'wilcoxon',
      w: -15,
      sumPositive: 0,
      sumNegative: -15,
      pairs: 6,
      zeroPairs: 1,
      medianDifference: -2,
      pairing: null,
      p: 0.0625,
      pTwo: 0.0625,
    };
    expect(rankTestReading(wx)).toMatch(
      /^There is no evidence that WT and KO differ within subjects \(P = 0\.0625\).* With only 5 pairs that differ, this test can’t give P < 0\.05/,
    );
    expect(rankTestMethod(wx)).toMatch(
      /Pairs with no difference were left out \(Wilcoxon’s method\)\.$/,
    );
    expect(rankTestReading({ ...wx, p: 0.03, pTwo: 0.03, pairs: 7 })).toMatch(
      /^KO tends to be lower than WT within the same subjects \(P = 0\.0300\)/,
    );
  });
});

describe('one-way ANOVA readings', () => {
  const r = {
    from: 'values',
    welch: false,
    groups: [
      { id: 'a', title: 'WT' },
      { id: 'b', title: 'KO' },
      { id: 'c', title: 'Het' },
    ],
    anova: { p: 0.2 },
    welchAnova: null,
    comparisons: { kind: 'all', test: 'tukey' },
    pairs: [
      { a: { title: 'WT' }, b: { title: 'KO' }, p: 0.04 },
      { a: { title: 'WT' }, b: { title: 'Het' }, p: 0.5 },
      { a: { title: 'KO' }, b: { title: 'Het' }, p: 0.6 },
    ],
  } as unknown as OneWayResult;

  it('says when the ANOVA and a comparison disagree, never calling means the same', () => {
    expect(oneWayReading(r)).toBe(
      'There is no evidence that the means of the 3 groups differ (P = 0.2000). If they truly had the same mean, differences at least this large would turn up in about 20% of experiments. That doesn’t show the means are the same; the experiment may be too small to see a difference. Tukey’s comparisons: WT and KO (P = 0.0400) differ; the other 2 pairs show no evidence of a difference. The overall ANOVA and the comparisons ask different questions, so they can disagree near the threshold.',
    );
  });

  it('goes by Welch’s P when the SDs aren’t assumed equal, and names the method', () => {
    const w = {
      ...r,
      welch: true,
      welchAnova: { f: 9, dfn: 2, dfd: 5.1, p: 0.003 },
      comparisons: { kind: 'control', control: 'a', test: 'dunnett-t3' },
      pairs: [],
    } as unknown as OneWayResult;
    expect(oneWayReading(w)).toMatch(
      /^The means of the 3 groups are not all the same \(P = 0\.0030\)/,
    );
    expect(oneWayMethod(w)).toBe(
      'Welch’s and Brown-Forsythe ANOVA, not assuming the groups have the same SD. Dunnett’s T3 multiple comparisons (each group against the control), with P values adjusted for the number of comparisons.',
    );
  });
});

describe('Kruskal-Wallis readings', () => {
  const g = (title: string, n: number) => ({ id: title, title, n });
  const r = {
    groups: [g('WT', 2), g('KO', 2), g('Het', 2)],
    h: 4.57,
    df: 2,
    p: 0.1017,
    comparisons: { kind: 'all' },
    corrected: false,
    pairs: [{ a: { title: 'WT' }, b: { title: 'KO' }, p: 0.03 }],
  } as unknown as KruskalWallisResult;

  it('warns about tiny samples and unadjusted P values', () => {
    expect(kruskalReading(r)).toBe(
      'There is no evidence that the 3 groups differ (P = 0.1017). If all came from the same distribution, ranks at least this far apart would turn up in about 10% of experiments. That doesn’t show the groups are the same; the experiment may be too small to see a difference. With 7 values or fewer in all, this test can’t give P < 0.05 however different the groups are. Dunn’s comparisons: WT and KO (P = 0.0300) differ. The overall test and the comparisons ask different questions, so they can disagree near the threshold. These P values are not adjusted for the number of comparisons, so a “significant” pair is more likely to be chance.',
    );
    expect(kruskalMethod(r)).toBe(
      'Kruskal-Wallis test (nonparametric, compares ranks), approximate P value (chi-square). Dunn’s multiple comparisons (every pair of groups), not adjusted for the number of comparisons.',
    );
  });
});

describe('two-way ANOVA readings', () => {
  const term = (p: number) => ({ ss: 1, df: 1, ms: 1, f: 1, p, percent: 10 });
  const base = {
    from: 'values',
    model: 'main-effects',
    why: 'no-replicates',
    interaction: null,
    row: term(0.2),
    column: term(0.01),
    options: { family: 'main-columns', comparisons: { kind: 'all', test: 'tukey' } },
    families: [{ label: null, level: null, pairs: [{ p: 0.01 }, { p: 0.3 }, { p: 0.04 }] }],
  } as unknown as TwoWayResult;

  it('says when main effects only were fitted, and why', () => {
    expect(twoWayMethod(base)).toBe(
      'Two-way ANOVA, main effects only: with one value per cell an interaction can’t be estimated, so none is assumed (as Prism). Tukey’s multiple comparisons between data sets, averaged over rows, with P values adjusted within each family.',
    );
    expect(twoWayReading(base)).toBe(
      'There is no evidence that the rows, averaged over the data sets, differ (P = 0.2000). The data sets, averaged over the rows, differ (P = 0.0100). Tukey’s comparisons between data sets, averaged over rows: 2 of 3 pairs differ after adjusting for the number of comparisons.',
    );
  });
});

describe('normality readings', () => {
  const ran = (p: number) => ({ ran: true as const, w: 0.9, k2: 1, zSkewness: 0, zKurtosis: 0, p });
  const few = (limit: number) => ({ ran: false as const, why: 'few' as const, limit });
  const group = (title: string, sw: unknown, dp: unknown) => ({
    id: title,
    title,
    n: 9,
    dropped: null,
    shapiroWilk: sw,
    dagostino: dp,
  });

  it('names the groups that fail, and never calls a pass proof', () => {
    const r = {
      groups: [group('WT', ran(0.4), ran(0.3)), group('KO', ran(0.012), few(8))],
      warnings: [],
    } as unknown as NormalityResult;
    expect(normalityReading(r)).toMatch(
      /^The values of KO \(Shapiro-Wilk P = 0\.0120\) don’t look Gaussian \(P ≤ 0\.05\)\. Consider a nonparametric test .* A normality test can’t show that data are Gaussian/,
    );
    const ok = {
      groups: [group('WT', ran(0.4), ran(0.3))],
      warnings: [],
    } as unknown as NormalityResult;
    expect(normalityReading(ok)).toMatch(/^No group departs clearly from a Gaussian/);
  });

  it('says when every group is too small', () => {
    const r = { groups: [group('WT', few(3), few(8))], warnings: [] } as unknown as NormalityResult;
    expect(normalityReading(r)).toMatch(/^The groups are too small for normality tests/);
  });
});
