/** Two-way ANOVA with multiple comparisons (item 06, #27): request and result. */
import type { TwoWayOptions } from '@/model/project';

import type { PairComparison } from '../oneway/types';
import type { Named } from '../ttest/types';

export type TwoWayData =
  | {
      readonly kind: 'values';
      readonly y: readonly number[];
      /** Each value's row and column, 1-based. */
      readonly ri: readonly number[];
      readonly ci: readonly number[];
    }
  | {
      readonly kind: 'summary';
      /** One entry per cell. */
      readonly means: readonly number[];
      readonly sds: readonly number[];
      readonly ns: readonly number[];
      readonly ri: readonly number[];
      readonly ci: readonly number[];
    };

export interface TwoWayRequest {
  /** The row factor's levels (rows without any value are left out). */
  readonly rows: readonly Named[];
  /** The column factor's levels: the data sets. */
  readonly columns: readonly Named[];
  readonly options: TwoWayOptions;
  readonly data: TwoWayData;
  /** The control's position within its family (0-based). */
  readonly control: number | null;
  /** Rows of the table left out because they have no values. */
  readonly emptyRows: number;
  /** Empty or excluded replicate cells left out. */
  readonly droppedValues: number;
}

export interface TwoWayTerm {
  readonly ss: number;
  readonly df: number;
  readonly ms: number;
  readonly f: number;
  readonly p: number;
  /** SS of the term as a percentage of the total SS (Prism's "% of total variation"). */
  readonly percent: number;
}

export interface TwoWayResult {
  readonly from: 'values' | 'summary';
  /** With the interaction, or main effects only. */
  readonly model: 'full' | 'main-effects';
  /** Why main effects only: an empty cell, or one value per cell. */
  readonly why: 'empty-cell' | 'no-replicates' | null;
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  readonly nTotal: number;
  readonly interaction: TwoWayTerm | null;
  readonly row: TwoWayTerm;
  readonly column: TwoWayTerm;
  readonly residual: { readonly ss: number; readonly df: number; readonly ms: number };
  readonly total: { readonly ss: number; readonly df: number };
  /** `cells[r][c]`: n, mean and SD of each cell; null where not defined. */
  readonly cells: readonly (readonly {
    readonly n: number;
    readonly mean: number | null;
    readonly sd: number | null;
  }[])[];
  readonly options: TwoWayOptions;
  /** One family per row or column, or one for main effects and all cells. `label` names the row or column. */
  readonly families: readonly {
    readonly label: string | null;
    readonly pairs: readonly PairComparison[];
  }[];
  /** Why comparisons asked for are not available. */
  readonly comparisonsNote: 'empty-cell' | 'no-replicates' | null;
  readonly emptyRows: number;
  readonly droppedValues: number;
  readonly warnings: readonly string[];
}
