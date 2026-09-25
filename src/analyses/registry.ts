/** Every analysis module, by kind (item 04). */
import { descriptive } from './descriptive';
import { graphSummary } from './graphsummary';
import { kruskal } from './kruskal';
import type { Registry } from './module';
import { normality } from './normality';
import { oneway } from './oneway';
import { ranktest } from './ranktest';
import { ttest } from './ttest';
import { twoway } from './twoway';

export const REGISTRY: Registry = {
  descriptive,
  't-test': ttest,
  'rank-test': ranktest,
  'one-way-anova': oneway,
  'kruskal-wallis': kruskal,
  'two-way-anova': twoway,
  normality,
  'graph-summary': graphSummary,
};
