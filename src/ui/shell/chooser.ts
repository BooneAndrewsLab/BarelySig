/**
 * "Help me choose" (items 06, 15; #29, #73): questions about the experiment,
 * in bench words, to a suggested test with the reason in words. Pure, so
 * every path is tested; the guide walks it one question at a time.
 */
import type { Id } from '@/model/ids';
import { DEFAULT_OPTIONS, type UserAnalysisSpec } from '@/model/project';
import type { TableType } from '@/model/table';

export type Goal = 'compare' | 'describe';
/** Whether the values in one row (a Nested table: one replicate) belong together. */
export type Matched = 'yes' | 'no' | 'unsure';
/** The kind of numbers, which decides whether a bell shape can be assumed (note 15). */
export type ValueKind = 'measurement' | 'multiplying' | 'score' | 'unsure';

export interface ChooserAnswers {
  readonly goal: Goal | null;
  /** The groups ticked in the guide were confirmed. */
  readonly groups: boolean;
  readonly matched: Matched | null;
  readonly values: ValueKind | null;
  /** Compare each group with this control, or every pair ('all'). */
  readonly control: Id | 'all' | null;
}

export const NO_ANSWERS: ChooserAnswers = {
  goal: null,
  groups: false,
  matched: null,
  values: null,
  control: null,
};

export type Question = 'goal' | 'groups' | 'matched' | 'values' | 'control';

export interface ChooserContext {
  readonly tableType: TableType;
  /** Summary data (mean, SD, n) rather than values. */
  readonly summary: boolean;
  /** The chosen groups, in order, with the number of values in each. */
  readonly groups: readonly { readonly id: Id; readonly title: string; readonly n: number }[];
}

export type Suggestion =
  | {
      readonly kind: 'test';
      readonly spec: UserAnalysisSpec;
      readonly name: string;
      readonly why: string;
      /** Something to keep in mind: few values, a tip about logarithms. */
      readonly caveat?: string;
    }
  | { readonly kind: 'none'; readonly why: string }
  | { readonly kind: 'ask'; readonly question: Question };

/** Whether a Mann-Whitney test of these sizes can ever reach P < 0.05 (two-tailed). */
export function rankTestCanBeSignificant(a: number, b: number): boolean {
  // Complete separation: P = 2 / choose(a + b, a).
  let c = 1;
  for (let i = 1; i <= Math.min(a, b); i += 1) c = (c * (a + b - i + 1)) / i;
  return 2 / c < 0.05;
}

/** The fewest groups each goal needs. */
export const minGroups = (goal: Goal | null): number => (goal === 'describe' ? 1 : 2);

const LOGS =
  'Amounts that grow by multiplying are often bell-shaped as logarithms: make a column of their logs in your spreadsheet, paste it, and a t test or ANOVA of the logs is the more sensitive choice.';

const UNSURE =
  'Whether values are bell-shaped comes from what is known about the kind of measurement, not from a test on a few values.';
const SAFER = `${UNSURE} When unsure, a test that assumes less is safer.`;

type Control = { readonly kind: 'all' } | { readonly kind: 'control'; readonly control: Id };

/** What follows the overall test: "then compares each group with WT (Dunnett’s test)". */
function comparisonsWord(
  c: Control,
  groups: ChooserContext['groups'],
  after: 'anova' | 'ranks' = 'anova',
): string {
  const method =
    after === 'ranks' ? 'Dunn’s test' : c.kind === 'all' ? 'Tukey’s test' : 'Dunnett’s test';
  if (c.kind === 'all') return `then compares every group with every other (${method})`;
  const title = groups.find((g) => g.id === c.control)?.title ?? '';
  return `then compares each group with ${title === '' ? 'the control' : title} (${method})`;
}

