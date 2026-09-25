/** Every analysis module, by kind (item 04). */
import { descriptive } from './descriptive';
import type { Registry } from './module';
import { ranktest } from './ranktest';
import { ttest } from './ttest';

export const REGISTRY: Registry = {
  descriptive,
  't-test': ttest,
  'rank-test': ranktest,
};
