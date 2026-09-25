/** Every analysis module, by kind (item 04). */
import { descriptive } from './descriptive';
import type { Registry } from './module';
import { oneway } from './oneway';
import { ranktest } from './ranktest';
import { ttest } from './ttest';

export const REGISTRY: Registry = {
  descriptive,
  't-test': ttest,
  'rank-test': ranktest,
  'one-way-anova': oneway,
};
