import { describe, expect, it } from 'vitest';

import type { Id } from '@/model/ids';

import {
  type ChooserAnswers,
  type ChooserContext,
  NO_ANSWERS,
  rankTestCanBeSignificant,
  suggest,
  walk,
} from './chooser';

const ctx = (
  tableType: ChooserContext['tableType'],
  sizes: readonly number[],
  summary = false,
): ChooserContext => ({
  tableType,
  summary,
  groups: sizes.map((n, i) => ({ id: `g${String(i)}` as Id, title: `G${String(i)}`, n })),
});
const column = (sizes: readonly number[], summary = false) => ctx('column', sizes, summary);
const nested = (sizes: readonly number[]) => ctx('nested', sizes);

/** Answers to comparing groups, the groups confirmed. */
const ans = (patch: Partial<ChooserAnswers> = {}): ChooserAnswers => ({
  ...NO_ANSWERS,
  goal: 'compare',
  groups: true,
  ...patch,
});
const pick = (s: ReturnType<typeof suggest>) =>
  s.kind === 'test' ? [s.spec.kind, s.name] : s.kind === 'ask' ? ['ask', s.question] : ['none'];
const text = (s: ReturnType<typeof suggest>) =>
  s.kind === 'test' ? `${s.why} ${s.caveat ?? ''}` : s.kind === 'none' ? s.why : '';

