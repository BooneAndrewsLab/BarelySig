import choosing from '../../../docs/guide/04-choosing-a-test.md?raw';
import contingencyTables from '../../../docs/guide/21-contingency-tables.md?raw';
import dataEntry from '../../../docs/guide/02-data-entry.md?raw';
import descriptive from '../../../docs/guide/11-descriptive.md?raw';
import exporting from '../../../docs/guide/14-export.md?raw';
import files from '../../../docs/guide/15-files.md?raw';
import formatting from '../../../docs/guide/13-formatting.md?raw';
import gettingStarted from '../../../docs/guide/01-getting-started.md?raw';
import graphs from '../../../docs/guide/12-graphs.md?raw';
import kruskal from '../../../docs/guide/08-kruskal-wallis.md?raw';
import nestedTables from '../../../docs/guide/17-nested-tables.md?raw';
import normality from '../../../docs/guide/10-normality.md?raw';
import oneWay from '../../../docs/guide/07-one-way-anova.md?raw';
import rankTests from '../../../docs/guide/06-rank-tests.md?raw';
import repeatedMeasures from '../../../docs/guide/18-repeated-measures.md?raw';
import repeatedTwoWay from '../../../docs/guide/19-repeated-two-way.md?raw';
import repeatedTwoWayBoth from '../../../docs/guide/20-repeated-two-way-both.md?raw';
import shortcuts from '../../../docs/guide/16-shortcuts.md?raw';
import tables from '../../../docs/guide/03-tables.md?raw';
import tTests from '../../../docs/guide/05-t-tests.md?raw';
import twoWay from '../../../docs/guide/09-two-way-anova.md?raw';
import xyTables from '../../../docs/guide/22-xy-tables.md?raw';

import type { UserAnalysisKind } from '@/model/project';

import { markdownTitle } from './markdown';

export interface GuidePage {
  /** File stem, which is also what links between pages use. */
  readonly id: string;
  readonly title: string;
  readonly markdown: string;
}

function page(id: string, markdown: string): GuidePage {
  return { id, title: markdownTitle(markdown) ?? id, markdown };
}

/**
 * The user guide (item 07, #34), in reading order. The pages live in
 * `docs/guide` so they read on GitHub as well; this module is the app's
 * view of them, as in PlasmidPop.
 */
export const GUIDE: readonly GuidePage[] = [
  page('01-getting-started', gettingStarted),
  page('02-data-entry', dataEntry),
  page('03-tables', tables),
  page('04-choosing-a-test', choosing),
  page('05-t-tests', tTests),
  page('06-rank-tests', rankTests),
  page('07-one-way-anova', oneWay),
  page('08-kruskal-wallis', kruskal),
  page('09-two-way-anova', twoWay),
  page('10-normality', normality),
  page('11-descriptive', descriptive),
  page('12-graphs', graphs),
  page('13-formatting', formatting),
  page('14-export', exporting),
  page('15-files', files),
  page('16-shortcuts', shortcuts),
  page('17-nested-tables', nestedTables),
  page('18-repeated-measures', repeatedMeasures),
  page('19-repeated-two-way', repeatedTwoWay),
  page('20-repeated-two-way-both', repeatedTwoWayBoth),
  page('21-contingency-tables', contingencyTables),
  page('22-xy-tables', xyTables),
];

export function guidePage(id: string): GuidePage | undefined {
  return GUIDE.find((p) => p.id === id);
}

/** Each analysis's page, for "How to read these results" on its results sheet. */
export const ANALYSIS_PAGE: Readonly<Record<UserAnalysisKind, string>> = {
  descriptive: '11-descriptive',
  'nested-descriptive': '17-nested-tables',
  't-test': '05-t-tests',
  'nested-t-test': '17-nested-tables',
  'nested-one-way-anova': '17-nested-tables',
  'nested-repeated-anova': '17-nested-tables',
  'rank-test': '06-rank-tests',
  'one-way-anova': '07-one-way-anova',
  'kruskal-wallis': '08-kruskal-wallis',
  'two-way-anova': '09-two-way-anova',
  'repeated-measures-anova': '18-repeated-measures',
  'repeated-two-way-anova': '19-repeated-two-way',
  'repeated-two-way-anova-both': '20-repeated-two-way-both',
  friedman: '18-repeated-measures',
  normality: '10-normality',
  'nested-normality': '17-nested-tables',
  'paired-normality': '10-normality',
  'contingency-chi-square': '21-contingency-tables',
  'contingency-fisher': '21-contingency-tables',
  correlation: '22-xy-tables',
  'linear-regression': '22-xy-tables',
  'nonlinear-regression': '22-xy-tables',
};
