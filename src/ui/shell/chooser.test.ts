import { describe, expect, it } from 'vitest';

import { type ChooserAnswers, rankTestCanBeSignificant, suggest } from './chooser';

const column = (sizes: readonly number[], summary = false) => ({
  tableType: 'column' as const,
  summary,
  sizes,
});
const nested = (sizes: readonly number[]) => ({
  tableType: 'nested' as const,
  summary: false,
  sizes,
});
const ans = (matched: boolean | null, gaussian: ChooserAnswers['gaussian']): ChooserAnswers => ({
  matched,
  gaussian,
});
const pick = (s: ReturnType<typeof suggest>) =>
  s.kind === 'test' ? [s.spec.kind, s.name] : s.kind === 'ask' ? ['ask', s.question] : ['none'];

describe('which test?', () => {
  it('asks about matching, then about the distribution', () => {
    expect(pick(suggest(ans(null, null), column([6, 6])))).toEqual(['ask', 'matched']);
    expect(pick(suggest(ans(false, null), column([6, 6])))).toEqual(['ask', 'gaussian']);
  });

  it('suggests the classic tests for two groups and more', () => {
    expect(pick(suggest(ans(false, 'yes'), column([6, 6])))).toEqual(['t-test', 'Unpaired t test']);
    expect(pick(suggest(ans(true, 'yes'), column([6, 6])))).toEqual(['t-test', 'Paired t test']);
    expect(pick(suggest(ans(false, 'no'), column([6, 6])))).toEqual([
      'rank-test',
      'Mann-Whitney test',
    ]);
    expect(pick(suggest(ans(true, 'no'), column([8, 8])))).toEqual([
      'rank-test',
      'Wilcoxon matched-pairs test',
    ]);
    expect(pick(suggest(ans(false, 'yes'), column([5, 5, 5])))).toEqual([
      'one-way-anova',
      'One-way ANOVA',
    ]);
    expect(pick(suggest(ans(false, 'no'), column([5, 5, 5])))).toEqual([
      'kruskal-wallis',
      'Kruskal-Wallis test',
    ]);
  });

  it('keeps the pairing in the suggested options', () => {
    const s = suggest(ans(true, 'no'), column([8, 8]));
    expect(s.kind === 'test' && s.spec.options).toMatchObject({ paired: true });
  });

  it('when unsure, prefers the test that assumes less, unless it could never be significant', () => {
    expect(pick(suggest(ans(false, 'unsure'), column([8, 8])))).toEqual([
      'rank-test',
      'Mann-Whitney test',
    ]);
    const tiny = suggest(ans(false, 'unsure'), column([3, 3]));
    expect(pick(tiny)).toEqual(['t-test', 'Unpaired t test']);
    expect(tiny.kind === 'test' && tiny.why).toMatch(/can’t reach P < 0\.05 at all/);
    const no = suggest(ans(false, 'no'), column([3, 3]));
    expect(no.kind === 'test' && no.why).toMatch(/can’t give P < 0\.05 however different/);
  });

  it('has no test yet for three or more matched groups, and says so', () => {
    const s = suggest(ans(true, null), column([5, 5, 5]));
    expect(s.kind).toBe('none');
    expect(s.kind === 'none' && s.why).toMatch(/repeated-measures ANOVA or the Friedman test/);
  });

  it('goes straight to two-way ANOVA for Grouped tables, and to summary-data tests', () => {
    expect(
      pick(suggest(ans(null, null), { tableType: 'grouped', summary: false, sizes: [3, 3] })),
    ).toEqual(['two-way-anova', 'Two-way ANOVA']);
    expect(pick(suggest(ans(null, null), column([5, 5], true)))).toEqual([
      't-test',
      'Unpaired t test',
    ]);
    expect(pick(suggest(ans(null, null), column([5, 5, 5], true)))).toEqual([
      'one-way-anova',
      'One-way ANOVA',
    ]);
    expect(pick(suggest(ans(null, null), column([5])))).toEqual(['none']);
  });

  it('suggests the nested tests for a Nested table, asking neither matching nor distribution', () => {
    expect(pick(suggest(ans(null, null), nested([2, 2])))).toEqual([
      'nested-t-test',
      'Nested t test',
    ]);
    expect(pick(suggest(ans(null, null), nested([2, 2, 2])))).toEqual([
      'nested-one-way-anova',
      'Nested one-way ANOVA',
    ]);
    expect(pick(suggest(ans(null, null), nested([2])))).toEqual(['none']);
  });

  it('knows when a Mann-Whitney test can reach P < 0.05 (never with 7 values or fewer)', () => {
    expect([
      rankTestCanBeSignificant(3, 3),
      rankTestCanBeSignificant(4, 4),
      rankTestCanBeSignificant(2, 8),
      rankTestCanBeSignificant(3, 4),
    ]).toEqual([false, true, true, false]);
  });
});