describe('help me choose', () => {
  it('asks what to find out, then the groups, the rows, the kind of numbers, a control', () => {
    const c = column([6, 6, 6]);
    expect(pick(suggest(NO_ANSWERS, c))).toEqual(['ask', 'goal']);
    expect(pick(suggest({ ...NO_ANSWERS, goal: 'compare' }, c))).toEqual(['ask', 'groups']);
    expect(pick(suggest(ans(), c))).toEqual(['ask', 'matched']);
    expect(pick(suggest(ans({ matched: 'no' }), c))).toEqual(['ask', 'values']);
    expect(pick(suggest(ans({ matched: 'no', values: 'measurement' }), c))).toEqual([
      'ask',
      'control',
    ]);
  });

  it('describes groups without comparing them', () => {
    const s = suggest({ ...NO_ANSWERS, goal: 'describe', groups: true }, column([4]));
    expect(pick(s)).toEqual(['descriptive', 'Descriptive statistics']);
    expect(pick(suggest({ ...NO_ANSWERS, goal: 'describe', groups: true }, column([])))).toEqual([
      'none',
    ]);
  });

  it('suggests the classic tests for two groups', () => {
    const two = column([6, 6]);
    expect(pick(suggest(ans({ matched: 'no', values: 'measurement' }), two))).toEqual([
      't-test',
      'Unpaired t test',
    ]);
    expect(pick(suggest(ans({ matched: 'yes', values: 'measurement' }), two))).toEqual([
      't-test',
      'Paired t test',
    ]);
    expect(pick(suggest(ans({ matched: 'no', values: 'score' }), two))).toEqual([
      'rank-test',
      'Mann-Whitney test',
    ]);
    expect(pick(suggest(ans({ matched: 'yes', values: 'score' }), column([8, 8])))).toEqual([
      'rank-test',
      'Wilcoxon matched-pairs test',
    ]);
  });

  it('keeps the pairing in the suggested options', () => {
    const s = suggest(ans({ matched: 'yes', values: 'score' }), column([8, 8]));
    expect(s.kind === 'test' && s.spec.options).toMatchObject({ paired: true });
  });

  it('takes "not sure" about the rows as separate samples, and says a paired test may fit', () => {
    const s = suggest(ans({ matched: 'unsure', values: 'measurement' }), column([6, 6]));
    expect(pick(s)).toEqual(['t-test', 'Unpaired t test']);
    expect(s.kind === 'test' && s.spec.options).toMatchObject({ paired: false });
    expect(text(s)).toMatch(/a paired test is more sensitive/);
  });

  it('suggests a rank test for amounts that grow by multiplying, with the tip about logs', () => {
    const s = suggest(ans({ matched: 'no', values: 'multiplying' }), column([8, 8]));
    expect(pick(s)).toEqual(['rank-test', 'Mann-Whitney test']);
    expect(text(s)).toMatch(/logarithms/);
  });

  it('when unsure, prefers the test that assumes less, unless it could never be significant', () => {
    const unsure = suggest(ans({ matched: 'no', values: 'unsure' }), column([8, 8]));
    expect(pick(unsure)).toEqual(['rank-test', 'Mann-Whitney test']);
    expect(text(unsure)).toMatch(/a test that assumes less is safer/);
    const tiny = suggest(ans({ matched: 'no', values: 'unsure' }), column([3, 3]));
    expect(pick(tiny)).toEqual(['t-test', 'Unpaired t test']);
    expect(text(tiny)).toMatch(/can’t give P < 0\.05 however different/);
    expect(text(tiny)).not.toMatch(/assumes less is safer/);
    const score = suggest(ans({ matched: 'no', values: 'score' }), column([3, 3]));
    expect(pick(score)).toEqual(['rank-test', 'Mann-Whitney test']);
    expect(text(score)).toMatch(/consider whether a t test is justified/);
  });

  it('compares three or more groups with a control, or every pair', () => {
    const three = column([5, 5, 5]);
    const all = suggest(ans({ matched: 'no', values: 'measurement', control: 'all' }), three);
    expect(pick(all)).toEqual(['one-way-anova', 'One-way ANOVA']);
    expect(all.kind === 'test' && all.spec.options).toMatchObject({
      comparisons: { kind: 'all', test: 'tukey' },
    });
    const ctl = suggest(ans({ matched: 'no', values: 'measurement', control: 'g1' as Id }), three);
    expect(ctl.kind === 'test' && ctl.spec.options).toMatchObject({
      comparisons: { kind: 'control', control: 'g1', test: 'dunnett' },
    });
    expect(text(ctl)).toMatch(/each group with G1/);
    const kw = suggest(ans({ matched: 'no', values: 'score', control: 'g0' as Id }), three);
    expect(pick(kw)).toEqual(['kruskal-wallis', 'Kruskal-Wallis test']);
    expect(kw.kind === 'test' && kw.spec.options).toMatchObject({
      comparisons: { kind: 'control', control: 'g0' },
    });
  });

  it('asks about the control again when the chosen control is no longer among the groups', () => {
    const s = suggest(
      ans({ matched: 'no', values: 'measurement', control: 'gone' as Id }),
      column([5, 5, 5]),
    );
    expect(pick(s)).toEqual(['ask', 'control']);
  });

  it('asks the kind of numbers, then suggests repeated-measures ANOVA or the Friedman test, for three or more matched groups', () => {
    const three = column([5, 5, 5]);
    expect(pick(suggest(ans({ matched: 'yes' }), three))).toEqual(['ask', 'values']);
    const rm = suggest(ans({ matched: 'yes', values: 'measurement', control: 'all' }), three);
    expect(pick(rm)).toEqual(['repeated-measures-anova', 'Repeated-measures ANOVA']);
    expect(rm.kind === 'test' && rm.spec.options).toMatchObject({
      comparisons: { kind: 'all', test: 'tukey' },
    });
    expect(text(rm)).toMatch(/measured on the same mice/);
    const friedman = suggest(ans({ matched: 'yes', values: 'score', control: 'g0' as Id }), three);
    expect(pick(friedman)).toEqual(['friedman', 'Friedman test']);
    expect(friedman.kind === 'test' && friedman.spec.options).toMatchObject({
      comparisons: { kind: 'control', control: 'g0' },
    });
  });

  it('goes straight to two-way ANOVA for Grouped tables, and to summary-data tests', () => {
    expect(pick(suggest({ ...NO_ANSWERS, groups: true }, ctx('grouped', [3, 3])))).toEqual([
      'two-way-anova',
      'Two-way ANOVA',
    ]);
    expect(pick(suggest(ans(), column([5, 5], true)))).toEqual(['t-test', 'Unpaired t test']);
    expect(pick(suggest(ans({ control: 'all' }), column([5, 5, 5], true)))).toEqual([
      'one-way-anova',
      'One-way ANOVA',
    ]);
    expect(pick(suggest(ans(), column([5])))).toEqual(['none']);
  });

  it('asks a Nested table whether the replicates are matched, never about the kind of numbers', () => {
    expect(pick(suggest({ ...NO_ANSWERS, groups: true }, nested([2, 2])))).toEqual([
      'ask',
      'matched',
    ]);
    expect(pick(suggest(ans({ matched: 'no' }), nested([2, 2])))).toEqual([
      'nested-t-test',
      'Nested t test',
    ]);
    expect(pick(suggest(ans({ matched: 'no' }), nested([2, 2, 2])))).toEqual(['ask', 'control']);
    expect(pick(suggest(ans({ matched: 'no', control: 'all' }), nested([2, 2, 2])))).toEqual([
      'nested-one-way-anova',
      'Nested one-way ANOVA',
    ]);
    expect(pick(suggest(ans(), nested([2])))).toEqual(['none']);
  });

  it('suggests the matched nested t test for matched replicates, and nothing yet for three groups', () => {
    const s = suggest(ans({ matched: 'yes' }), nested([2, 2]));
    expect(pick(s)).toEqual(['nested-t-test', 'Matched nested t test']);
    expect(s.kind === 'test' && s.spec).toEqual({
      kind: 'nested-t-test',
      options: { tails: 'two', matched: true },
    });
    const three = suggest(ans({ matched: 'yes' }), nested([2, 2, 2]));
    expect(three.kind === 'none' && three.why).toMatch(/#71/);
  });

  it('lists only the questions that led to the suggestion', () => {
    const c = column([6, 6]);
    const full = ans({ matched: 'no', values: 'measurement', control: 'all' });
    expect(walk(full, c).answered).toEqual(['goal', 'groups', 'matched', 'values']);
    // Summary data never asks about rows or the kind of numbers, even if they were answered.
    expect(walk(full, column([6, 6], true)).answered).toEqual(['goal', 'groups']);
    expect(walk({ ...full, matched: null }, c)).toEqual({
      answered: ['goal', 'groups'],
      next: { kind: 'ask', question: 'matched' },
    });
    expect(walk(full, column([6, 6, 6])).answered).toEqual([
      'goal',
      'groups',
      'matched',
      'values',
      'control',
    ]);
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