export function suggest(a: ChooserAnswers, ctx: ChooserContext): Suggestion {
  const describable = ctx.tableType === 'column';
  if (describable && a.goal === null) return { kind: 'ask', question: 'goal' };
  if (!a.groups) return { kind: 'ask', question: 'groups' };
  const k = ctx.groups.length;
  const goal: Goal = describable ? (a.goal ?? 'compare') : 'compare';
  if (k < minGroups(goal)) {
    return {
      kind: 'none',
      why:
        goal === 'describe'
          ? 'Tick at least one group to describe.'
          : 'Tick at least two groups to compare. To summarise one group, choose “The numbers for each group”.',
    };
  }
  if (goal === 'describe') {
    return {
      kind: 'test',
      spec: { kind: 'descriptive', options: DEFAULT_OPTIONS.descriptive },
      name: 'Descriptive statistics',
      why: 'It lists, for each group, how many values it has (n), their mean, SD, SEM and 95% confidence interval, the median and the quartiles: the numbers a table or a figure legend needs. It doesn’t compare the groups.',
    };
  }
  if (ctx.tableType === 'grouped') {
    return {
      kind: 'test',
      spec: { kind: 'two-way-anova', options: DEFAULT_OPTIONS['two-way-anova'] },
      name: 'Two-way ANOVA',
      why: 'A Grouped table has two things that vary at once, the rows and the data sets (for example genotype and treatment). Two-way ANOVA asks how each one changes the values, and whether the effect of one depends on the other (an “interaction”), then compares the data sets within each row.',
    };
  }

  // Which pairs to compare after a test of three or more groups.
  const control = (): Control | null => {
    if (a.control === null) return null;
    if (a.control === 'all') return { kind: 'all' };
    return ctx.groups.some((g) => g.id === a.control)
      ? { kind: 'control', control: a.control }
      : null;
  };

  if (ctx.tableType === 'nested') {
    // Matched: replicate n is the same experiment in every group (note 14).
    if (a.matched === null) return { kind: 'ask', question: 'matched' };
    const matched = a.matched === 'yes';
    if (k === 2) {
      return matched
        ? {
            kind: 'test',
            spec: {
              kind: 'nested-t-test',
              options: { ...DEFAULT_OPTIONS['nested-t-test'], matched: true },
            },
            name: 'Matched nested t test',
            why: 'Each replicate was one sample (a culture, an animal, a batch of cells) split between the two groups, so the test compares the groups within each replicate: it averages each replicate’s values, then runs a paired t test on those averages, as the SuperPlots paper (Lord et al. 2020) does. A replicate that read high in both groups then doesn’t hide a difference that goes the same way every time.',
          }
        : {
            kind: 'test',
            spec: { kind: 'nested-t-test', options: DEFAULT_OPTIONS['nested-t-test'] },
            name: 'Nested t test',
            why: 'Your values come in biological replicates (experiments, animals, dishes). The nested t test counts each replicate as one independent sample, rather than every cell or well, so the P value reflects how repeatable the result is.',
            ...(a.matched === 'unsure'
              ? {
                  caveat:
                    'This treats each group’s replicates as independent. If each replicate was in fact one sample split between the groups, the matched test is more sensitive: ask whoever did the experiments.',
                }
              : {}),
          };
    }
    if (matched) {
      return {
        kind: 'none',
        why: 'Three or more groups that share each replicate need a repeated-measures ANOVA on the replicate means, which BarelySig doesn’t have yet (issues #50, #71). Meanwhile, compare two groups at a time with the matched nested t test, and keep in mind that every extra comparison makes a chance “significant” result more likely.',
      };
    }
    const c = control();
    if (c === null) return { kind: 'ask', question: 'control' };
    return {
      kind: 'test',
      spec: {
        kind: 'nested-one-way-anova',
        options: {
          comparisons:
            c.kind === 'all'
              ? DEFAULT_OPTIONS['nested-one-way-anova'].comparisons
              : { kind: 'control', control: c.control, test: 'dunnett' },
        },
      },
      name: 'Nested one-way ANOVA',
      why: `Your values come in biological replicates. Nested one-way ANOVA counts each replicate as one independent sample, rather than every cell or well, asks whether the groups differ at all, and ${comparisonsWord(c, ctx.groups)}.`,
    };
  }

  if (ctx.summary) {
    // Only the tests that work from mean, SD and n.
    if (k === 2) {
      return {
        kind: 'test',
        spec: { kind: 't-test', options: DEFAULT_OPTIONS['t-test'] },
        name: 'Unpaired t test',
        why: 'Your table holds summaries (mean, SD and n) rather than the values themselves. The unpaired t test is the test that can compare two groups from those: tests that pair or rank the values need every value.',
      };
    }
    const c = control();
    if (c === null) return { kind: 'ask', question: 'control' };
    return oneWay(c, {
      why: `Your table holds summaries (mean, SD and n) rather than the values themselves. One-way ANOVA is the test that can compare three or more groups from those; it asks whether the groups differ at all, and ${comparisonsWord(c, ctx.groups)}.`,
    });
  }

  if (a.matched === null) return { kind: 'ask', question: 'matched' };
  const paired = a.matched === 'yes';
  const unsurePaired =
    a.matched === 'unsure'
      ? 'This treats every value as a separate sample. If each row is in fact one mouse, patient or split sample, a paired test is more sensitive: ask whoever did the experiment.'
      : undefined;
  if (paired && k > 2) {
    return {
      kind: 'none',
      why: 'Three or more groups measured on the same mice, patients or split samples need a repeated-measures ANOVA or a Friedman test, which BarelySig doesn’t have yet (issue #50). Don’t use an unpaired test instead: it ignores that the rows belong together. Meanwhile, compare two groups at a time with a paired test, and keep in mind that every extra comparison makes a chance “significant” result more likely.',
    };
  }
  if (a.values === null) return { kind: 'ask', question: 'values' };

  const sizes = ctx.groups.map((g) => g.n);
  const smallest = Math.min(...sizes);
  const rankUseless =
    k === 2
      ? paired
        ? smallest <= 5 // Wilcoxon: 2 / 2^n >= 0.05 up to 5 pairs.
        : !rankTestCanBeSignificant(sizes[0] ?? 0, sizes[1] ?? 0)
      : sizes.reduce((s, n) => s + n, 0) <= 7;
  const bell = a.values === 'measurement';
  const rank = !bell && !(a.values === 'unsure' && rankUseless);
  const few =
    'With this few values a rank test can’t give P < 0.05 however different the groups are';
  const notes = (...parts: (string | undefined)[]) => {
    const s = parts.filter((p) => p !== undefined).join(' ');
    return s === '' ? {} : { caveat: s };
  };

  if (k === 2) {
    if (!rank) {
      const why = bell
        ? paired
          ? 'Two groups, and each row is one mouse, patient or split sample, measured in both. The paired t test looks at the difference within each row and asks whether those differences are, on average, different from zero. Measurements on a smooth scale are usually close enough to bell-shaped for it.'
          : 'Two groups of separate samples, measured on a smooth scale. The unpaired t test compares the two means, taking into account how spread out the values are and how many there are.'
        : `${few}, so the ${paired ? 'paired' : 'unpaired'} t test is the practical choice.`;
      return {
        kind: 'test',
        spec: { kind: 't-test', options: { ...DEFAULT_OPTIONS['t-test'], paired } },
        name: paired ? 'Paired t test' : 'Unpaired t test',
        why,
        ...notes(bell ? undefined : UNSURE, bell ? undefined : LOGS, unsurePaired),
      };
    }
    return {
      kind: 'test',
      spec: { kind: 'rank-test', options: { ...DEFAULT_OPTIONS['rank-test'], paired } },
      name: paired ? 'Wilcoxon matched-pairs test' : 'Mann-Whitney test',
      why: paired
        ? 'Two groups, and each row is one mouse, patient or split sample, measured in both. The Wilcoxon test looks at the difference within each row and ranks them, so it doesn’t need the values to be bell-shaped (it is “nonparametric”).'
        : 'Two groups of separate samples. The Mann-Whitney test ranks all the values from lowest to highest and asks whether one group tends to rank higher, so it doesn’t need the values to be bell-shaped (it is “nonparametric”).',
      ...notes(
        a.values === 'unsure' ? SAFER : undefined,
        a.values === 'multiplying' ? LOGS : undefined,
        rankUseless ? `${few}; consider whether a t test is justified.` : undefined,
        unsurePaired,
      ),
    };
  }

  const c = control();
  if (c === null) return { kind: 'ask', question: 'control' };
  if (!rank) {
    return oneWay(c, {
      why: bell
        ? `${String(k)} groups of separate samples, measured on a smooth scale. One-way ANOVA asks whether the groups differ at all, and ${comparisonsWord(c, ctx.groups)}, adjusting each P for the number of comparisons.`
        : `${few}, so one-way ANOVA is the practical choice. It asks whether the groups differ at all, and ${comparisonsWord(c, ctx.groups)}.`,
      ...notes(bell ? undefined : UNSURE, bell ? undefined : LOGS, unsurePaired),
    });
  }
  return {
    kind: 'test',
    spec: {
      kind: 'kruskal-wallis',
      options: { ...DEFAULT_OPTIONS['kruskal-wallis'], comparisons: c },
    },
    name: 'Kruskal-Wallis test',
    why: `${String(k)} groups of separate samples. The Kruskal-Wallis test ranks all the values from lowest to highest, so it doesn’t need them to be bell-shaped (it is “nonparametric”); it asks whether the groups differ at all, and ${comparisonsWord(c, ctx.groups, 'ranks')}.`,
    ...notes(
      a.values === 'unsure' ? SAFER : undefined,
      a.values === 'multiplying' ? LOGS : undefined,
      unsurePaired,
    ),
  };
}

