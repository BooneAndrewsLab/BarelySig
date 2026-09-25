/** What the app calls each analysis kind, and its icon (items 04, 06). */
import type { AnalysisKind, AnalysisSpec } from '@/model/project';

import type { IconName } from './Icon';

export const KIND_ICON: Readonly<Record<AnalysisKind, IconName>> = {
  descriptive: 'descriptive-stats',
  't-test': 't-test',
  'rank-test': 't-test',
  'one-way-anova': 'anova',
  'kruskal-wallis': 'anova',
  'two-way-anova': 'grouped',
};

/** The test's name for an analysis: "Unpaired t test", "Mann-Whitney test". */
export function testName(spec: AnalysisSpec): string {
  switch (spec.kind) {
    case 'descriptive':
      return 'Descriptive statistics';
    case 't-test':
      return spec.options.paired
        ? 'Paired t test'
        : spec.options.welch
          ? 'Welch’s t test'
          : 'Unpaired t test';
    case 'rank-test':
      return spec.options.paired ? 'Wilcoxon test' : 'Mann-Whitney test';
    case 'one-way-anova':
      return spec.options.welch ? 'Welch’s ANOVA' : 'One-way ANOVA';
    case 'kruskal-wallis':
      return 'Kruskal-Wallis test';
    case 'two-way-anova':
      return 'Two-way ANOVA';
  }
}
