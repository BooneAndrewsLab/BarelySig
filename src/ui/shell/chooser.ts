/**
 * "Which test?" (item 06, #29): plain questions to a suggested test, with
 * the reason in words. Pure, so every path is tested; the dialog asks the
 * questions and fills itself with the answer.
 */
import { DEFAULT_OPTIONS, type UserAnalysisSpec } from '@/model/project';
import type { TableType } from '@/model/table';

export interface ChooserAnswers {
  /** Same subjects in every group (each row one subject), or, in a Nested table, the same experiments: paired or matched. */
  readonly matched: boolean | null;
  /** Values from a bell-shaped (Gaussian) distribution: yes, no, or not sure. */
  readonly gaussian: 'yes' | 'no' | 'unsure' | null;
}

export interface ChooserContext {
  readonly tableType: TableType;
  /** Summary data (mean, SD, n) rather than values. */
  readonly summary: boolean;
  /** Number of values in each chosen group. */
  readonly sizes: readonly number[];
}

export type Suggestion =
  | {
      readonly kind: 'test';
      readonly spec: UserAnalysisSpec;
      readonly name: string;
      readonly why: string;
    }
  | { readonly kind: 'none'; readonly why: string }
  | { readonly kind: 'ask'; readonly question: 'matched' | 'gaussian' };

/** Whether a Mann-Whitney test of these sizes can ever reach P < 0.05 (two-tailed). */
export function rankTestCanBeSignificant(a: number, b: number): boolean {
  // Complete separation: P = 2 / choose(a + b, a).
  let c = 1;
  for (let i = 1; i <= Math.min(a, b); i += 1) c = (c * (a + b - i + 1)) / i;
  return 2 / c < 0.05;
}

const NOT_SURE =
  'Whether values are Gaussian comes mostly from what is known about the kind of measurement, not from a normality test on a few values. ';

