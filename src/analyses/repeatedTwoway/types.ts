/**
 * Repeated-measures two-way ANOVA, one factor repeated (item 22, #81),
 * and its comparisons (item 24, #85): request and result.
 */
import type { RepeatedTwoWayOptions } from '@/model/project';

import type { PairComparison } from '../oneway/types';
import type { Named } from '../ttest/types';

export interface RepeatedTwoWayRequest {
  /** The row factor's levels (rows without any kept subject are left out). */
  readonly rows: readonly Named[];
  /** The column factor's levels: the data sets. */
  readonly columns: readonly Named[];
  readonly options: RepeatedTwoWayOptions;
  /** One entry per kept subject: its between-level index (0-based) and its values, repeated-level order. */
  readonly subjects: readonly { readonly level: number; readonly values: readonly number[] }[];
  readonly droppedSubjects: number;
  /**
   * The control's position (0-based) among whichever levels the chosen
   * family compares (between-subjects levels for `main-between` and
   * `simple`, repeated levels for `main-repeated`); null otherwise.
   */
  readonly control: number | null;
}

/** SS/df/MS, and F/P where the term is tested (the descriptive `subjects` term has neither). */
export interface RepeatedTwoWayTerm {
  readonly ss: number;
  readonly df: number;
  readonly ms: number;
  readonly f: number | null;
  readonly p: number | null;
}

export interface RepeatedTwoWayResult {
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  readonly options: RepeatedTwoWayOptions;
  /** Number of between-levels kept (rows, or data sets when `repeatedFactor` is `'row'`). */
  readonly betweenLevels: number;
  /** Number of repeated levels (data sets, or rows when `repeatedFactor` is `'row'`). */
  readonly repeatedLevels: number;
  readonly n: number;
  readonly droppedSubjects: number;
  /** The between-subjects factor (not repeated): tested against `subjects`. */
  readonly between: RepeatedTwoWayTerm;
  /** Subjects within the between factor: descriptive only, the error term for `between`. */
  readonly subjects: RepeatedTwoWayTerm;
  /** The repeated factor's main effect: tested against `residual`, GG/HF-corrected. */
  readonly repeated: RepeatedTwoWayTerm;
  readonly interaction: RepeatedTwoWayTerm;
  /** The repeated factor × subject error term, shared by `repeated` and `interaction`. */
  readonly residual: { readonly ss: number; readonly df: number; readonly ms: number };
  readonly total: { readonly ss: number; readonly df: number };
  /** Shared by `repeated` and `interaction` (one pooled within-subject covariance structure). */
  readonly ggEpsilon: number;
  readonly hfEpsilon: number;
  readonly repeatedGgP: number;
  readonly repeatedHfP: number;
  readonly interactionGgP: number;
  readonly interactionHfP: number;
  /**
   * Comparisons (item 24, #85): one family for `main-between`/
   * `main-repeated` (`level` null, no natural level to group by, same as
   * `TwoWayResult`'s `main-columns`/`main-rows`), one per repeated level
   * for `simple` (`level` names it). Empty when `options.comparisons.kind`
   * is `'none'`.
   */
  readonly families: readonly {
    readonly label: string | null;
    readonly level: Named | null;
    readonly pairs: readonly PairComparison[];
  }[];
  readonly warnings: readonly string[];
}
