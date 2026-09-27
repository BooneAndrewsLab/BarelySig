/** Every analysis module, by kind (item 04). */
import { descriptive } from './descriptive';
import { friedman } from './friedman';
import { graphSummary } from './graphsummary';
import { kruskal } from './kruskal';
import type { Registry } from './module';
import { nestedOneway } from './nested-oneway';
import { nestedTTest } from './nested-ttest';
import { normality } from './normality';
import { oneway } from './oneway';
import { pairedNormality } from './paired-normality';
import { ranktest } from './ranktest';
import { repeatedMeasures } from './repeated';
import { ttest } from './ttest';
import { twoway } from './twoway';

export const REGISTRY: Registry = {
  descriptive,
  't-test': ttest,
  'nested-t-test': nestedTTest,
  'rank-test': ranktest,
  'one-way-anova': oneway,
  'nested-one-way-anova': nestedOneway,
  'kruskal-wallis': kruskal,
  'two-way-anova': twoway,
  'repeated-measures-anova': repeatedMeasures,
  friedman,
  normality,
  'paired-normality': pairedNormality,
  'graph-summary': graphSummary,
};
