/**
 * One-sentence readings of results for people without a statistics
 * background (item 04). They must stay correct: a P value is how often a
 * difference at least this large would turn up if there were truly none,
 * not the chance the result is "real", and a non-significant result is
 * no evidence of a difference, not evidence of none.
 */
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
