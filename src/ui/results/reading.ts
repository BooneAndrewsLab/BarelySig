/**
 * One-sentence readings of results for people without a statistics
 * background (item 04). They must stay correct: a P value is how often a
 * difference at least this large would turn up if there were truly none,
 * not the chance the result is "real", and a non-significant result is
 * no evidence of a difference, not evidence of none.
 */
import type { RankTestResult } from '@/analyses/ranktest/types';
import type { TTestResult } from '@/analyses/ttest/types';

import { howOften, pPhrase } from './format';

export function tTestMethod(r: TTestResult): string {
  const tails = r.tails === 'two' ? 'two-tailed' : 'one-tailed';
  const base =
    r.test === 'paired'
      ? `Paired t test, ${tails}.`
      : r.test === 'welch'
        ? `Welch’s unpaired t test (not assuming the two groups have the same SD), ${tails}.`
        : `Unpaired t test, assuming both groups have the same SD, ${tails}.`;
  return r.from === 'summary' ? `${base} Computed from summary data (mean, SD and n).` : base;
}

export function tTestReading(r: TTestResult): string {
  const A = r.a.title;
  const B = r.b.title;
  const higher = r.difference > 0 ? 'higher' : 'lower';
  const either = r.tails === 'two' ? ' (in either direction)' : ' in that direction';
  const often = howOften(r.p);
  const p = pPhrase(r.p);
  let text: string;
  if (r.p < 0.05) {
    text =
      r.test === 'paired'
        ? `${B} is ${higher} than ${A} within the same subjects (${p}). If there were truly no difference, an average difference at least this large${either} would turn up in ${often} like this one.`
        : `The mean of ${B} is ${higher} than the mean of ${A} (${p}). If the two groups truly had the same mean, a difference at least this large${either} would turn up in ${often} like this one.`;
  } else {
    text =
      r.test === 'paired'
        ? `There is no evidence that ${A} and ${B} differ within subjects (${p}). With no true difference, an average difference at least this large${either} would turn up in ${often}. That doesn’t show there is no difference; the experiment may be too small to see one.`
        : `There is no evidence that the means of ${A} and ${B} differ (${p}). If they truly had the same mean, a difference at least this large${either} would turn up in ${often}. That doesn’t show the means are the same; the experiment may be too small to see a difference.`;
  }
  if (r.tails === 'one') {
    text += ` A one-tailed P is only valid if you predicted, before collecting the data, that ${B} would be ${higher} than ${A}.`;
  }
  return text;
}

export function rankTestMethod(r: RankTestResult): string {
  const tails = r.tails === 'two' ? 'two-tailed' : 'one-tailed';
  const how = r.exact ? 'exact P value' : 'approximate P value (normal approximation)';
  if (r.test === 'mann-whitney')
    return `Mann-Whitney test (nonparametric, compares ranks), ${tails}, ${how}.`;
  const zeros =
    r.zeroPairs === 0
      ? ''
      : r.zeros === 'pratt'
        ? ' Pairs with no difference were ranked but counted for neither side (Pratt’s method).'
        : ' Pairs with no difference were left out (Wilcoxon’s method).';
  return `Wilcoxon matched-pairs signed-rank test (nonparametric), ${tails}, ${how}.${zeros}`;
}

/**
 * The smallest two-tailed P the test can give with this many values, when
 * it is not below 0.05: then no result can be significant, however large
 * the difference (Prism says so for Mann-Whitney with 7 values or fewer).
 */
function floorNote(r: RankTestResult): string {
  if (r.test === 'mann-whitney') {
    // Complete separation: 2 / choose(n, m) (one-tailed: half).
    let c = 1;
    for (let i = 1; i <= Math.min(r.nA, r.nB); i += 1) c = (c * (r.nA + r.nB - i + 1)) / i;
    const floor = (r.tails === 'two' ? 2 : 1) / c;
    return floor >= 0.05
      ? ` With only ${String(r.nA)} and ${String(r.nB)} values, this test can’t give P < 0.05 however different the groups are.`
      : '';
  }
  // Pairs with no difference never get a sign, by either method.
  const n = r.pairs - r.zeroPairs;
  const floor = (r.tails === 'two' ? 2 : 1) / 2 ** n;
  return floor >= 0.05
    ? ` With only ${String(n)} ${n === 1 ? 'pair' : 'pairs'} that differ, this test can’t give P < 0.05 however large the differences are.`
    : '';
}

export function rankTestReading(r: RankTestResult): string {
  const A = r.a.title;
  const B = r.b.title;
  const up = r.test === 'mann-whitney' ? r.meanRankB > r.meanRankA : r.w > 0;
  const higher = up ? 'higher' : 'lower';
  const either = r.tails === 'two' ? ' (in either direction)' : ' in that direction';
  const often = howOften(r.p);
  const p = pPhrase(r.p);
  let text: string;
  if (r.p < 0.05) {
    text =
      r.test === 'wilcoxon'
        ? `${B} tends to be ${higher} than ${A} within the same subjects (${p}). If there were truly no difference, differences at least this consistent${either} would turn up in ${often} like this one.`
        : `Values in ${B} tend to be ${higher} than in ${A} (${p}). If both groups came from the same distribution, ranks at least this far apart${either} would turn up in ${often} like this one.`;
  } else {
    text =
      r.test === 'wilcoxon'
        ? `There is no evidence that ${A} and ${B} differ within subjects (${p}). With no true difference, differences at least this consistent${either} would turn up in ${often}. That doesn’t show there is no difference; the experiment may be too small to see one.`
        : `There is no evidence that values in ${A} and ${B} differ (${p}). If both came from the same distribution, ranks at least this far apart${either} would turn up in ${often}. That doesn’t show the groups are the same; the experiment may be too small to see a difference.`;
  }
  text += floorNote(r);
  if (r.tails === 'one') {
    text += ` A one-tailed P is only valid if you predicted, before collecting the data, that ${B} would be ${higher} than ${A}.`;
  }
  return text;
}