export function suggest(a: ChooserAnswers, ctx: ChooserContext): Suggestion {
  const k = ctx.sizes.length;
  if (ctx.tableType === 'grouped') {
    return {
      kind: 'test',
      spec: { kind: 'two-way-anova', options: DEFAULT_OPTIONS['two-way-anova'] },
      name: 'Two-way ANOVA',
      why: 'A Grouped table has two factors (the rows and the data sets), so two-way ANOVA asks how each affects the values and whether they interact.',
    };
  }
  if (k < 2) {
    return {
      kind: 'none',
      why: 'Choose at least two groups to compare. To summarise one group, use Descriptive statistics.',
    };
  }
  if (ctx.tableType === 'nested') {
    // Matched: replicate n is the same experiment in every group (note 14).
    if (a.matched === null) return { kind: 'ask', question: 'matched' };
    if (k === 2) {
      return a.matched
        ? {
            kind: 'test',
            spec: {
              kind: 'nested-t-test',
              options: { ...DEFAULT_OPTIONS['nested-t-test'], matched: true },
            },
            name: 'Matched nested t test',
            why: 'Each replicate is the same experiment in both groups, so the test compares the groups within each experiment: a paired t test on the replicate means, as the SuperPlots paper (Lord et al. 2020) does. A day when everything read high then doesn’t hide a difference that goes the same way every time.',
          }
        : {
            kind: 'test',
            spec: { kind: 'nested-t-test', options: DEFAULT_OPTIONS['nested-t-test'] },
            name: 'Nested t test',
            why: 'A Nested table has biological replicates within each group: the nested t test weighs each replicate by how many values it has, rather than treating every individual value as its own independent sample.',
          };
    }
    return a.matched
      ? {
          kind: 'none',
          why: 'Three or more groups with matched replicates call for a repeated-measures ANOVA on the replicate means, which BarelySig doesn’t have yet (issues #50, #71). Nested one-way ANOVA ignores the matching; compare two groups at a time with the matched nested t test meanwhile, and account for the number of comparisons.',
        }
      : {
          kind: 'test',
          spec: { kind: 'nested-one-way-anova', options: DEFAULT_OPTIONS['nested-one-way-anova'] },
          name: 'Nested one-way ANOVA',
          why: 'A Nested table has biological replicates within each group: nested one-way ANOVA weighs each replicate by how many values it has, rather than treating every individual value as its own independent sample.',
        };
  }
  if (ctx.summary) {
    // Only the tests that work from mean, SD and n.
    return k === 2
      ? {
          kind: 'test',
          spec: { kind: 't-test', options: DEFAULT_OPTIONS['t-test'] },
          name: 'Unpaired t test',
          why: 'From summary data (mean, SD, n) the only test that can compare two groups is the unpaired t test: rank tests and paired tests need the individual values.',
        }
      : {
          kind: 'test',
          spec: { kind: 'one-way-anova', options: DEFAULT_OPTIONS['one-way-anova'] },
          name: 'One-way ANOVA',
          why: 'From summary data (mean, SD, n) the only test that can compare three or more groups is ordinary one-way ANOVA: rank and matched tests need the individual values.',
        };
  }
  if (a.matched === null) return { kind: 'ask', question: 'matched' };
  if (a.matched && k > 2) {
    return {
      kind: 'none',
      why: 'Three or more matched groups call for repeated-measures ANOVA or the Friedman test, which BarelySig doesn’t have yet (issue #50). Don’t use an unpaired test instead: it ignores the matching and loses the benefit of it.',
    };
  }
  if (a.gaussian === null) return { kind: 'ask', question: 'gaussian' };

  const smallest = Math.min(...ctx.sizes);
  const paired = a.matched;
  const rankUseless =
    k === 2
      ? paired
        ? Math.min(...ctx.sizes) <= 5 // Wilcoxon: 2 / 2^n >= 0.05 up to 5 pairs.
        : !rankTestCanBeSignificant(ctx.sizes[0] ?? 0, ctx.sizes[1] ?? 0)
      : ctx.sizes.reduce((s, n) => s + n, 0) <= 7;
  const nonparametric =
    a.gaussian === 'no' || (a.gaussian === 'unsure' && !rankUseless && smallest >= 1);

  if (k === 2) {
    if (!nonparametric) {
      const why =
        a.gaussian === 'yes'
          ? paired
            ? 'Two groups, the same subjects in both, Gaussian values: a paired t test compares the mean of the differences with zero.'
            : 'Two groups of different subjects, Gaussian values: an unpaired t test compares the two means.'
          : `${NOT_SURE}With so few values a rank test can’t reach P < 0.05 at all, so the ${paired ? 'paired' : 'unpaired'} t test is the practical choice. If the values vary by fold changes (concentrations, expression), their logarithms are often closer to Gaussian (make a column of logs in your spreadsheet and paste it).`;
      return {
        kind: 'test',
        spec: { kind: 't-test', options: { ...DEFAULT_OPTIONS['t-test'], paired } },
        name: paired ? 'Paired t test' : 'Unpaired t test',
        why,
      };
    }
    const caveat = rankUseless
      ? ' With this few values it can’t give P < 0.05 however different the groups are, so consider whether a t test is justified.'
      : '';
    const start =
      a.gaussian === 'unsure' ? `${NOT_SURE}When unsure, a test that assumes less is safer. ` : '';
    return {
      kind: 'test',
      spec: { kind: 'rank-test', options: { ...DEFAULT_OPTIONS['rank-test'], paired } },
      name: paired ? 'Wilcoxon matched-pairs test' : 'Mann-Whitney test',
      why: `${start}${paired ? 'Two groups, the same subjects in both: the Wilcoxon test ranks the differences within each subject and doesn’t assume a bell-shaped distribution.' : 'Two groups of different subjects: the Mann-Whitney test compares ranks and doesn’t assume a bell-shaped distribution (it is “nonparametric”).'}${caveat}`,
    };
  }

  if (!nonparametric) {
    return {
      kind: 'test',
      spec: { kind: 'one-way-anova', options: DEFAULT_OPTIONS['one-way-anova'] },
      name: 'One-way ANOVA',
      why:
        a.gaussian === 'yes'
          ? `${String(k)} groups of different subjects, Gaussian values: one-way ANOVA asks whether the means differ, and Tukey’s comparisons say which pairs do.`
          : `${NOT_SURE}With so few values a rank test can’t reach P < 0.05, so one-way ANOVA is the practical choice; values that vary by fold changes are often closer to Gaussian as logarithms (make a column of logs in your spreadsheet).`,
    };
  }
  const start =
    a.gaussian === 'unsure' ? `${NOT_SURE}When unsure, a test that assumes less is safer. ` : '';
  return {
    kind: 'test',
    spec: { kind: 'kruskal-wallis', options: DEFAULT_OPTIONS['kruskal-wallis'] },
    name: 'Kruskal-Wallis test',
    why: `${start}${String(k)} groups of different subjects: the Kruskal-Wallis test compares ranks without assuming a bell-shaped distribution, and Dunn’s comparisons say which pairs differ.`,
  };
}
