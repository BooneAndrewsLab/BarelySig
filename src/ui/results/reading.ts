/**
 * One-sentence readings of results for people without a statistics
 * background (item 04). They must stay correct: a P value is how often a
 * difference at least this large would turn up if there were truly none,
 * not the chance the result is "real", and a non-significant result is
 * no evidence of a difference, not evidence of none.
 */
import type { KruskalWallisResult } from '@/analyses/kruskal/types';
import type { NormalityResult } from '@/analyses/normality/types';
import type { OneWayResult } from '@/analyses/oneway/types';
import type { RankTestResult } from '@/analyses/ranktest/types';
import type { TwoWayResult } from '@/analyses/twoway/types';
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

/** "Tukey’s", "Dunnett’s T3": the comparison test's name, as a possessive. */
export const COMPARISON_TEST: Readonly<Record<string, string>> = {
  tukey: 'Tukey’s',
  dunnett: 'Dunnett’s',
  bonferroni: 'Bonferroni’s',
  sidak: 'Šidák’s',
  'games-howell': 'Games-Howell’s',
  'dunnett-t3': 'Dunnett’s T3',
  'tamhane-t2': 'Tamhane’s T2',
};

/** The P a one-way reading goes by: Welch's when the SDs aren't assumed equal. */
export const oneWayP = (r: OneWayResult): number => r.welchAnova?.p ?? r.anova.p;

export function oneWayMethod(r: OneWayResult): string {
  const anova = r.welch
    ? 'Welch’s and Brown-Forsythe ANOVA, not assuming the groups have the same SD'
    : 'Ordinary one-way ANOVA, assuming all groups have the same SD';
  const c = r.comparisons;
  const comps =
    c.kind === 'none'
      ? ''
      : ` ${COMPARISON_TEST[c.test] ?? c.test} multiple comparisons (${c.kind === 'all' ? 'every pair of groups' : 'each group against the control'}), with P values adjusted for the number of comparisons.`;
  const from = r.from === 'summary' ? ' Computed from summary data (mean, SD and n).' : '';
  return `${anova}.${comps}${from}`;
}

