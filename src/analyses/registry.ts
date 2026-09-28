/** Every analysis module, by kind (item 04). */
import { contingencyChiSquare } from './contingency-chi-square';
import { contingencyFisher } from './contingency-fisher';
import { descriptive } from './descriptive';
import { friedman } from './friedman';
import { graphSummary } from './graphsummary';
import { kruskal } from './kruskal';
import type { Registry } from './module';
import { nestedDescriptive } from './nested-descriptive';
import { nestedNormality } from './nested-normality';
import { nestedOneway } from './nested-oneway';
import { nestedRepeated } from './nested-repeated';
import { nestedTTest } from './nested-ttest';
import { normality } from './normality';
import { oneway } from './oneway';
import { pairedNormality } from './paired-normality';
import { ranktest } from './ranktest';
import { repeatedMeasures } from './repeated';
import { repeatedTwoway } from './repeatedTwoway';
import { repeatedTwowayBoth } from './repeatedTwowayBoth';
import { ttest } from './ttest';
import { twoway } from './twoway';

export const REGISTRY: Registry = {
  descriptive,
  'nested-descriptive': nestedDescriptive,
  't-test': ttest,
  'nested-t-test': nestedTTest,
  'rank-test': ranktest,
  'one-way-anova': oneway,
  'nested-one-way-anova': nestedOneway,
  'nested-repeated-anova': nestedRepeated,
  'kruskal-wallis': kruskal,
  'two-way-anova': twoway,
  'repeated-measures-anova': repeatedMeasures,
  'repeated-two-way-anova': repeatedTwoway,
  'repeated-two-way-anova-both': repeatedTwowayBoth,
  friedman,
  normality,
  'nested-normality': nestedNormality,
  'paired-normality': pairedNormality,
  'contingency-chi-square': contingencyChiSquare,
  'contingency-fisher': contingencyFisher,
  'graph-summary': graphSummary,
};
