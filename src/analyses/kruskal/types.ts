/** Kruskal-Wallis test with Dunn's comparisons (item 06, #26): request and result. */
import type { KruskalWallisOptions } from '@/model/project';
import type { Dropped } from '@/model/selectors';

import type { Named } from '../ttest/types';

export interface KruskalWallisRequest {
  readonly groups: readonly Named[];
  readonly options: KruskalWallisOptions;
  readonly values: readonly (readonly number[])[];
  /** The control's position among the groups (0-based). */
  readonly control: number | null;
  readonly dropped: readonly (Dropped | null)[];
}

export interface RankGroup extends Named {
  readonly n: number;
  readonly median: number;
  readonly rankSum: number;
  readonly meanRank: number;
  readonly dropped: Dropped | null;
}

/** One of Dunn's comparisons, "A vs. B": diff = mean rank A − mean rank B. */
export interface DunnComparison {
  readonly a: Named;
  readonly b: Named;
  readonly diff: number;
  readonly z: number;
  readonly pUnadjusted: number;
  /** Multiplied by the number of comparisons and capped at 1, unless uncorrected. */
  readonly p: number;
}

export interface KruskalWallisResult {
  readonly groups: readonly RankGroup[];
  readonly h: number;
  readonly df: number;
  /** Exact (counted over every way to share out the ranks), or from the chi-square approximation. */
  readonly p: number;
  /** Whether P is exact: small samples, note 07. */
  readonly exact: boolean;
  readonly comparisons: KruskalWallisOptions['comparisons'];
  readonly corrected: boolean;
  readonly pairs: readonly DunnComparison[];
  readonly warnings: readonly string[];
}