const joinAnd = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1] ?? ''}`;

/** How the comparisons read, after the overall sentence (one-way ANOVA and Kruskal-Wallis). */
function comparisonsText(
  p: number,
  name: string,
  pairs: readonly {
    readonly a: { readonly title: string };
    readonly b: { readonly title: string };
    readonly p: number;
  }[],
  adjusted: boolean,
  overall = 'overall test',
): string {
  if (pairs.length === 0) return '';
  const sig = pairs.filter((c) => c.p < 0.05);
  const after = adjusted ? ' after adjusting for the number of comparisons' : '';
  if (sig.length === 0) {
    let text = ` ${name} comparisons find no pair that differs${after}.`;
    if (p < 0.05)
      text +=
        ' That can happen when the difference is spread over several groups rather than between two.';
    return text;
  }
  const rest = pairs.length - sig.length;
  let text = ` ${name} comparisons: ${joinAnd(sig.map((c) => `${c.a.title} and ${c.b.title} (${pPhrase(c.p)})`))} differ`;
  text +=
    rest === 0
      ? '.'
      : `; the other ${rest === 1 ? 'pair shows' : `${String(rest)} pairs show`} no evidence of a difference.`;
  if (p >= 0.05)
    text += ` The ${overall} and the comparisons ask different questions, so they can disagree near the threshold.`;
  if (!adjusted)
    text +=
      ' These P values are not adjusted for the number of comparisons, so a “significant” pair is more likely to be chance.';
  return text;
}

export function kruskalMethod(r: KruskalWallisResult): string {
  const c = r.comparisons;
  const comps =
    c.kind === 'none'
      ? ''
      : ` Dunn’s multiple comparisons (${c.kind === 'all' ? 'every pair of groups' : 'each group against the control'}), ${r.corrected ? 'each P multiplied by the number of comparisons' : 'not adjusted for the number of comparisons'}.`;
  return `Kruskal-Wallis test (nonparametric, compares ranks), approximate P value (chi-square).${comps}`;
}

export function kruskalReading(r: KruskalWallisResult): string {
  const phrase = pPhrase(r.p);
  const often = howOften(r.p);
  const k = String(r.groups.length);
  let text =
    r.p < 0.05
      ? `The ${k} groups don’t all have the same distribution (${phrase}): values in at least one tend to be higher or lower than in the others. If all came from the same distribution, ranks at least this far apart would turn up in ${often} like this one.`
      : `There is no evidence that the ${k} groups differ (${phrase}). If all came from the same distribution, ranks at least this far apart would turn up in ${often}. That doesn’t show the groups are the same; the experiment may be too small to see a difference.`;
  if (r.groups.reduce((n, g) => n + g.n, 0) <= 7)
    text +=
      ' With 7 values or fewer in all, this test can’t give P < 0.05 however different the groups are.';
  return text + comparisonsText(r.p, 'Dunn’s', r.pairs, r.corrected);
}

export function oneWayReading(r: OneWayResult): string {
  const p = oneWayP(r);
  const phrase = pPhrase(p);
  const often = howOften(p);
  const k = String(r.groups.length);
  let text =
    p < 0.05
      ? `The means of the ${k} groups are not all the same (${phrase}): at least one differs from the others. If all groups truly had the same mean, differences at least this large would turn up in ${often} like this one.`
      : `There is no evidence that the means of the ${k} groups differ (${phrase}). If they truly had the same mean, differences at least this large would turn up in ${often}. That doesn’t show the means are the same; the experiment may be too small to see a difference.`;
  if (r.comparisons.kind !== 'none') {
    const name = COMPARISON_TEST[r.comparisons.test] ?? r.comparisons.test;
    text += comparisonsText(p, name, r.pairs, true, 'overall ANOVA');
  }
  return text;
}

const FAMILY_TEXT: Readonly<Record<string, string>> = {
  'within-rows': 'within each row',
  'within-columns': 'within each data set',
  'main-columns': 'between data sets, averaged over rows',
  'main-rows': 'between rows, averaged over data sets',
  'all-cells': 'between every pair of cells',
};

export function twoWayMethod(r: TwoWayResult): string {
  const model =
    r.model === 'full'
      ? 'Two-way ANOVA with interaction, Type III sums of squares'
      : r.why === 'no-replicates'
        ? 'Two-way ANOVA, main effects only: with one value per cell an interaction can’t be estimated, so none is assumed (as Prism)'
        : 'Two-way ANOVA, main effects only: a cell has no values, so the model with interaction can’t be fitted (as Prism)';
  const c = r.options.comparisons;
  const comps =
    c.kind === 'none'
      ? ''
      : ` ${COMPARISON_TEST[c.test] ?? c.test} multiple comparisons ${FAMILY_TEXT[r.options.family] ?? ''}${c.kind === 'control' ? ' against the control' : ''}, with P values adjusted within each family.`;
  const from = r.from === 'summary' ? ' Computed from summary data (mean, SD and n).' : '';
  return `${model}.${comps}${from}`;
}

export function twoWayReading(r: TwoWayResult): string {
  const parts: string[] = [];
  if (r.interaction) {
    const p = r.interaction.p;
    parts.push(
      p < 0.05
        ? `How the data sets differ depends on the row (interaction ${pPhrase(p)}): one factor’s effect isn’t the same at every level of the other, so the main effects below are hard to read on their own; look at the comparisons within rows or data sets.`
        : `There is no evidence that the data sets’ effect depends on the row (interaction ${pPhrase(p)}), so the two factors can be read one at a time.`,
    );
  }
  const effect = (p: number, what: string) =>
    p < 0.05
      ? `The ${what} differ (${pPhrase(p)}).`
      : `There is no evidence that the ${what} differ (${pPhrase(p)}).`;
  parts.push(effect(r.row.p, 'rows, averaged over the data sets,'));
  parts.push(effect(r.column.p, 'data sets, averaged over the rows,'));
  const c = r.options.comparisons;
  const pairs = r.families.flatMap((f) => f.pairs);
  if (c.kind !== 'none' && pairs.length > 0) {
    const sig = pairs.filter((x) => x.p < 0.05).length;
    parts.push(
      `${COMPARISON_TEST[c.test] ?? c.test} comparisons ${FAMILY_TEXT[r.options.family] ?? ''}: ${String(sig)} of ${String(pairs.length)} ${pairs.length === 1 ? 'pair differs' : 'pairs differ'} after adjusting for the number of comparisons.`,
    );
  }
  return parts.join(' ');
}

/**
 * Normality tests, read so that "passed" is never taken as proof (Prism's
 * guide: with small samples they have little power; with large ones they
 * flag departures that don't matter).
 */
export function normalityReading(r: NormalityResult): string {
  const failed: string[] = [];
  let ran = 0;
  for (const g of r.groups) {
    const tests = [
      ...(g.dagostino.ran ? [['D’Agostino-Pearson', g.dagostino.p] as const] : []),
      ...(g.shapiroWilk.ran ? [['Shapiro-Wilk', g.shapiroWilk.p] as const] : []),
    ];
    ran += tests.length;
    const bad = tests.filter(([, p]) => p <= 0.05);
    if (bad.length > 0)
      failed.push(`${g.title} (${bad.map(([name, p]) => `${name} ${pPhrase(p)}`).join(', ')})`);
  }
  if (ran === 0) {
    return 'The groups are too small for normality tests: Shapiro-Wilk needs at least 3 values and D’Agostino-Pearson 8. Decide from what is known about this kind of measurement.';
  }
  const caution =
    ' A normality test can’t show that data are Gaussian: with few values it rarely flags anything, and with many it flags departures too small to matter for a t test or ANOVA. Base the choice mostly on what you know about this kind of measurement.';
  if (failed.length === 0) {
    return `No group departs clearly from a Gaussian (bell-shaped) distribution by these tests (P > 0.05 for each).${caution}`;
  }
  return `The values of ${joinAnd(failed)} don’t look Gaussian (P ≤ 0.05). Consider a nonparametric test (Mann-Whitney, Wilcoxon, Kruskal-Wallis), or transforming the values first (e.g. a log for values that vary by fold changes).${caution}`;
}
