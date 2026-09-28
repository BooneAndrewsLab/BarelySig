/** What the app calls each analysis kind, and its icon (items 04, 06). */
import type { AnalysisKind, AnalysisSpec } from '@/model/project';

import type { IconName } from './Icon';

export const KIND_ICON: Readonly<Record<AnalysisKind, IconName>> = {
  descriptive: 'descriptive-stats',
  'nested-descriptive': 'descriptive-stats',
  't-test': 't-test',
  'nested-t-test': 't-test',
  'rank-test': 't-test',
  'one-way-anova': 'anova',
  'nested-one-way-anova': 'anova',
  'nested-repeated-anova': 'anova',
  'kruskal-wallis': 'anova',
  'two-way-anova': 'grouped',
  'repeated-measures-anova': 'anova',
  'repeated-two-way-anova': 'grouped',
  'repeated-two-way-anova-both': 'grouped',
  friedman: 'anova',
  normality: 'descriptive-stats',
  'nested-normality': 'descriptive-stats',
  'paired-normality': 'descriptive-stats',
  'contingency-chi-square': 't-test',
  'contingency-fisher': 't-test',
  correlation: 'curve-fit',
  'linear-regression': 'curve-fit',
  'nonlinear-regression': 'curve-fit',
  'growth-curve': 'curve-fit',
  'graph-summary': 'bar-error',
};

/** The test's name for an analysis: "Unpaired t test", "Mann-Whitney test". */
export function testName(spec: AnalysisSpec): string {
  switch (spec.kind) {
    case 'descriptive':
    case 'nested-descriptive':
      return 'Descriptive statistics';
    case 't-test':
      return spec.options.paired
        ? 'Paired t test'
        : spec.options.welch
          ? 'Welch’s t test'
          : 'Unpaired t test';
    case 'nested-t-test':
      return spec.options.matched ? 'Matched nested t test' : 'Nested t test';
    case 'rank-test':
      return spec.options.paired ? 'Wilcoxon test' : 'Mann-Whitney test';
    case 'one-way-anova':
      return spec.options.welch ? 'Welch’s ANOVA' : 'One-way ANOVA';
    case 'nested-one-way-anova':
      return 'Nested one-way ANOVA';
    case 'nested-repeated-anova':
      return 'Matched nested one-way ANOVA';
    case 'kruskal-wallis':
      return 'Kruskal-Wallis test';
    case 'two-way-anova':
      return 'Two-way ANOVA';
    case 'repeated-measures-anova':
      return 'Repeated-measures ANOVA';
    case 'repeated-two-way-anova':
      return 'Repeated-measures two-way ANOVA';
    case 'repeated-two-way-anova-both':
      return 'Repeated-measures two-way ANOVA (both factors repeated)';
    case 'friedman':
      return 'Friedman test';
    case 'normality':
      return 'Normality tests';
    case 'nested-normality':
      return 'Normality tests';
    case 'paired-normality':
      return 'Normality of the differences';
    case 'contingency-chi-square':
      return 'Chi-square test';
    case 'contingency-fisher':
      return 'Fisher’s exact test';
    case 'correlation':
      return spec.options.method === 'spearman' ? 'Spearman correlation' : 'Pearson correlation';
    case 'linear-regression':
      return 'Linear regression';
    case 'nonlinear-regression':
      return 'Dose-response curve (variable slope)';
    case 'growth-curve':
      return 'Growth curve (Gompertz)';
    case 'graph-summary':
      return 'Graph statistics';
  }
}