function oneWay(c: Control, text: { readonly why: string; readonly caveat?: string }): Suggestion {
  return {
    kind: 'test',
    spec: {
      kind: 'one-way-anova',
      options: {
        ...DEFAULT_OPTIONS['one-way-anova'],
        comparisons:
          c.kind === 'all'
            ? DEFAULT_OPTIONS['one-way-anova'].comparisons
            : { kind: 'control', control: c.control, test: 'dunnett' },
      },
    },
    name: 'One-way ANOVA',
    ...text,
  };
}

/**
 * The questions that led to the current suggestion, in the order asked:
 * each answer is applied only once its question comes up, so an answer
 * that no longer matters (after an earlier one changed) is left out.
 */
export function walk(
  a: ChooserAnswers,
  ctx: ChooserContext,
): { readonly answered: readonly Question[]; readonly next: Suggestion } {
  let partial = NO_ANSWERS;
  const answered: Question[] = [];
  for (;;) {
    const s = suggest(partial, ctx);
    if (s.kind !== 'ask') return { answered, next: s };
    const q = s.question;
    const tried = { ...partial, [q]: a[q] };
    const again = suggest(tried, ctx);
    if (again.kind === 'ask' && again.question === q) return { answered, next: s };
    partial = tried;
    answered.push(q);
  }
}
